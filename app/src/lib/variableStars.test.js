import test from "node:test";
import assert from "node:assert/strict";

import {
  lightCurveBreathSeconds,
  sampleLightCurve,
  LIGHTCURVE_TIME_COMPRESSION,
} from "./cosmicAtlas.js";
import { VARIABLE_STARS, VARIABLE_STARS_BY_ID, PULSAR_BEAM_DIVISION } from "./variableStars.js";
import { NEIGHBOURHOOD_SHELLS, cosmicLandmarkById } from "./cosmicInstrument.js";

const CURVE = [[0, 0.1], [0.2, 1], [0.6, 0.4], [1, 0.1]];

test("a light curve reads its measured knots exactly and never smooths them away", () => {
  assert.equal(sampleLightCurve(CURVE, 0), 0.1);
  assert.ok(Math.abs(sampleLightCurve(CURVE, 0.2) - 1) < 1e-9);
  assert.ok(Math.abs(sampleLightCurve(CURVE, 0.6) - 0.4) < 1e-9);
  // Between knots it interpolates — the fast rise and slow fall stay measured,
  // not replaced by a sine, because the asymmetry is the whole story.
  assert.ok(Math.abs(sampleLightCurve(CURVE, 0.1) - 0.55) < 1e-9);
  assert.ok(Math.abs(sampleLightCurve(CURVE, 0.8) - 0.25) < 1e-9);
  // Phase wraps: 1.0 is 0.0, and a negative phase wraps too.
  assert.equal(sampleLightCurve(CURVE, 1), sampleLightCurve(CURVE, 0));
  assert.ok(Math.abs(sampleLightCurve(CURVE, -0.4) - 0.4) < 1e-9);
  assert.throws(() => sampleLightCurve([], 0.5), /at least two/);
});

test("every light curve breathes by the one stated compression", () => {
  // Polaris: 3.9717 days → 39.717 seconds of breath, and the factor is one
  // constant for the whole instrument, so no star breathes by taste.
  assert.ok(Math.abs(lightCurveBreathSeconds(3.9717) - 39.717) < 1e-9);
  assert.equal(LIGHTCURVE_TIME_COMPRESSION, 8640);
  assert.throws(() => lightCurveBreathSeconds(0), /positive period/);
});

test("a pulsar landmark carries its own measured frequency — multiplier exactly one", () => {
  const landmark = cosmicLandmarkById("psr-j0437");
  assert.equal(landmark.oscillation.kind, "pulsar");
  assert.equal(landmark.frequency, landmark.oscillation.frequencyHz);
  // 173.688 Hz is heard as 173.688 Hz: the one voice with no octave shift.
  assert.ok(Math.abs(landmark.frequency - 173.688) < 1e-9);
  assert.ok(landmark.frequency / PULSAR_BEAM_DIVISION <= 3, "the drawn beam never strobes");
});

test("the singing stars form one shell, and every member resolves", () => {
  const shell = NEIGHBOURHOOD_SHELLS.find((candidate) => candidate.id === "singing-stars");
  assert.ok(shell, "the sixth sky exists");
  for (const [id] of shell.members) {
    const landmark = cosmicLandmarkById(id);
    assert.ok(landmark, `${id} resolves`);
  }
  // The flagship is a full planetary system you can enter; the lone pulsar
  // and Polaris sit beside it in the same sky.
  assert.ok(cosmicLandmarkById("psr-b1257").system.bodies.length === 3);
  assert.equal(cosmicLandmarkById("polaris").system.star.oscillation.kind, "cepheid");
  assert.equal(cosmicLandmarkById("psr-j0437").system, undefined);
});

test("every pulsar in the atlas keeps its tick under the safe visible rate", () => {
  // Photosensitivity is a release gate, not a nice-to-have: the drawn beam or
  // halo tick is the measured rate divided by the stated factor, and never
  // faster than three a second — audio stays exact either way.
  for (const star of VARIABLE_STARS) {
    if (star.oscillation.kind !== "pulsar") continue;
    assert.ok(star.oscillation.frequencyHz / PULSAR_BEAM_DIVISION <= 3,
      `${star.name} ticks at ${star.oscillation.frequencyHz / PULSAR_BEAM_DIVISION} drawn Hz`);
  }
  const lich = cosmicLandmarkById("psr-b1257");
  assert.ok(lich.system.star.oscillation.frequencyHz / PULSAR_BEAM_DIVISION <= 3);
});

test("every oscillation in the catalogue says where its measurement came from", () => {
  for (const star of VARIABLE_STARS) {
    assert.ok(star.oscillation.note?.length > 0, `${star.name} needs its honest note`);
  }
  for (const system of [cosmicLandmarkById("psr-b1257").system, cosmicLandmarkById("polaris").system]) {
    assert.ok(system.star.oscillation.note?.length > 0, `${system.star.name} needs its honest note`);
  }
});
