import test from "node:test";
import assert from "node:assert/strict";

import {
  createDefaultComposition,
  decodeComposition,
  encodeComposition,
} from "./composition.js";
import {
  GRAVITY_SOFTENING,
  PhysicsEngine,
  createInitialPhysicsState,
  orbitPathForBody,
} from "./physicsEngine.js";
import {
  SATELLITE_SOFTENING_CLEARANCE,
  birthSatelliteFromRadialLaunch,
  satelliteStabilityBand,
} from "./satelliteBirth.js";
import {
  BIRTH_MAX_RADIUS,
  BIRTH_MIN_RADIUS,
  PLANET_ORBIT_MIN_GAP,
  birthBodyFromRadialLaunch,
} from "./starBirth.js";
import {
  buildResonanceBridge,
  editorialCameraDistance,
  moonCameraDistance,
  moonGuidance,
  reduceSoundflightState,
  createSoundflightState,
  instrumentGuidanceDetail,
  instrumentHint,
  shouldAdvancePhysics,
} from "./soundflight.js";

function liveDefault() {
  const composition = createDefaultComposition();
  const engine = new PhysicsEngine(createInitialPhysicsState(composition.bodies));
  return { composition, engine };
}

test("a selected planet exposes a finite stable annulus inside its Hill sphere", () => {
  const { engine } = liveDefault();
  const band = satelliteStabilityBand({
    parent: engine.getBody("europa"),
    star: engine.getBody("star"),
  });

  assert.ok(band.hillRadius > 0);
  assert.ok(band.innerRadius >= GRAVITY_SOFTENING * SATELLITE_SOFTENING_CLEARANCE);
  assert.ok(band.outerRadius > band.innerRadius);
  assert.ok(band.outerRadius < band.hillRadius * 0.5);
});

test("even the lightest innermost user-created planet has a real stable moon orbit", () => {
  const engine = new PhysicsEngine(createInitialPhysicsState([]));
  const star = engine.getBody("star");
  const planet = birthBodyFromRadialLaunch({
    release: { x: BIRTH_MIN_RADIUS, y: 0 },
    star,
    existingIds: [],
    existingBodies: [],
    birthIndex: 0,
  });
  engine.addBody(planet);
  const parent = engine.getBody(planet.id);
  const band = satelliteStabilityBand({ parent, star: engine.getBody("star") });
  const moon = birthSatelliteFromRadialLaunch({
    release: { x: parent.x + (band.innerRadius + band.outerRadius) / 2, y: parent.y },
    parent,
    star: engine.getBody("star"),
    existingBodies: engine.state.bodies,
  });
  engine.addBody(moon);

  let minimum = Infinity;
  let maximum = 0;
  for (let step = 0; step < 1_200; step += 1) {
    engine.step();
    const liveMoon = engine.getBody(moon.id);
    const liveParent = engine.getBody(parent.id);
    const distance = Math.hypot(
      liveMoon.x - liveParent.x,
      liveMoon.y - liveParent.y,
    );
    minimum = Math.min(minimum, distance);
    maximum = Math.max(maximum, distance);
  }

  assert.ok(band.outerRadius > band.innerRadius);
  assert.ok(minimum > GRAVITY_SOFTENING * 1.2);
  assert.ok(maximum < band.hillRadius * 0.7);
});

test("planet launch keeps a continuous radius and gently clears occupied orbits", () => {
  const { engine } = liveDefault();
  const star = engine.getBody("star");
  const existingBodies = engine.state.bodies.filter((body) => body.kind === "planet");
  const target = existingBodies[1].semiMajor + 0.004;
  const world = birthBodyFromRadialLaunch({
    release: { x: target, y: 0 },
    star,
    existingIds: existingBodies.map((body) => body.id),
    existingBodies,
    birthIndex: 0,
  });

  const bornRadius = Math.hypot(world.x - star.x, world.y - star.y);
  assert.ok(existingBodies.every((body) => (
    Math.abs(body.semiMajor - bornRadius) >= PLANET_ORBIT_MIN_GAP - 1e-10
  )));
  assert.ok(bornRadius >= BIRTH_MIN_RADIUS && bornRadius <= BIRTH_MAX_RADIUS);
});

test("planet launch supports more than five distinct continuous orbits", () => {
  const { engine } = liveDefault();
  const star = engine.getBody("star");
  const existingBodies = Array.from({ length: 7 }, (_, index) => ({
    id: `occupied-${index}`,
    kind: "planet",
    semiMajor: BIRTH_MIN_RADIUS + index * PLANET_ORBIT_MIN_GAP,
    x: star.x + BIRTH_MIN_RADIUS + index * PLANET_ORBIT_MIN_GAP,
    y: star.y,
  }));

  const world = birthBodyFromRadialLaunch({
    release: { x: 0.51, y: 0 },
    star,
    existingIds: existingBodies.map((body) => body.id),
    existingBodies,
    birthIndex: 7,
  });

  assert.ok(Math.hypot(world.x - star.x, world.y - star.y) > 0.45);
});

