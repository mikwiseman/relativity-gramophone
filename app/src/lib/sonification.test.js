import test from "node:test";
import assert from "node:assert/strict";

import {
  COSMIC_VOICES,
  COSMIC_VOICE_ORDER,
  SONIFICATION_MODEL,
  VOICE_HARMONICS,
  hapticPattern,
  isResonanceChallengeComplete,
  keplerPitch,
  spectralMix,
  visibleWavelengthToAudibleFrequency,
  voiceParameters,
  voicePluckParameters,
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

test("the sonification model is the Kepler-pitch revision", () => {
  assert.equal(SONIFICATION_MODEL, "cosmic-voices/2");
});

test("Kepler pitch raises the true orbital frequency by twelve octaves", () => {
  assert.ok(Math.abs(keplerPitch(10.8) - 4096 / 10.8) < 1e-9);
  assert.ok(Math.abs(keplerPitch(16.2) - 4096 / 16.2) < 1e-9);
  assert.ok(Math.abs(keplerPitch(10.8) / keplerPitch(16.2) - 3 / 2) < 1e-12);
});

test("Kepler pitch clamps to the audible band and rejects unbound orbits", () => {
  assert.equal(keplerPitch(0.5), 1760);
  assert.equal(keplerPitch(400), 55);
  assert.equal(keplerPitch(Infinity), null);
  assert.equal(keplerPitch(0), null);
  assert.equal(keplerPitch(-4), null);
  assert.equal(keplerPitch(Number.NaN), null);
});

test("a live orbital period sings its Kepler pitch while the authored frequency stays a fallback", () => {
  const orbiting = voiceParameters({ ...BODY, period: 16.2, properRate: 1, doppler: 1 });
  const unbound = voiceParameters({ ...BODY, period: Infinity, properRate: 1, doppler: 1 });

  assert.ok(Math.abs(orbiting.frequency - 4096 / 16.2) < 1e-9);
  assert.equal(unbound.frequency, 220);
});

test("a real 3:2 orbital resonance is heard as an exact perfect fifth", () => {
  const inner = voiceParameters({ ...BODY, period: 10.8, properRate: 1, doppler: 1 });
  const outer = voiceParameters({ ...BODY, period: 16.2, properRate: 1, doppler: 1 });

  assert.ok(Math.abs(inner.frequency / outer.frequency - 3 / 2) < 1e-12);
});

test("pluck articulation: far plucks brighten, near plucks ring longer, nothing clips", () => {
  const body = { ...BODY, period: 16.2, properRate: 1, doppler: 1, displayMass: 0.7 };
  const nearWorld = voicePluckParameters(body, { offset: 0.05, strength: 0.8 });
  const farOut = voicePluckParameters(body, { offset: 0.95, strength: 0.8 });
  const soft = voicePluckParameters(body, { offset: 0.5, strength: 0.1 });
  const hard = voicePluckParameters(body, { offset: 0.5, strength: 3 });

  assert.ok(Math.abs(nearWorld.frequency - 4096 / 16.2) < 1e-9, "a pluck sounds the live Kepler pitch");
  assert.ok(farOut.cutoff > nearWorld.cutoff);
  assert.ok(farOut.partialGain > nearWorld.partialGain);
  assert.ok(nearWorld.decay > farOut.decay);
  assert.ok(hard.gain > soft.gain);
  assert.ok(hard.gain <= 0.1);
  assert.ok(hard.strength <= 1 && soft.strength >= 0);
});

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

test("every scientific and future-instrument voice has a distinct timbre signature", () => {
  const signatures = Object.keys(COSMIC_VOICES).map((voice) => {
    const parameters = voiceParameters({ ...BODY, voice });
    return [parameters.waveform, parameters.partialWaveform, parameters.partialRatio, parameters.subRatio].join(":");
  });

  assert.equal(new Set(signatures).size, 7);
  assert.ok(voiceParameters({ ...BODY, voice: "moon" }).release > voiceParameters({ ...BODY, voice: "earth" }).release);
  assert.ok(voiceParameters({ ...BODY, voice: "light" }).cutoff > voiceParameters({ ...BODY, voice: "moon" }).cutoff);
  assert.ok(voiceParameters({ ...BODY, voice: "alpha-centauri" }).subGain > 0);
});

test("future-instrument voices turn continuous orbit motion into distinct expression", () => {
  assert.deepEqual(COSMIC_VOICE_ORDER.slice(0, 5), [
    "earth",
    "theremin",
    "ondes",
    "trautonium",
    "light",
  ]);

  const theremin = voiceParameters({ ...BODY, voice: "theremin" });
  const ondes = voiceParameters({ ...BODY, voice: "ondes" });
  const trautonium = voiceParameters({ ...BODY, voice: "trautonium" });

  assert.ok(theremin.vibratoDepthCents >= 12, "theremin pitch must visibly breathe");
  assert.ok(theremin.glideSeconds > ondes.glideSeconds, "theremin uses the slowest hand-like portamento");
  assert.ok(ondes.attack > 0.03 && ondes.release > 2, "Ondes Martenot keeps a soft singing envelope");
  assert.ok(trautonium.partialRatio < 1, "Trautonium exposes a real subharmonic division");
  assert.ok(trautonium.subGain > theremin.subGain, "Trautonium carries the densest undertone");
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
  assert.deepEqual(hapticPattern({ kind: "audition", strength: 0.7 }), [6]);
  assert.deepEqual(hapticPattern({ kind: "crossing", strength: 0.7 }), [8]);
  assert.deepEqual(hapticPattern({ kind: "pluck", strength: 0.5 }), [5]);
  assert.deepEqual(hapticPattern({ kind: "birth", strength: 0.5 }), [9, 30, 6]);
  assert.deepEqual(hapticPattern({ kind: "consumption", strength: 1 }), [12, 26, 6]);
  assert.deepEqual(hapticPattern({ kind: "pericenter", strength: 0.3 }), [5, 22, 4]);
  assert.deepEqual(hapticPattern({ kind: "pericenter", strength: 1.1 }), [9, 18, 7]);
  assert.deepEqual(hapticPattern({ kind: "resonance", strength: 0.9 }), [7, 22, 11]);
});

test("every cosmic voice has an audible harmonic recipe anchored to its fundamental", () => {
  for (const voiceId of COSMIC_VOICE_ORDER) {
    const harmonics = VOICE_HARMONICS[voiceId];
    assert.ok(Array.isArray(harmonics) || ArrayBuffer.isView(harmonics), `${voiceId} has harmonics`);
    assert.equal(harmonics[0], 0, `${voiceId} has no DC offset`);
    assert.equal(harmonics[1], 1, `${voiceId} anchors the fundamental at unity`);
    assert.ok(harmonics.length >= 6, `${voiceId} is richer than a bare sine`);
    for (const amplitude of harmonics.slice(2)) {
      assert.ok(amplitude > 0 && amplitude < 1, `${voiceId} overtones stay below the fundamental`);
    }
  }
});
