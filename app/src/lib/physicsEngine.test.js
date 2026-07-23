import test from "node:test";
import assert from "node:assert/strict";

import {
  FIXED_STEP,
  MAX_WORLDS,
  PHYSICS_MODEL,
  PhysicsEngine,
  computeAccelerations,
  computeWeakFieldClockRate,
  createInitialPhysicsState,
  dopplerFactor,
  findClosestResonance,
  physicalMassForDisplay,
  totalEnergy,
} from "./physicsEngine.js";
import { createDefaultComposition } from "./composition.js";
import {
  BIRTH_MIN_RADIUS,
  PLANET_ORBIT_MIN_GAP,
  birthBodyFromGesture,
  birthBodyFromRadialLaunch,
} from "./starBirth.js";

function birthSpec(engine, overrides = {}) {
  const star = engine.getBody("star");
  return birthBodyFromGesture({
    press: { x: star.x + 0.34, y: star.y - 0.12 },
    aim: null,
    holdSeconds: 0.6,
    star,
    existingIds: engine.state.bodies.filter((body) => body.kind === "planet").map((body) => body.id),
    birthIndex: 0,
    ...overrides,
  });
}

test("pairwise gravity accelerates both bodies toward each other", () => {
  const bodies = [
    { id: "left", mass: 2, x: -1, y: 0 },
    { id: "right", mass: 3, x: 1, y: 0 },
  ];

  const acceleration = computeAccelerations(bodies, { gravitationalConstant: 1, softening: 0 });

  assert.ok(acceleration[0].x > 0);
  assert.ok(acceleration[1].x < 0);
  assert.equal(acceleration[0].y, 0);
  assert.equal(acceleration[1].y, 0);
  assert.ok(Math.abs(bodies[0].mass * acceleration[0].x + bodies[1].mass * acceleration[1].x) < 1e-12);
});

test("weak-field proper time slows with deeper potential and higher speed", () => {
  const quiet = computeWeakFieldClockRate({ potential: -0.01, speedSquared: 0.005 });
  const deepAndFast = computeWeakFieldClockRate({ potential: -0.03, speedSquared: 0.02 });

  assert.ok(deepAndFast.feltRate < quiet.feltRate);
  assert.ok(deepAndFast.rawLoss > quiet.rawLoss);
  assert.ok(deepAndFast.feltRate >= 0.94);
});

test("relativistic Doppler mapping raises approaching pitch and lowers receding pitch", () => {
  assert.ok(dopplerFactor(0.4) > 1);
  assert.ok(dopplerFactor(-0.4) < 1);
  assert.equal(dopplerFactor(0), 1);
});

test("a 3:2 orbital chain is detected without hidden quantization", () => {
  const resonance = findClosestResonance([
    { id: "io", period: 10.8 },
    { id: "europa", period: 16.2 },
    { id: "callisto", period: 24.3 },
  ]);

  assert.equal(resonance.label, "3:2");
  assert.deepEqual(resonance.bodyIds, ["io", "europa"]);
  assert.ok(resonance.strength > 0.99);
});

test("the authored default opens inside a real 3:2 resonance", () => {
  const engine = new PhysicsEngine(createInitialPhysicsState(createDefaultComposition().bodies));
  const resonance = engine.getResonance();

  assert.equal(resonance?.label, "3:2");
  assert.ok(resonance.strength > 0.9);
});

test("fixed-step velocity Verlet keeps the default system bounded and nearly energy-conserving", () => {
  const initial = createInitialPhysicsState(createDefaultComposition().bodies);
  const engine = new PhysicsEngine(initial);
  const energyAtStart = totalEnergy(engine.snapshot().bodies);

  for (let index = 0; index < Math.round(64 / FIXED_STEP); index += 1) engine.step();

  const end = engine.snapshot();
  const energyAtEnd = totalEnergy(end.bodies);
  const relativeDrift = Math.abs((energyAtEnd - energyAtStart) / energyAtStart);

  assert.ok(relativeDrift < 0.004, `energy drift was ${relativeDrift}`);
  assert.ok(end.bodies.every((body) => Number.isFinite(body.x) && Number.isFinite(body.properTime)));
  assert.ok(end.bodies.every((body) => Math.hypot(body.x, body.y) < 1.5));
});

