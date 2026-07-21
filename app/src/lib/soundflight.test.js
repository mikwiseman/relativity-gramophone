import test from "node:test";
import assert from "node:assert/strict";

import {
  bodyToStage,
  cameraScaleLabel,
  createSoundflightState,
  launchGuidance,
  nextCameraDistance,
  reduceSoundflightState,
  selectRenderProfile,
  sonicIntensity,
} from "./soundflight.js";

test("launch guidance turns one unfamiliar gesture into three explicit moments", () => {
  assert.deepEqual(launchGuidance("armed"), {
    eyebrow: "CREATE A SINGING WORLD",
    title: "PRESS EMPTY SPACE",
    detail: "Hold to grow its mass",
    activeStep: 0,
  });
  assert.deepEqual(launchGuidance("forming"), {
    eyebrow: "A NEW VOICE IS FORMING",
    title: "HOLD · THEN DRAG",
    detail: "Drag to choose its orbit",
    activeStep: 1,
  });
  assert.deepEqual(launchGuidance("aiming"), {
    eyebrow: "THE ORBIT IS READY",
    title: "RELEASE TO HEAR IT",
    detail: "The world will join the symphony",
    activeStep: 2,
  });
  assert.throws(() => launchGuidance("mystery"), /unknown launch phase/i);
});

test("soundflight interaction state keeps navigation and launch mutually exclusive", () => {
  const initial = createSoundflightState();
  assert.deepEqual(initial, { mode: "navigate", followingBodyId: null });

  const launching = reduceSoundflightState(initial, { type: "ARM_LAUNCH" });
  assert.deepEqual(launching, { mode: "launch", followingBodyId: null });

  const completed = reduceSoundflightState(launching, {
    type: "COMPLETE_LAUNCH",
    bodyId: "nova-1",
  });
  assert.deepEqual(completed, { mode: "follow", followingBodyId: "nova-1" });
});

test("following a body yields immediately when the visitor flies the camera", () => {
  const following = reduceSoundflightState(createSoundflightState(), {
    type: "FOLLOW_BODY",
    bodyId: "europa",
  });
  assert.deepEqual(following, { mode: "follow", followingBodyId: "europa" });

  const navigating = reduceSoundflightState(following, { type: "USER_NAVIGATE" });
  assert.deepEqual(navigating, createSoundflightState());
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
  assert.equal(desktop.autoDrift, true);

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
