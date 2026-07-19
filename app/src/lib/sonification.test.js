import test from "node:test";
import assert from "node:assert/strict";

import { hapticPattern, spectralMix, voiceParameters } from "./sonification.js";

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

test("haptic patterns remain short and scale with physical intensity", () => {
  assert.deepEqual(hapticPattern({ kind: "crossing", strength: 0.7 }), [8]);
  assert.deepEqual(hapticPattern({ kind: "pericenter", strength: 0.3 }), [5, 22, 4]);
  assert.deepEqual(hapticPattern({ kind: "pericenter", strength: 1.1 }), [9, 18, 7]);
});