test("velocity Verlet advances symmetric x and y acceleration without directional bias", () => {
  const state = {
    model: PHYSICS_MODEL,
    time: 0,
    bodies: [
      {
        id: "star",
        kind: "star",
        sprite: 0,
        mass: 1,
        displayMass: 1,
        frequency: 55,
        pan: 0,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        properTime: 0,
        properRate: 1,
        rawClockLoss: 0,
        potential: 0,
        period: null,
        semiMajor: 0,
        eccentricity: 0,
        doppler: 1,
      },
      {
        id: "io",
        kind: "planet",
        sprite: 1,
        mass: 0.002,
        displayMass: 0.7,
        frequency: 220,
        pan: 0,
        x: 0.3,
        y: 0.3,
        vx: 0,
        vy: 0,
        properTime: 0,
        properRate: 1,
        rawClockLoss: 0,
        potential: 0,
        period: 10,
        semiMajor: 0.42,
        eccentricity: 0,
        doppler: 1,
      },
    ],
  };
  const engine = new PhysicsEngine(state);

  engine.step();

  const planet = engine.getBody("io");
  assert.ok(Math.abs(planet.vx - planet.vy) < 1e-12, `velocity was (${planet.vx}, ${planet.vy})`);
});

test("the same fixed-step gesture event produces the same replay state", () => {
  const initial = createInitialPhysicsState(createDefaultComposition().bodies);
  const first = new PhysicsEngine(initial);
  const second = new PhysicsEngine(initial);
  let recordedEvent;

  for (let index = 0; index < 720; index += 1) {
    if (index === 240) {
      recordedEvent = first.setBodyState("europa", {
        x: 0.31,
        y: -0.08,
        vx: 0.014,
        vy: 0.119,
      });
      second.applyEvent(recordedEvent);
    }
    first.step();
    second.step();
  }

  assert.deepEqual(second.snapshot(), first.snapshot());
});

test("a born world joins the ensemble with live orbital elements and a replayable event", () => {
  const engine = new PhysicsEngine(createInitialPhysicsState(createDefaultComposition().bodies));
  const spec = birthSpec(engine);

  const event = engine.addBody(spec);
  const born = engine.getBody(spec.id);

  assert.equal(event.kind, "add-body");
  assert.equal(event.body.id, spec.id);
  assert.equal(engine.state.bodies.filter((body) => body.kind === "planet").length, 4);
  assert.equal(born.kind, "planet");
  assert.equal(born.displayMass, spec.mass);
  assert.ok(born.mass < spec.mass, "physical mass must use the planet mass scale");
  assert.ok(Number.isFinite(born.period) && born.period > 0);
  assert.ok(Number.isFinite(born.properRate) && born.properRate <= 1);
});

test("display size never turns a planet or moon into an unrealistically heavy world", () => {
  assert.ok(physicalMassForDisplay(1.18, "planet") < 0.00002);
  assert.ok(physicalMassForDisplay(0.04, "moon") < physicalMassForDisplay(0.34, "planet") * 0.02);
});

test("shared legacy state is recalibrated to the current physical mass model", () => {
  const state = createInitialPhysicsState(createDefaultComposition().bodies);
  const europa = state.bodies.find((body) => body.id === "europa");
  europa.mass = 0.0028 * europa.displayMass;

  const engine = new PhysicsEngine(state);

  assert.equal(engine.getBody("europa").mass, physicalMassForDisplay(europa.displayMass, "planet"));
});

