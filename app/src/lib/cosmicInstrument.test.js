import assert from "node:assert/strict";
import test from "node:test";

import {
  COSMIC_DESTINATIONS,
  cosmicDestination,
  cosmicLandmarkById,
  cosmicJourneyForScale,
  cosmicLandmarksForScale,
  cathedralIntensity,
  cosmicScaleForView,
  cosmicScaleForDistance,
  memoryCometEnvelope,
  thereminParameters,
} from "./cosmicInstrument.js";

test("semantic zoom reveals a named musical scale instead of only a distance", () => {
  const orbit = cosmicScaleForDistance(4);
  const system = cosmicScaleForDistance(12);
  const neighborhood = cosmicScaleForDistance(27);
  const galaxy = cosmicScaleForDistance(50);
  const localGroup = cosmicScaleForDistance(63);
  const universe = cosmicScaleForDistance(72);

  assert.equal(orbit.id, "orbit");
  assert.equal(system.id, "system");
  assert.equal(neighborhood.id, "neighborhood");
  assert.equal(galaxy.id, "galaxy");
  assert.equal(localGroup.id, "localGroup");
  assert.equal(universe.id, "universe");
  assert.ok(orbit.systemMix > galaxy.systemMix);
  assert.ok(neighborhood.neighborhoodMix > system.neighborhoodMix);
  assert.ok(galaxy.galaxyMix > neighborhood.galaxyMix);
  assert.ok(localGroup.localGroupMix > galaxy.localGroupMix);
  assert.ok(universe.universeMix > localGroup.universeMix);
  assert.ok([orbit, system, neighborhood, galaxy, localGroup, universe].every((scale) => (
    scale.systemMix >= 0
    && scale.systemMix <= 1
    && scale.neighborhoodMix >= 0
    && scale.neighborhoodMix <= 1
    && scale.galaxyMix >= 0
    && scale.galaxyMix <= 1
    && scale.localGroupMix >= 0
    && scale.localGroupMix <= 1
    && scale.universeMix >= 0
    && scale.universeMix <= 1
  )));
});

test("authored cosmic destinations make every world reachable in one action", () => {
  const ids = ["system", "neighborhood", "galaxy", "localGroup", "universe"];
  assert.deepEqual(Object.keys(COSMIC_DESTINATIONS), ids);

  for (const id of ids) {
    const destination = cosmicDestination(id);
    assert.equal(destination.id, id);
    assert.equal(cosmicScaleForDistance(destination.distance).id, id);
    assert.ok(destination.distance >= 3.2 && destination.distance <= 72);
    assert.ok(destination.measure.length > 0);
  }

  assert.throws(() => cosmicDestination("nowhere"), /unknown cosmic destination/i);
});

test("an authored return stays in the system even when a large composition needs more camera room", () => {
  assert.equal(cosmicScaleForDistance(22.55).id, "neighborhood");
  assert.equal(cosmicScaleForView(22.55, "system").id, "system");
  assert.equal(cosmicScaleForView(22.55, null).id, "neighborhood");
  assert.throws(() => cosmicScaleForView(22.55, "unknown"), /unknown authored cosmic destination/i);
});

test("the child-facing journey always exposes one next world and one way home", () => {
  assert.deepEqual(cosmicJourneyForScale("orbit"), {
    outward: COSMIC_DESTINATIONS.neighborhood,
    home: null,
  });
  assert.deepEqual(cosmicJourneyForScale("system"), {
    outward: COSMIC_DESTINATIONS.neighborhood,
    home: null,
  });
  assert.deepEqual(cosmicJourneyForScale("neighborhood"), {
    outward: COSMIC_DESTINATIONS.galaxy,
    home: COSMIC_DESTINATIONS.system,
  });
  assert.deepEqual(cosmicJourneyForScale("galaxy"), {
    outward: COSMIC_DESTINATIONS.localGroup,
    home: COSMIC_DESTINATIONS.system,
  });
  assert.deepEqual(cosmicJourneyForScale("localGroup"), {
    outward: COSMIC_DESTINATIONS.universe,
    home: COSMIC_DESTINATIONS.system,
  });
  assert.deepEqual(cosmicJourneyForScale("universe"), {
    outward: null,
    home: COSMIC_DESTINATIONS.system,
  });
  assert.throws(() => cosmicJourneyForScale("nowhere"), /unknown cosmic scale/i);
});

