import test from "node:test";
import assert from "node:assert/strict";

import {
  bodyToStage,
  cameraScaleLabel,
  buildMusicalConnections,
  canBeginRadialLaunchFromHit,
  createSoundflightState,
  frequencyToNoteName,
  launchGuidance,
  nextCameraDistance,
  reduceSoundflightState,
  selectRenderProfile,
  sonicIntensity,
  voiceVisual,
} from "./soundflight.js";

test("launch guidance turns one unfamiliar gesture into three explicit moments", () => {
  assert.deepEqual(launchGuidance("armed"), {
    eyebrow: "CREATE A SINGING WORLD",
    title: "DRAG FROM THE STAR",
    detail: "Distance chooses the pitch",
    activeStep: 0,
  });
  assert.deepEqual(launchGuidance("forming"), {
    eyebrow: "A NEW VOICE IS FORMING",
    title: "MOVE OUTWARD",
    detail: "Low · mid · high",
    activeStep: 1,
  });
  assert.deepEqual(launchGuidance("aiming"), {
    eyebrow: "THE ORBIT IS READY",
    title: "RELEASE TO HEAR IT",
    detail: "A stable voice joins the symphony",
    activeStep: 2,
  });
  assert.throws(() => launchGuidance("mystery"), /unknown launch phase/i);
});

test("soundflight interaction state keeps navigation and launch mutually exclusive", () => {
  const initial = createSoundflightState();
  assert.deepEqual(initial, { mode: "compose", followingBodyId: null });

  const launching = reduceSoundflightState(initial, { type: "ARM_LAUNCH" });
  assert.deepEqual(launching, { mode: "launch", followingBodyId: null });

  const completed = reduceSoundflightState(launching, {
    type: "COMPLETE_LAUNCH",
    bodyId: "nova-1",
  });
  assert.deepEqual(completed, { mode: "compose", followingBodyId: null });
});

test("free camera flight is an explicit explore mode that always returns to composition", () => {
  const exploring = reduceSoundflightState(createSoundflightState(), { type: "ENTER_EXPLORE" });
  assert.deepEqual(exploring, { mode: "explore", followingBodyId: null });
  assert.deepEqual(reduceSoundflightState(exploring, { type: "USER_NAVIGATE" }), exploring);
  assert.deepEqual(reduceSoundflightState(exploring, { type: "EXIT_EXPLORE" }), createSoundflightState());
});

test("a radial launch accepts the star itself but rejects existing planets", () => {
  assert.equal(canBeginRadialLaunchFromHit(null), true);
  assert.equal(canBeginRadialLaunchFromHit("star"), true);
  assert.equal(canBeginRadialLaunchFromHit("europa"), false);
});

test("render profile preserves the artwork while bounding GPU cost", () => {
  const desktop = selectRenderProfile({
    width: 1440,
    height: 1024,
    devicePixelRatio: 2,
    hardwareConcurrency: 10,
    reducedMotion: false,
  });
  assert.equal(desktop.pixelRatio, 1.5);
  assert.equal(desktop.particleCount, 1100);
  assert.equal(desktop.trailSamples, 160);
  assert.equal(desktop.autoDrift, false);

  const compact = selectRenderProfile({
    width: 390,
    height: 844,
    devicePixelRatio: 3,
    hardwareConcurrency: 4,
    reducedMotion: false,
  });
  assert.equal(compact.pixelRatio, 1);
  assert.equal(compact.particleCount, 480);
  assert.equal(compact.trailSamples, 96);

  const reduced = selectRenderProfile({
    width: 1440,
    height: 1024,
    devicePixelRatio: 2,
    hardwareConcurrency: 10,
    reducedMotion: true,
  });
  assert.equal(reduced.particleCount, 90);
  assert.equal(reduced.trailSamples, 40);
  assert.equal(reduced.autoDrift, false);
});

test("voice colors are stable, named, and never rely on color alone", () => {
  assert.deepEqual(voiceVisual("earth"), { label: "EARTH", colorName: "CYAN", color: 0x72edff });
  assert.deepEqual(voiceVisual("moon"), { label: "MOON", colorName: "AMBER", color: 0xffc66d });
  assert.deepEqual(voiceVisual("light"), { label: "LIGHT", colorName: "MAGENTA", color: 0xff76d6 });
  assert.deepEqual(voiceVisual("alpha-centauri"), { label: "ALPHA CEN", colorName: "MINT", color: 0x8fffc1 });
  assert.throws(() => voiceVisual("mystery"), /unknown cosmic voice/i);
});

test("musical connections keep one stable colored ensemble chain in score order", () => {
  const links = buildMusicalConnections([
    { id: "outer", x: 0.5, y: 0, voice: "light" },
    { id: "inner", x: 0.2, y: 0, voice: "earth" },
    { id: "middle", x: 0, y: 0.35, voice: "moon" },
  ], { x: 0, y: 0 });

  assert.deepEqual(links, [
    { bodyId: "outer", sourceId: "star", voice: "light", color: 0xff76d6 },
    { bodyId: "inner", sourceId: "outer", voice: "earth", color: 0x72edff },
    { bodyId: "middle", sourceId: "inner", voice: "moon", color: 0xffc66d },
  ]);
});

test("the sounding pitch has a compact musical note name", () => {
  assert.equal(frequencyToNoteName(440), "A4");
  assert.equal(frequencyToNoteName(261.63), "C4");
  assert.throws(() => frequencyToNoteName(0), /positive/i);
});

test("body positions map the deterministic 2D simulation into one stable orbital plane", () => {
  assert.deepEqual(bodyToStage({ x: 0.25, y: -0.4 }, 10), {
    x: 2.5,
    y: 0,
    z: 4,
  });
});

test("sonic brightness stays event-driven and bounded", () => {
  const quiet = sonicIntensity({
    displayMass: 0.3,
    doppler: 1,
    resonanceStrength: 0,
    impulse: 0,
  });
  const bright = sonicIntensity({
    displayMass: 1,
    doppler: 1.06,
    resonanceStrength: 0.95,
    impulse: 1,
  });

  assert.ok(quiet < 0.25);
  assert.ok(bright > 0.9);
  assert.ok(bright <= 1);
  assert.throws(() => sonicIntensity({
    displayMass: 0.3,
    doppler: undefined,
    resonanceStrength: 0,
    impulse: 0,
  }), /finite physical values/i);
});

test("camera distance produces calm editorial scale labels", () => {
  assert.equal(cameraScaleLabel(5), "0.6 AU");
  assert.equal(cameraScaleLabel(10), "1.2 AU");
  assert.equal(cameraScaleLabel(24), "2.9 AU");
});

test("explicit camera zoom stays inside the same safe flight envelope as gestures", () => {
  assert.equal(nextCameraDistance(8, -1), 6.4);
  assert.equal(nextCameraDistance(3.3, -1), 3.2);
  assert.equal(nextCameraDistance(23.4, 1), 24);
  assert.throws(() => nextCameraDistance(8, 0), /direction/i);
});
