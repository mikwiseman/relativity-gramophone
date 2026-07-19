import test from "node:test";
import assert from "node:assert/strict";

import {
  COSMIC_VOICES,
  hapticPattern,
  isResonanceChallengeComplete,
  spectralMix,
  visibleWavelengthToAudibleFrequency,
  voiceParameters,
} from "./sonification.js";

const BODY = {
  frequency: 220,
  doppler: 1,
  properRate: 0.98,
  displayMass: 0.7,
  x: 0.2,
  y: 0.1,
  vx: 0.04,
  vy: 0.08,
};

test("approach/recession drive pitch and cold/warm color in the same direction", () => {
  const approaching = voiceParameters({ ...BODY, doppler: 1.04 });
  const receding = voiceParameters({ ...BODY, doppler: 0.96 });

  assert.ok(approaching.frequency > receding.frequency);
  assert.ok(spectralMix({ doppler: 1.04 }).cyan > spectralMix({ doppler: 0.96 }).cyan);
  assert.ok(spectralMix({ doppler: 0.96 }).coral > spectralMix({ doppler: 1.04 }).coral);
});

test("mass makes a voice denser without allowing it to clip the mix", () => {
  const light = voiceParameters({ ...BODY, displayMass: 0.3 });
  const heavy = voiceParameters({ ...BODY, displayMass: 1.1 });

  assert.ok(heavy.gain > light.gain);
  assert.ok(heavy.partialGain > light.partialGain);
  assert.ok(heavy.gain <= 0.11);
});

test("Earth, Moon, light, and Alpha Centauri produce distinct scientific timbre signatures", () => {
  const signatures = Object.keys(COSMIC_VOICES).map((voice) => {
    const parameters = voiceParameters({ ...BODY, voice });
    return [parameters.waveform, parameters.partialWaveform, parameters.partialRatio, parameters.subRatio].join(":");
  });

  assert.equal(new Set(signatures).size, 4);
  assert.ok(voiceParameters({ ...BODY, voice: "moon" }).release > voiceParameters({ ...BODY, voice: "earth" }).release);
  assert.ok(voiceParameters({ ...BODY, voice: "light" }).cutoff > voiceParameters({ ...BODY, voice: "moon" }).cutoff);
  assert.ok(voiceParameters({ ...BODY, voice: "alpha-centauri" }).subGain > 0);
});

test("a resonance challenge requires the requested ratio and a strong physical lock", () => {
  assert.equal(isResonanceChallengeComplete({ label: "3:2", strength: 0.84 }, "3:2"), true);
  assert.equal(isResonanceChallengeComplete({ label: "3:2", strength: 0.79 }, "3:2"), false);
  assert.equal(isResonanceChallengeComplete({ label: "2:1", strength: 0.99 }, "3:2"), false);
  assert.equal(isResonanceChallengeComplete(null, "3:2"), false);
});

test("visible light is logarithmically compressed from red to violet across two audible octaves", () => {
  const red = visibleWavelengthToAudibleFrequency(700);
  const green = visibleWavelengthToAudibleFrequency(550);
  const violet = visibleWavelengthToAudibleFrequency(380);

  assert.equal(red, 220);
  assert.ok(green > red && green < violet);
  assert.ok(Math.abs(violet / red - 4) < 1e-12);
});

test("haptic patterns remain short and scale with physical intensity", () => {
  assert.deepEqual(hapticPattern({ kind: "crossing", strength: 0.7 }), [8]);
  assert.deepEqual(hapticPattern({ kind: "pericenter", strength: 0.3 }), [5, 22, 4]);
  assert.deepEqual(hapticPattern({ kind: "pericenter", strength: 1.1 }), [9, 18, 7]);
  assert.deepEqual(hapticPattern({ kind: "resonance", strength: 0.9 }), [7, 22, 11]);
});
