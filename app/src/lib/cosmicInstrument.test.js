import assert from "node:assert/strict";
import test from "node:test";

import {
  cathedralIntensity,
  cosmicScaleForDistance,
  memoryCometEnvelope,
  thereminParameters,
} from "./cosmicInstrument.js";

test("semantic zoom reveals a named musical scale instead of only a distance", () => {
  const orbit = cosmicScaleForDistance(4);
  const system = cosmicScaleForDistance(12);
  const galaxy = cosmicScaleForDistance(30);
  const universe = cosmicScaleForDistance(58);

  assert.equal(orbit.id, "orbit");
  assert.equal(system.id, "system");
  assert.equal(galaxy.id, "galaxy");
  assert.equal(universe.id, "universe");
  assert.ok(orbit.systemMix > galaxy.systemMix);
  assert.ok(galaxy.galaxyMix > system.galaxyMix);
  assert.ok(universe.universeMix > galaxy.universeMix);
  assert.ok([orbit, system, galaxy, universe].every((scale) => (
    scale.systemMix >= 0
    && scale.systemMix <= 1
    && scale.galaxyMix >= 0
    && scale.galaxyMix <= 1
    && scale.universeMix >= 0
    && scale.universeMix <= 1
  )));
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
