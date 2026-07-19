import test from "node:test";
import assert from "node:assert/strict";

import {
  FIXED_STEP,
  PhysicsEngine,
  computeAccelerations,
  computeWeakFieldClockRate,
  createInitialPhysicsState,
  dopplerFactor,
  findClosestResonance,
  totalEnergy,
} from "./physicsEngine.js";
import { createDefaultComposition } from "./composition.js";

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
