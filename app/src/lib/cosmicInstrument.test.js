import assert from "node:assert/strict";
import test from "node:test";

import { systemVoiceFrequencies } from "./cosmicAtlas.js";
import {
  COSMIC_DESTINATIONS,
  cosmicDestination,
  cosmicLandmarkById,
  cosmicJourneyForScale,
  cosmicLandmarksForScale,
  orbitalSonificationFrequency,
  cathedralIntensity,
  cosmicScaleForView,
  cosmicScaleForDistance,
  memoryCometEnvelope,
  landmarkPlacement,
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

test("every named field fills the frame the camera really has, on a laptop and on a phone", () => {
  for (const scaleId of ["neighborhood", "localGroup", "universe"]) {
  const neighborhood = cosmicLandmarksForScale(scaleId);
  const distance = COSMIC_DESTINATIONS[scaleId].distance;

  for (const [aspect, fovDegrees] of [[1.6, 42], [390 / 844, 55], [1, 42]]) {
    const halfHeight = Math.tan((fovDegrees * Math.PI) / 360) * distance;
    const halfWidth = halfHeight * aspect;
    const placed = neighborhood.map((landmark) => landmarkPlacement({
      slot: landmark.slot,
      aspect,
      fovDegrees,
      distance,
    }));

    for (const point of placed) {
      assert.ok(Math.abs(point.x) <= halfWidth * 0.94, "no system is pushed off the side");
      assert.ok(Math.abs(point.y) <= halfHeight * 0.9, "no system is pushed off the top or bottom");
    }
    // Filling the frame is the whole point: a layout that leaves most of a wide
    // screen empty is what made six real systems read as one cramped knot.
    const widest = Math.max(...placed.map((point) => Math.abs(point.x)));
    const tallest = Math.max(...placed.map((point) => Math.abs(point.y)));
    assert.ok(widest > halfWidth * 0.45, "the arrangement uses the width it is given");
    assert.ok(tallest > halfHeight * 0.4, "the arrangement uses the height it is given");

    // Two systems must never land on top of each other, whatever the frame.
    for (let a = 0; a < placed.length; a += 1) {
      for (let b = a + 1; b < placed.length; b += 1) {
        const gap = Math.hypot(placed[a].x - placed[b].x, placed[a].y - placed[b].y);
        assert.ok(gap > 3.4, `${neighborhood[a].id} and ${neighborhood[b].id} stay apart`);
      }
    }
  }

  }

  assert.throws(
    () => landmarkPlacement({ slot: [0, 1], aspect: 0, fovDegrees: 42, distance: 27 }),
    /real camera/i,
  );
  assert.throws(
    () => landmarkPlacement({ slot: [0], aspect: 1.6, fovDegrees: 42, distance: 27 }),
    /finite \[u, v\] pair/i,
  );
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
  assert.ok(
    [neighborhood, galaxy, localGroup, universe].every((landmarks) => landmarks.length <= 6),
    "a scale stays readable: never more than six named destinations at once",
  );
  assert.ok(
    neighborhood.every((landmark) => Array.isArray(landmark.slot) && landmark.slot.length === 2),
    "every nearby star owns a slot in the authored arrangement",
  );
  assert.ok(
    neighborhood.some((landmark) => landmark.id === "solar-system"),
    "our own Solar System is a destination a child can visit and study",
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

test("every nearby star opens as a small real system instead of a decorative dot", () => {
  const neighborhood = cosmicLandmarksForScale("neighborhood");
  const proxima = cosmicLandmarkById("proxima-centauri");
  const sirius = cosmicLandmarkById("sirius");
  const trappist = cosmicLandmarkById("trappist-1");
  const solar = cosmicLandmarkById("solar-system");

  assert.ok(neighborhood.every((landmark) => (
    landmark.system
    && ["planetary", "binary"].includes(landmark.system.kind)
    && Number.isInteger(landmark.system.worlds)
    && landmark.system.worlds >= 1
    && landmark.system.worlds <= 8
    && landmark.system.label.length > 0
    && landmark.system.worlds === landmark.system.bodies.length
    && landmark.system.bodies.every((body) => (
      body.id
      && body.name
      && ["planet", "star"].includes(body.kind)
      && Number.isFinite(body.periodDays)
      && body.periodDays > 0
      && Number.isFinite(body.orbitAu)
      && body.orbitAu > 0
      && Number.isFinite(body.radiusEarth)
      && body.radiusEarth > 0
    ))
  )));

  // Honest rendering needs the host star, not just its worlds: colour comes
  // from temperature and the habitable zone comes from luminosity.
  assert.ok(neighborhood.every((landmark) => (
    landmark.system.star
    && landmark.system.star.name
    && landmark.system.star.spectralType
    && landmark.system.star.temperature > 1500
    && landmark.system.star.temperature < 60_000
    && landmark.system.star.radiusSolar > 0
    && landmark.system.star.luminositySuns > 0
  )), "every visitable star carries its measured temperature, radius and luminosity");

  // Worlds are listed outward, so the drawn order is the real order.
  for (const landmark of neighborhood) {
    const orbits = landmark.system.bodies.map((body) => body.orbitAu);
    assert.deepEqual(orbits, [...orbits].sort((first, second) => first - second),
      `${landmark.name} must list its worlds outward`);
  }

  assert.equal(solar.system.worlds, 8);
  assert.equal(solar.system.bodies[2].name, "EARTH");
  assert.equal(solar.system.bodies[2].periodDays, 365.256);
  assert.equal(solar.system.star.temperature, 5772);

  assert.equal(proxima.system.worlds, 2);
  assert.equal(proxima.system.bodies.at(-1).id, "proxima-b");
  assert.equal(sirius.system.kind, "binary");
  assert.equal(sirius.system.bodies[0].kind, "star");

  assert.equal(trappist.system.kind, "planetary");
  assert.equal(trappist.system.worlds, 7);
  assert.equal(trappist.system.star.temperature, 2566);
  assert.deepEqual(
    trappist.system.bodies.map(({ id, periodDays, orbitAu }) => ({ id, periodDays, orbitAu })),
    [
      { id: "trappist-1-b", periodDays: 1.510826, orbitAu: 0.01154 },
      { id: "trappist-1-c", periodDays: 2.421937, orbitAu: 0.0158 },
      { id: "trappist-1-d", periodDays: 4.049219, orbitAu: 0.02227 },
      { id: "trappist-1-e", periodDays: 6.101013, orbitAu: 0.02925 },
      { id: "trappist-1-f", periodDays: 9.20754, orbitAu: 0.03849 },
      { id: "trappist-1-g", periodDays: 12.352446, orbitAu: 0.04683 },
      { id: "trappist-1-h", periodDays: 18.772866, orbitAu: 0.06189 },
    ],
  );
});

test("real orbital periods become audible without changing their octave identity", () => {
  for (const landmark of cosmicLandmarksForScale("neighborhood")) {
    for (const body of landmark.system.bodies) {
      const frequency = orbitalSonificationFrequency(body.periodDays);
      const rawFrequency = 1 / (body.periodDays * 86_400);
      const octaveShift = frequency / rawFrequency;
      assert.ok(frequency >= 110 && frequency < 440);
      assert.ok(
        Math.abs(Math.log2(octaveShift) - Math.round(Math.log2(octaveShift))) < 1e-10,
        `${body.name} must only be transposed by whole octaves`,
      );
    }
  }
});

test("touching a real system plays a chord that falls as the orbits widen", () => {
  for (const landmark of cosmicLandmarksForScale("neighborhood")) {
    const periods = landmark.system.bodies.map((body) => body.periodDays);
    const voices = systemVoiceFrequencies(periods);

    for (let index = 1; index < voices.length; index += 1) {
      const octaves = Math.log2((voices[index - 1] / voices[index])
        / (periods[index] / periods[index - 1]));
      assert.ok(
        Math.abs(octaves - Math.round(octaves)) < 1e-9,
        `${landmark.name} must keep every interval a real period ratio`,
      );
    }
    for (const frequency of voices) {
      assert.ok(frequency >= 55 && frequency <= 1760, `${landmark.name} stays audible`);
    }
  }

  // TRAPPIST-1 spans under four octaves, so the whole chain plays untouched:
  // each world sounds lower than the one inside it, with no folding at all.
  const trappist = cosmicLandmarkById("trappist-1");
  const chain = systemVoiceFrequencies(trappist.system.bodies.map((body) => body.periodDays));
  for (let index = 1; index < chain.length; index += 1) {
    assert.ok(chain[index] < chain[index - 1], "a wider orbit is a deeper voice");
  }
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