test("a densely authored solar system keeps separate, nearly circular orbits", () => {
  const engine = new PhysicsEngine(createInitialPhysicsState([]));

  for (let index = 0; index < 10; index += 1) {
    const star = engine.getBody("star");
    const planets = engine.state.bodies.filter((body) => body.kind === "planet");
    const radius = BIRTH_MIN_RADIUS + index * PLANET_ORBIT_MIN_GAP;
    const angle = index * 2.3999632297;
    const world = birthBodyFromRadialLaunch({
      release: {
        x: star.x + Math.cos(angle) * radius,
        y: star.y + Math.sin(angle) * radius,
      },
      star,
      existingIds: planets.map((body) => body.id),
      existingBodies: planets,
      birthIndex: index,
    });
    engine.addBody(world);
  }

  let closestApproach = Infinity;
  for (let step = 0; step < Math.round(64 / FIXED_STEP); step += 1) {
    engine.step();
    if (step % 30 !== 0) continue;
    const planets = engine.state.bodies.filter((body) => body.kind === "planet");
    for (let first = 0; first < planets.length; first += 1) {
      for (let second = first + 1; second < planets.length; second += 1) {
        closestApproach = Math.min(
          closestApproach,
          Math.hypot(planets[first].x - planets[second].x, planets[first].y - planets[second].y),
        );
      }
    }
  }

  const planets = engine.state.bodies.filter((body) => body.kind === "planet");
  assert.ok(closestApproach > 0.015, `closest approach was ${closestApproach}`);
  assert.ok(planets.every((body) => body.eccentricity < 0.12));
  assert.ok(planets.every((body) => body.semiMajor >= 0.12 && body.semiMajor <= 0.58));
});

test("birth and consumption events replay to the exact same physical state", () => {
  const initial = createInitialPhysicsState(createDefaultComposition().bodies);
  const live = new PhysicsEngine(initial);
  const replay = new PhysicsEngine(initial);
  let birthEvent;
  let removeEvent;

  for (let index = 0; index < 720; index += 1) {
    if (index === 180) {
      birthEvent = live.addBody(birthSpec(live));
      replay.applyEvent(birthEvent);
    }
    if (index === 540) {
      removeEvent = live.removeBody(birthEvent.body.id);
      replay.applyEvent(removeEvent);
    }
    live.step();
    replay.step();
  }

  assert.equal(birthEvent.kind, "add-body");
  assert.equal(removeEvent.kind, "remove-body");
  assert.equal(live.getBody(birthEvent.body.id), null);
  assert.deepEqual(replay.snapshot(), live.snapshot());
});

test("the engine refuses duplicate births, star removal, and an overfull sky", () => {
  const engine = new PhysicsEngine(createInitialPhysicsState(createDefaultComposition().bodies));
  const spec = birthSpec(engine);
  engine.addBody(spec);

  assert.throws(() => engine.addBody(spec), /duplicate/i);
  assert.throws(() => engine.removeBody("star"), /star/i);
  assert.throws(() => engine.removeBody("ghost-world"), /ghost-world/);

  const overflowSpec = { ...birthSpec(engine, { birthIndex: 9 }), id: "nova-99" };
  for (let index = 0; engine.state.bodies.filter((body) => body.kind === "planet").length < MAX_WORLDS; index += 1) {
    engine.addBody(birthSpec(engine, { birthIndex: index + 1 }));
  }
  assert.throws(() => engine.addBody(overflowSpec), /sky is full/i);
});

test("a radial gesture changes orbital scale while preserving a bound tangential orbit", () => {
  const engine = new PhysicsEngine(createInitialPhysicsState(createDefaultComposition().bodies));
  const star = engine.getBody("star");
  const before = engine.getBody("io").period;
  const event = engine.setOrbitFromGesture("io", {
    x: star.x + 0.41,
    y: star.y,
    velocityScale: 1,
  });
  const after = engine.getBody("io");

  assert.equal(event.kind, "set-body-state");
  assert.ok(after.period > before);
  assert.ok(after.eccentricity < 0.1);
  assert.ok(Number.isFinite(after.vy));
});
