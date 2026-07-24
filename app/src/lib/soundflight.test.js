import test from "node:test";
import assert from "node:assert/strict";

import {
  bodyToStage,
  cameraScaleLabel,
  buildMusicalConnections,
  canBeginRadialLaunchFromHit,
  createSoundflightState,
  dopplerTintedColor,
  frequencyToNoteName,
  INITIAL_PLAYBACK,
  launchGuidance,
  nextCameraDistance,
  reduceSoundflightState,
  selectRenderProfile,
  shouldApplyGestationUpdate,
  shouldRefreshMusicalConnection,
  sonicIntensity,
  voiceVisual,
} from "./soundflight.js";

test("the instrument opens already moving instead of presenting a dormant play state", () => {
  assert.equal(INITIAL_PLAYBACK, true);
});

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
    detail: "Close sings high · far sings low",
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

test("soundflight interaction state fails loudly for incomplete or unknown commands", () => {
  const initial = createSoundflightState();

  assert.deepEqual(reduceSoundflightState({ mode: "launch", followingBodyId: null }, { type: "CANCEL" }), initial);
  assert.deepEqual(reduceSoundflightState({ mode: "launch", followingBodyId: null }, { type: "USER_NAVIGATE" }), initial);
  assert.deepEqual(reduceSoundflightState(initial, { type: "FOLLOW_BODY", bodyId: "europa" }), initial);
  assert.throws(() => reduceSoundflightState(initial, { type: "FOLLOW_BODY" }), /requires a bodyId/i);
  assert.throws(() => reduceSoundflightState(initial, { type: "COMPLETE_LAUNCH" }), /requires a bodyId/i);
  assert.throws(() => reduceSoundflightState(initial, { type: "TELEPORT" }), /unknown soundflight action/i);
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

test("a cancelled gestation request cannot restart its tone after audio resumes", () => {
  assert.equal(shouldApplyGestationUpdate({ requestId: 4, currentRequestId: 4, engaged: true }), true);
  assert.equal(shouldApplyGestationUpdate({ requestId: 4, currentRequestId: 5, engaged: true }), false);
  assert.equal(shouldApplyGestationUpdate({ requestId: 4, currentRequestId: 4, engaged: false }), false);
});

test("musical connection geometry refreshes only after a visible move and frame budget", () => {
  const previous = new Float32Array([0, 0, 2, 1]);
  const first = { x: 0, z: 0 };
  const still = { x: 2, z: 1 };
  const moved = { x: 2.1, z: 1 };

  assert.equal(shouldRefreshMusicalConnection({
    now: 1,
    lastUpdatedAt: 0,
    previous: null,
    first,
    second: still,
    minInterval: 1 / 30,
  }), true);
  assert.equal(shouldRefreshMusicalConnection({
    now: 1,
    lastUpdatedAt: 0,
    previous,
    first,
    second: still,
    minInterval: 1 / 30,
  }), false);
  assert.equal(shouldRefreshMusicalConnection({
    now: 1.01,
    lastUpdatedAt: 1,
    previous,
    first,
    second: moved,
    minInterval: 1 / 30,
  }), false);
  assert.equal(shouldRefreshMusicalConnection({
    now: 1.04,
    lastUpdatedAt: 1,
    previous,
    first,
    second: moved,
    minInterval: 1 / 30,
  }), true);
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
  assert.equal(desktop.starCount, 2600);
  assert.equal(desktop.dustCount, 1100);
  assert.equal(desktop.twinkle, true);
  assert.equal(desktop.grain, true);

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
  assert.equal(reduced.twinkle, false);
  assert.equal(reduced.grain, false);
  assert.equal(compact.grain, false);
  assert.ok(reduced.starCount < compact.starCount);
  assert.ok(compact.starCount < desktop.starCount);

  assert.throws(() => selectRenderProfile({
    width: 390,
    height: 844,
    devicePixelRatio: Number.NaN,
    hardwareConcurrency: 4,
    reducedMotion: false,
  }), /finite device metrics/i);
});

test("voice colors are stable, named, and never rely on color alone", () => {
  assert.deepEqual(voiceVisual("earth"), { label: "EARTH", colorName: "CYAN", color: 0x72edff });
  assert.deepEqual(voiceVisual("moon"), { label: "MOON", colorName: "AMBER", color: 0xffc66d });
  assert.deepEqual(voiceVisual("light"), { label: "LIGHT", colorName: "MAGENTA", color: 0xff76d6 });
  assert.deepEqual(voiceVisual("alpha-centauri"), { label: "ALPHA CEN", colorName: "MINT", color: 0x8fffc1 });
  assert.deepEqual(voiceVisual("theremin"), { label: "THEREMIN", colorName: "VIOLET", color: 0xb99cff });
  assert.deepEqual(voiceVisual("ondes"), { label: "ONDES", colorName: "AZURE", color: 0x7fb8ff });
  assert.deepEqual(voiceVisual("trautonium"), { label: "TRAUTONIUM", colorName: "COPPER", color: 0xff8a66 });
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

test("musical connections reject corrupt positions instead of drawing a misleading thread", () => {
  assert.deepEqual(buildMusicalConnections([], { x: 0, y: 0 }), []);
  assert.throws(() => buildMusicalConnections([], { x: Number.NaN, y: 0 }), /finite star position/i);
  assert.throws(() => buildMusicalConnections([
    { id: "broken", x: undefined, y: 0, voice: "earth" },
  ], { x: 0, y: 0 }), /finite body/i);
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

test("doppler tinting shifts a voice color toward cyan on approach and coral on recession", () => {
  const still = dopplerTintedColor(0xffc66d, 1);
  assert.equal(still.shift, 0);
  assert.ok(Math.abs(still.r - 0xff / 255) < 1e-9);
  assert.ok(Math.abs(still.g - 0xc6 / 255) < 1e-9);
  assert.ok(Math.abs(still.b - 0x6d / 255) < 1e-9);

  const approaching = dopplerTintedColor(0xffc66d, 1.05);
  assert.ok(approaching.shift > 0);
  assert.ok(approaching.b > still.b, "approach adds blue");
  assert.ok(approaching.r < still.r, "approach cools red");

  const receding = dopplerTintedColor(0xffc66d, 0.95);
  assert.ok(receding.shift < 0);
  assert.ok(receding.g < still.g, "recession warms toward coral");
  assert.ok(receding.b < still.b, "recession removes blue");

  const capped = dopplerTintedColor(0x72edff, 2);
  assert.ok(capped.shift === 1);
  for (const channel of ["r", "g", "b"]) {
    assert.ok(capped[channel] >= 0 && capped[channel] <= 1);
  }

  assert.throws(() => dopplerTintedColor(Number.NaN, 1), /finite color/i);
  assert.throws(() => dopplerTintedColor(0xffffff, Number.NaN), /finite color/i);
});
