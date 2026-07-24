import test from "node:test";
import assert from "node:assert/strict";

import { AudioEngine } from "./audioEngine.js";
import {
  moonHarmonicFrequency,
  voiceParameters,
  voicePluckParameters,
} from "./sonification.js";
import {
  orbitStringStyle,
  shouldAutoSoundBody,
} from "./soundflight.js";

test("moons form a consonant fifth and octave above their parent instead of unrelated high notes", () => {
  const parentFrequency = 246;
  const first = moonHarmonicFrequency({
    moonId: "moon-nova-1-1",
    parentFrequency,
  });
  const second = moonHarmonicFrequency({
    moonId: "moon-nova-1-2",
    parentFrequency,
  });

  assert.ok(Math.abs(first / parentFrequency - 3 / 2) < 1e-12);
  assert.ok(Math.abs(second / parentFrequency - 2) < 1e-12);
});

test("moon harmonics fold by octaves to stay inside the instrument range", () => {
  assert.equal(moonHarmonicFrequency({
    moonId: "moon-nova-1-1",
    parentFrequency: 1_400,
  }), 1_050);
  assert.equal(moonHarmonicFrequency({
    moonId: "moon-nova-1-2",
    parentFrequency: 1_400,
  }), 1_400);
});

test("a moon is a restrained overtone even when its physical period is extremely short", () => {
  const planet = voiceParameters({
    kind: "planet",
    voice: "theremin",
    period: 16.2,
    frequency: 220,
    displayMass: 0.7,
    properRate: 1,
    doppler: 1,
    x: 0.2,
    y: 0.1,
  });
  const moon = voiceParameters({
    kind: "moon",
    voice: "theremin",
    period: 0.8,
    frequency: planet.frequency * 1.5,
    displayMass: 0.07,
    properRate: 1,
    doppler: 1,
    x: 0.2,
    y: 0.1,
  });

  assert.equal(moon.frequency, planet.frequency * 1.5);
  assert.ok(moon.gain < planet.gain * 0.4);
  assert.ok(moon.partialGain < planet.partialGain * 0.5);
  assert.ok(moon.tremoloDepth <= 0.02);
});

test("light-voice moons keep the parent harmonic instead of reverting to wavelength pitch", () => {
  const moon = voiceParameters({
    kind: "moon",
    voice: "light",
    period: 0.8,
    frequency: 495,
    wavelengthNm: 550,
    displayMass: 0.07,
    properRate: 1,
    doppler: 1,
    x: 0.2,
    y: 0.1,
  });

  assert.equal(moon.frequency, 495);
});

test("the live audio engine reharmonizes legacy moon recordings against the sounding parent", () => {
  const parent = {
    id: "nova-1",
    kind: "planet",
    voice: "earth",
    period: 16.2,
    frequency: 440,
    displayMass: 0.6,
    properRate: 1,
    doppler: 1,
    x: 0.2,
    y: 0.1,
  };
  const moon = {
    id: "moon-nova-1-1",
    parentId: parent.id,
    kind: "moon",
    voice: parent.voice,
    period: 0.8,
    frequency: 1_760,
    displayMass: 0.05,
    properRate: 0.94,
    doppler: 1.08,
    x: 0.21,
    y: 0.1,
  };
  const audio = new AudioEngine();
  audio.latestFrame = { bodies: [parent, moon] };

  const audibleMoon = audio.audibleBody(moon);
  assert.ok(Math.abs(
    audibleMoon.frequency / voiceParameters(parent).frequency - 3 / 2,
  ) < 1e-12);
  assert.equal(audibleMoon.properRate, 1);
  assert.equal(audibleMoon.doppler, 1);
});

test("deliberately plucked moons remain audible but sit below their planet", () => {
  const shared = {
    voice: "earth",
    frequency: 330,
    period: 14,
    displayMass: 0.5,
    properRate: 1,
    doppler: 1,
    x: 0.1,
    y: 0.1,
  };
  const planet = voicePluckParameters({ ...shared, kind: "planet" }, { offset: 0.5, strength: 0.8 });
  const moon = voicePluckParameters({ ...shared, kind: "moon" }, { offset: 0.5, strength: 0.8 });

  assert.ok(moon.gain < planet.gain * 0.7);
  assert.ok(moon.partialGain < planet.partialGain);
});

test("only planets strike automatically while moon strings wait for a deliberate gesture", () => {
  assert.equal(shouldAutoSoundBody({ kind: "planet" }), true);
  assert.equal(shouldAutoSoundBody({ kind: "moon" }), false);
  assert.throws(() => shouldAutoSoundBody({ kind: "comet" }), /playable body kind/i);
});

test("moon strings stay visually subordinate to planet strings", () => {
  const planet = orbitStringStyle({
    kind: "planet",
    selected: false,
    isPlaying: true,
    impulse: 0,
  });
  const moon = orbitStringStyle({
    kind: "moon",
    selected: false,
    isPlaying: true,
    impulse: 0,
  });
  const excitedMoon = orbitStringStyle({
    kind: "moon",
    selected: false,
    isPlaying: true,
    impulse: 1,
  });

  assert.ok(moon.opacity < planet.opacity * 0.5);
  assert.ok(moon.linewidth < planet.linewidth);
  assert.ok(excitedMoon.opacity < 0.25);
});