test("a moon inherits its parent voice and is born on a deterministic local orbit", () => {
  const { engine } = liveDefault();
  const parent = engine.getBody("europa");
  const star = engine.getBody("star");
  const band = satelliteStabilityBand({ parent, star });
  const radius = (band.innerRadius + band.outerRadius) / 2;
  const moon = birthSatelliteFromRadialLaunch({
    release: { x: parent.x + radius, y: parent.y },
    parent,
    star,
    existingBodies: engine.state.bodies,
  });

  assert.equal(moon.id, "moon-europa-1");
  assert.equal(moon.kind, "moon");
  assert.equal(moon.parentId, "europa");
  assert.equal(moon.voice, parent.voice);
  assert.ok(moon.frequency > parent.frequency);
  assert.ok(Math.abs(Math.hypot(moon.x - parent.x, moon.y - parent.y) - radius) < 1e-10);

  const event = engine.addBody(moon);
  assert.equal(event.kind, "add-body");
  assert.equal(engine.getBody(moon.id).parentId, "europa");
  assert.equal(engine.getBody(moon.id).kind, "moon");
});

test("a planet accepts at most two moons and gently fits an outward drag into its stable annulus", () => {
  const { engine } = liveDefault();
  const parent = engine.getBody("io");
  const star = engine.getBody("star");
  const band = satelliteStabilityBand({ parent, star });

  const fitted = birthSatelliteFromRadialLaunch({
    release: { x: parent.x + band.outerRadius * 1.2, y: parent.y },
    parent,
    star,
    existingBodies: engine.state.bodies,
  });
  assert.ok(Math.abs(Math.hypot(fitted.x - parent.x, fitted.y - parent.y) - band.outerRadius) < 1e-10);

  for (const fraction of [0.38, 0.72]) {
    const radius = band.innerRadius + (band.outerRadius - band.innerRadius) * fraction;
    engine.addBody(birthSatelliteFromRadialLaunch({
      release: { x: parent.x + radius, y: parent.y },
      parent,
      star,
      existingBodies: engine.state.bodies,
    }));
  }

  assert.throws(() => birthSatelliteFromRadialLaunch({
    release: { x: parent.x + (band.innerRadius + band.outerRadius) / 2, y: parent.y },
    parent,
    star,
    existingBodies: engine.state.bodies,
  }), /two moons/i);
});

test("moon motion remains bounded around its live parent under the shared N-body integrator", () => {
  const { engine } = liveDefault();
  const parent = engine.getBody("callisto");
  const star = engine.getBody("star");
  const band = satelliteStabilityBand({ parent, star });
  const radius = band.innerRadius + (band.outerRadius - band.innerRadius) * 0.55;
  const moon = birthSatelliteFromRadialLaunch({
    release: { x: parent.x + radius, y: parent.y },
    parent,
    star,
    existingBodies: engine.state.bodies,
  });
  engine.addBody(moon);

  let minimum = Infinity;
  let maximum = 0;
  for (let step = 0; step < 2_400; step += 1) {
    engine.step();
    const liveMoon = engine.getBody(moon.id);
    const liveParent = engine.getBody(parent.id);
    const distance = Math.hypot(liveMoon.x - liveParent.x, liveMoon.y - liveParent.y);
    minimum = Math.min(minimum, distance);
    maximum = Math.max(maximum, distance);
  }

  assert.ok(minimum > band.innerRadius * 0.55);
  assert.ok(maximum < band.outerRadius * 1.45);
});

test("every playable body produces a closed orbital string around its physical focus", () => {
  const { engine } = liveDefault();
  const planet = engine.getBody("europa");
  const star = engine.getBody("star");
  const points = orbitPathForBody(planet, star, 96);

  assert.equal(points.length, 97);
  assert.ok(Math.hypot(points[0].x - points.at(-1).x, points[0].y - points.at(-1).y) < 1e-9);
  assert.ok(points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)));
});

test("only a real physical resonance creates a colored bridge", () => {
  const bodies = [
    { id: "io", voice: "earth" },
    { id: "europa", voice: "moon" },
    { id: "callisto", voice: "light" },
  ];
  assert.equal(buildResonanceBridge(bodies, null), null);
  assert.deepEqual(buildResonanceBridge(bodies, {
    label: "3:2",
    numerator: 3,
    denominator: 2,
    bodyIds: ["io", "europa"],
    strength: 0.82,
  }), {
    label: "3:2",
    numerator: 3,
    denominator: 2,
    bodyIds: ["io", "europa"],
    colors: [0x72edff, 0xffc66d],
    strength: 0.82,
  });
});

test("moon creation is an explicit cancellable interaction with concise guidance", () => {
  const initial = createSoundflightState();
  const creatingMoon = reduceSoundflightState(initial, { type: "ARM_MOON", bodyId: "europa" });
  assert.deepEqual(creatingMoon, { mode: "moon", followingBodyId: "europa" });
  assert.deepEqual(reduceSoundflightState(creatingMoon, {
    type: "COMPLETE_MOON",
    bodyId: "moon-europa-1",
  }), initial);
  assert.deepEqual(moonGuidance("armed"), {
    eyebrow: "ADD A MOON",
    title: "DRAG FROM EUROPA TO ITS HALO",
    detail: "Release anywhere inside the glowing orbit",
  });
  assert.throws(() => reduceSoundflightState(initial, { type: "ARM_MOON" }), /requires a bodyId/i);
});