test("real cosmic landmarks are sparse, playable, and bound to one semantic world", () => {
  const neighborhood = cosmicLandmarksForScale("neighborhood");
  const galaxy = cosmicLandmarksForScale("galaxy");
  const localGroup = cosmicLandmarksForScale("localGroup");
  const universe = cosmicLandmarksForScale("universe");
  const all = [...neighborhood, ...galaxy, ...localGroup, ...universe];

  assert.ok(neighborhood.some((landmark) => landmark.id === "proxima-centauri"));
  assert.ok(galaxy.some((landmark) => landmark.id === "galactic-centre"));
  assert.ok(localGroup.some((landmark) => landmark.id === "milky-way"));
  assert.ok(localGroup.some((landmark) => landmark.id === "andromeda"));
  assert.ok(universe.some((landmark) => landmark.id === "cosmic-web"));
  assert.ok([neighborhood, galaxy, localGroup, universe].every((landmarks) => landmarks.length <= 4));
  assert.ok(
    neighborhood.every((landmark) => Math.hypot(landmark.position[0], landmark.position[2]) <= 6.2),
    "nearby stars must remain playable in a narrow portrait viewport",
  );
  assert.equal(new Set(all.map((landmark) => landmark.id)).size, all.length);
  assert.ok(all.every((landmark) => (
    landmark.scale
    && landmark.name
    && landmark.detail
    && landmark.voice
    && Number.isFinite(landmark.frequency)
    && landmark.frequency > 0
    && Array.isArray(landmark.position)
    && landmark.position.length === 3
    && landmark.position.every(Number.isFinite)
  )));
  assert.throws(() => cosmicLandmarksForScale("system"), /does not have cosmic landmarks/i);
  assert.equal(cosmicLandmarkById("andromeda").scale, "localGroup");
  assert.throws(() => cosmicLandmarkById("imaginary-galaxy"), /unknown cosmic landmark/i);
});

test("the gravitational theremin is continuous, monophonic, and safely bounded", () => {
  const low = thereminParameters({ x: 0, y: 600, width: 1000, height: 600 });
  const middle = thereminParameters({ x: 500, y: 300, width: 1000, height: 600 });
  const high = thereminParameters({ x: 1000, y: 0, width: 1000, height: 600 });

  assert.equal(low.frequency, 110);
  assert.ok(Math.abs(middle.frequency - Math.sqrt(110 * 880)) < 0.01);
  assert.equal(high.frequency, 880);
  assert.equal(low.pan, -1);
  assert.equal(high.pan, 1);
  assert.ok(low.gain < middle.gain && middle.gain < high.gain);
  assert.ok([low, middle, high].every((voice) => (
    voice.gain > 0
    && voice.gain <= 0.065
    && voice.cutoff >= 700
    && voice.cutoff <= 7200
  )));
});

test("the resonance cathedral appears only for a strong real lock", () => {
  assert.equal(cathedralIntensity(null, 4), 0);
  assert.equal(cathedralIntensity({ strength: 0.97, bodyIds: ["a"] }, 4), 0);
  assert.equal(cathedralIntensity({ strength: 0.79, bodyIds: ["a", "b"] }, 4), 0);
  assert.ok(cathedralIntensity({ strength: 0.9, bodyIds: ["a", "b"] }, 4) > 0);
  assert.equal(cathedralIntensity({ strength: 1.8, bodyIds: ["a", "b"] }, 8), 1);
});

test("one memory comet has a calm attack, long flight, and complete release", () => {
  const before = memoryCometEnvelope(-0.1);
  const birth = memoryCometEnvelope(0.08);
  const flight = memoryCometEnvelope(0.5);
  const release = memoryCometEnvelope(0.92);
  const after = memoryCometEnvelope(1.2);

  assert.equal(before.visible, false);
  assert.equal(after.visible, false);
  assert.equal(birth.visible, true);
  assert.equal(flight.visible, true);
  assert.equal(release.visible, true);
  assert.ok(birth.opacity < flight.opacity);
  assert.ok(release.opacity < flight.opacity);
  assert.ok(birth.orbitMix > flight.orbitMix);
  assert.ok(release.galaxyMix > flight.galaxyMix);
});
