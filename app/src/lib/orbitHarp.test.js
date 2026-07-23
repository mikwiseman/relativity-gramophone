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
  birthSatelliteFromRadialLaunch,
  satelliteStabilityBand,
} from "./satelliteBirth.js";
import {
  MUSICAL_ORBIT_RADII,
  birthBodyFromRadialLaunch,
} from "./starBirth.js";
import {
  buildResonanceBridge,
  editorialCameraDistance,
  moonCameraDistance,
  moonGuidance,
  reduceSoundflightState,
  createSoundflightState,
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
  assert.ok(band.innerRadius >= GRAVITY_SOFTENING * 3);
  assert.ok(band.outerRadius > band.innerRadius);
  assert.ok(band.outerRadius < band.hillRadius * 0.5);
});

test("planet launch chooses the nearest free musical string instead of stacking worlds", () => {
  const { engine } = liveDefault();
  const star = engine.getBody("star");
  const existingBodies = engine.state.bodies.filter((body) => body.kind === "planet");
  const occupied = existingBodies.map((body) => body.semiMajor);
  const target = MUSICAL_ORBIT_RADII.find((radius) => (
    occupied.some((current) => Math.abs(current - radius) < 0.01)
  ));
  const world = birthBodyFromRadialLaunch({
    release: { x: target, y: 0 },
    star,
    existingIds: existingBodies.map((body) => body.id),
    existingBodies,
    birthIndex: 0,
  });

  const bornRadius = Math.hypot(world.x - star.x, world.y - star.y);
  assert.ok(Math.abs(bornRadius - target) > 0.01, "an occupied string must not receive another planet");
  assert.ok(
    MUSICAL_ORBIT_RADII.some((radius) => Math.abs(radius - bornRadius) < 1e-10),
    "the world must still land on a tuned string",
  );
});

test("planet launch refuses when all five musical strings are occupied", () => {
  const { engine } = liveDefault();
  const star = engine.getBody("star");
  const existingBodies = MUSICAL_ORBIT_RADII.map((semiMajor, index) => ({
    id: `occupied-${index}`,
    kind: "planet",
    semiMajor,
    x: star.x + semiMajor,
    y: star.y,
  }));

  assert.throws(() => birthBodyFromRadialLaunch({
    release: { x: 0.4, y: 0 },
    star,
    existingIds: existingBodies.map((body) => body.id),
    existingBodies,
    birthIndex: 0,
  }), /five orbit strings/i);
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

test("a planet accepts at most two moons and rejects releases outside the stable annulus", () => {
  const { engine } = liveDefault();
  const parent = engine.getBody("io");
  const star = engine.getBody("star");
  const band = satelliteStabilityBand({ parent, star });

  assert.throws(() => birthSatelliteFromRadialLaunch({
    release: { x: parent.x + band.outerRadius * 1.2, y: parent.y },
    parent,
    star,
    existingBodies: engine.state.bodies,
  }), /stable ring/i);

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

test("moon placement freezes the system and uses a bounded local camera", () => {
  assert.equal(shouldAdvancePhysics({ isPlaying: true, interactionMode: "compose" }), true);
  assert.equal(shouldAdvancePhysics({ isPlaying: true, interactionMode: "moon" }), false);
  assert.equal(shouldAdvancePhysics({ isPlaying: false, interactionMode: "moon" }), false);

  const landscapeDistance = moonCameraDistance(1.2, 16 / 9);
  const portraitDistance = moonCameraDistance(1.2, 390 / 844);
  assert.ok(landscapeDistance >= 4.8);
  assert.ok(landscapeDistance <= 8.8);
  assert.ok(portraitDistance > landscapeDistance);
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