test("composition camera distance grows with the system and with a portrait viewport", () => {
  assert.equal(editorialCameraDistance(0, 16 / 9), 8.4);
  assert.ok(editorialCameraDistance(6, 16 / 9) > editorialCameraDistance(3, 16 / 9));
  assert.ok(editorialCameraDistance(5, 0.55) > editorialCameraDistance(5, 16 / 9));
});

test("an active direct creation gesture freezes the system and uses a bounded local camera", () => {
  assert.equal(shouldAdvancePhysics({ isPlaying: true, interactionMode: "compose" }), true);
  assert.equal(shouldAdvancePhysics({ isPlaying: true, interactionMode: "compose", creationActive: true }), false);
  assert.equal(shouldAdvancePhysics({ isPlaying: false, interactionMode: "compose" }), false);

  const landscapeDistance = moonCameraDistance(1.2, 16 / 9);
  const portraitDistance = moonCameraDistance(1.2, 390 / 844);
  assert.ok(landscapeDistance >= 4.8);
  assert.ok(landscapeDistance <= 8.8);
  assert.ok(portraitDistance > landscapeDistance);
});

test("one contextual sentence teaches the next literal gesture", () => {
  assert.equal(instrumentHint({ planetCount: 0 }), "DRAG FROM THE STAR TO MAKE A PLANET");
  assert.equal(
    instrumentGuidanceDetail({ planetCount: 0 }),
    "PULL OUTWARD · RELEASE TO HEAR A WORLD",
  );
  assert.equal(instrumentHint({
    planetCount: 2,
    selectedBody: { kind: "planet" },
    selectedMoonCount: 0,
  }), "TOUCH A GLOWING ORBIT");
  assert.equal(instrumentGuidanceDetail({
    planetCount: 2,
    selectedBody: { kind: "planet" },
    selectedMoonCount: 0,
  }), "SWIPE ACROSS MORE ORBITS TO PLAY A CHORD");
  assert.equal(instrumentHint({
    planetCount: 2,
    hasPluckedOrbit: true,
  }), "PLAY THE LIGHT THEREMIN");
  assert.equal(instrumentGuidanceDetail({
    planetCount: 2,
    hasPluckedOrbit: true,
  }), "HOLD EMPTY SPACE · THEN MOVE");
  assert.equal(instrumentHint({
    planetCount: 2,
    hasPluckedOrbit: true,
    thereminPhase: "arming",
  }), "KEEP HOLDING");
  assert.equal(instrumentGuidanceDetail({
    planetCount: 2,
    hasPluckedOrbit: true,
    thereminPhase: "arming",
  }), "A LIGHT IS FORMING");
  assert.equal(instrumentHint({
    planetCount: 2,
    hasPluckedOrbit: true,
    thereminPhase: "active",
  }), "BEND THE NOTE");
  assert.equal(instrumentGuidanceDetail({
    planetCount: 2,
    hasPluckedOrbit: true,
    thereminPhase: "active",
  }), "LEFT–RIGHT = PITCH · UP–DOWN = POWER");
  assert.equal(instrumentHint({
    planetCount: 2,
    hasPluckedOrbit: true,
    hasPlayedTheremin: true,
  }), "FLY TO THE MILKY WAY");
  assert.equal(instrumentGuidanceDetail({
    planetCount: 2,
    hasPluckedOrbit: true,
    hasPlayedTheremin: true,
  }), "TAP MILKY WAY TO FLY");
  assert.equal(instrumentHint({
    planetCount: 2,
    selectedBody: { kind: "moon" },
    selectedMoonCount: 0,
    isListener: true,
  }), "TOUCH A GLOWING ORBIT");
  assert.equal(instrumentGuidanceDetail({
    planetCount: 2,
    selectedBody: { kind: "moon" },
    isListener: true,
  }), "SWIPE ACROSS ORBITS TO PLAY THE COMPOSITION");
});

test("a moon birth survives the share format and listener replay contract", () => {
  const { composition, engine } = liveDefault();
  const parent = engine.getBody("europa");
  const star = engine.getBody("star");
  const band = satelliteStabilityBand({ parent, star });
  const moon = birthSatelliteFromRadialLaunch({
    release: { x: parent.x + (band.innerRadius + band.outerRadius) / 2, y: parent.y },
    parent,
    star,
    existingBodies: engine.state.bodies,
  });
  const event = engine.addBody(moon);
  const encoded = encodeComposition({
    ...composition,
    duration: 12,
    events: [{ ...event, at: 1 }],
  });
  const decoded = decodeComposition(encoded);

  assert.equal(decoded.format, "tau-record/6");
  assert.equal(decoded.events[0].body.kind, "moon");
  assert.equal(decoded.events[0].body.parentId, "europa");
});
