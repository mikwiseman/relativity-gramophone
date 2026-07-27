import test from "node:test";
import assert from "node:assert/strict";

import {
  bodyToStage,
  cameraScaleLabel,
  buildMusicalConnections,
  canBeginRadialLaunchFromHit,
  cosmicCameraDirection,
  cosmicCameraTarget,
  createSoundflightState,
  dopplerTintedColor,
  frequencyToNoteName,
  INITIAL_PLAYBACK,
  INSTRUMENT_TITLE,
  launchGuidance,
  nextCameraDistance,
  playbackControl,
  reconcileAudioState,
  audioUnlockPhase,
  reduceSoundflightState,
  nextQualityLevel,
  QUALITY_LADDER,
  selectRenderProfile,
  starGripRadius,
  systemTouchRadius,
  visitedSystemCameraDistance,
  visitedSystemElevation,
  shouldApplyGestationUpdate,
  shouldApplyThereminRelease,
  shouldArmDirectMoon,
  shouldBeginThereminHold,
  shouldCelebrateThereminEnd,
  shouldCancelDirectManipulation,
  shouldDeferStringPluck,
  shouldSoundSweptString,
  thereminReleaseDisposition,
  shouldSoundThereminOnRelease,
  shouldShowMoonPlacementGuide,
  shouldRefreshMusicalConnection,
  sonicIntensity,
  voiceVisual,
} from "./soundflight.js";

test("the instrument opens already moving instead of presenting a dormant play state", () => {
  assert.equal(INITIAL_PLAYBACK, true);
  assert.equal(INSTRUMENT_TITLE, "WAI GRAMOPHONE");
});

test("the playback control never claims sound is playing before Web Audio is running", () => {
  assert.deepEqual(playbackControl({ audioState: "locked", isPlaying: true }), {
    icon: "play",
    label: "START SOUND",
    ariaLabel: "Start sound",
    pressed: false,
  });
  assert.deepEqual(playbackControl({ audioState: "running", isPlaying: true }), {
    icon: "pause",
    label: "PAUSE",
    ariaLabel: "Pause music",
    pressed: true,
  });
  assert.deepEqual(playbackControl({ audioState: "paused", isPlaying: false }), {
    icon: "play",
    label: "PLAY",
    ariaLabel: "Play music",
    pressed: false,
  });
  assert.throws(
    () => playbackControl({ audioState: "mystery", isPlaying: true }),
    /unknown audio state/i,
  );
});

test("an intentional pause wins when a browser wakes Web Audio by itself", () => {
  assert.deepEqual(
    reconcileAudioState({ engineState: "running", intentionalPause: true }),
    { audioState: "paused", shouldSuspend: true },
  );
  assert.deepEqual(
    reconcileAudioState({ engineState: "suspended", intentionalPause: true }),
    { audioState: "paused", shouldSuspend: false },
  );
  assert.deepEqual(
    reconcileAudioState({ engineState: "running", intentionalPause: false }),
    { audioState: "running", shouldSuspend: false },
  );
  assert.deepEqual(
    reconcileAudioState({ engineState: "interrupted", intentionalPause: false }),
    { audioState: "locked", shouldSuspend: false },
  );
});

test("moon placement geometry stays hidden until the player actually drags", () => {
  assert.equal(shouldShowMoonPlacementGuide({ activeDrag: false }), false);
  assert.equal(shouldShowMoonPlacementGuide({ activeDrag: true }), true);
  assert.throws(() => shouldShowMoonPlacementGuide({}), /explicit drag state/i);
});

test("dragging a planet directly can make a moon without a selection panel", () => {
  assert.equal(shouldArmDirectMoon({
    body: { kind: "planet" },
    interactionMode: "compose",
    isListener: false,
    siblingCount: 0,
    liveBodyCount: 2,
    maxWorlds: 12,
  }), true);
  assert.equal(shouldArmDirectMoon({
    body: { kind: "moon" },
    interactionMode: "compose",
    isListener: false,
    siblingCount: 0,
    liveBodyCount: 2,
    maxWorlds: 12,
  }), false);
  assert.equal(shouldArmDirectMoon({
    body: { kind: "planet" },
    interactionMode: "compose",
    isListener: false,
    siblingCount: 2,
    liveBodyCount: 4,
    maxWorlds: 12,
  }), false);
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

test("a deferred theremin release cannot resurrect after cancellation", () => {
  assert.equal(
    shouldApplyThereminRelease({ requestId: 4, currentRequestId: 4 }),
    true,
  );
  assert.equal(
    shouldApplyThereminRelease({ requestId: 4, currentRequestId: 5 }),
    false,
  );
  assert.throws(
    () => shouldApplyThereminRelease({ requestId: 4 }),
    /request ids/i,
  );
});

test("a second touch belongs to camera navigation, never creation or theremin", () => {
  assert.equal(shouldCancelDirectManipulation({ pointerType: "touch", activeTouchCount: 1 }), false);
  assert.equal(shouldCancelDirectManipulation({ pointerType: "touch", activeTouchCount: 2 }), true);
  assert.equal(shouldCancelDirectManipulation({ pointerType: "mouse", activeTouchCount: 2 }), false);
  assert.throws(
    () => shouldCancelDirectManipulation({ pointerType: "touch", activeTouchCount: 0 }),
    /positive touch count/i,
  );
});

test("touch strings wait for pointer release so a second finger can cancel the note", () => {
  assert.equal(shouldDeferStringPluck("touch"), true);
  assert.equal(shouldDeferStringPluck("mouse"), false);
  assert.equal(shouldDeferStringPluck("pen"), true);
  assert.throws(() => shouldDeferStringPluck(), /pointer type/i);
});

test("a sweep sounds as it happens, unless a second finger is really down", () => {
  // Holding every crossing until the finger lifts turns a strum across three
  // orbits into one late note — on the surface the design calls primary.
  assert.equal(shouldSoundSweptString({ pointerType: "touch", activeTouchCount: 1 }), true);
  assert.equal(shouldSoundSweptString({ pointerType: "pen", activeTouchCount: 0 }), true);
  assert.equal(shouldSoundSweptString({ pointerType: "mouse", activeTouchCount: 0 }), true);
  // Two fingers down is a pinch, and a pinch is never music.
  assert.equal(shouldSoundSweptString({ pointerType: "touch", activeTouchCount: 2 }), false);
  assert.equal(shouldSoundSweptString({ pointerType: "mouse", activeTouchCount: 2 }), true);
  assert.throws(() => shouldSoundSweptString({ activeTouchCount: 1 }), /pointer type/i);
  assert.throws(
    () => shouldSoundSweptString({ pointerType: "touch", activeTouchCount: -1 }),
    /how many touches/i,
  );
});

test("mouse unlocks on press while touch and pen unlock on their valid release", () => {
  assert.equal(audioUnlockPhase("mouse"), "pointerdown");
  assert.equal(audioUnlockPhase("touch"), "pointerup");
  assert.equal(audioUnlockPhase("pen"), "pointerup");
  assert.throws(() => audioUnlockPhase(), /pointer type/i);
});

test("a first locked touch or pen theremin gesture sounds once on release", () => {
  assert.equal(shouldSoundThereminOnRelease({ pointerType: "touch", active: true }), true);
  assert.equal(shouldSoundThereminOnRelease({ pointerType: "pen", active: true }), true);
  assert.equal(shouldSoundThereminOnRelease({ pointerType: "mouse", active: true }), false);
  assert.equal(shouldSoundThereminOnRelease({ pointerType: "touch", active: false }), false);
  assert.throws(
    () => shouldSoundThereminOnRelease({ pointerType: "touch" }),
    /active state/i,
  );
});

test("a failed theremin release can never be reported as a successful note", () => {
  assert.deepEqual(
    thereminReleaseDisposition({
      wasActive: true,
      releaseFailed: true,
      hasReleaseParameters: false,
    }),
    {
      activeDuringCompletion: true,
      completionPhase: "cancel",
      shouldSoundRelease: false,
    },
  );
  assert.deepEqual(
    thereminReleaseDisposition({
      wasActive: true,
      releaseFailed: false,
      hasReleaseParameters: true,
    }),
    {
      activeDuringCompletion: false,
      completionPhase: null,
      shouldSoundRelease: true,
    },
  );
  assert.deepEqual(
    thereminReleaseDisposition({
      wasActive: true,
      releaseFailed: false,
      hasReleaseParameters: false,
    }),
    {
      activeDuringCompletion: true,
      completionPhase: null,
      shouldSoundRelease: false,
    },
  );
  assert.deepEqual(
    thereminReleaseDisposition({
      wasActive: false,
      releaseFailed: false,
      hasReleaseParameters: false,
    }),
    {
      activeDuringCompletion: false,
      completionPhase: "cancel",
      shouldSoundRelease: false,
    },
  );
  assert.throws(
    () => thereminReleaseDisposition({
      wasActive: true,
      releaseFailed: "yes",
      hasReleaseParameters: false,
    }),
    /explicit release state/i,
  );
});

test("theremin onboarding advances only after the instrument really sounded", () => {
  assert.equal(shouldCelebrateThereminEnd({ sounded: true }), true);
  assert.equal(shouldCelebrateThereminEnd({ sounded: false }), false);
  assert.throws(
    () => shouldCelebrateThereminEnd({ sounded: "maybe" }),
    /explicit sounded state/i,
  );
});

test("the theremin starts only after a single-finger hold survives navigation gestures", () => {
  assert.equal(shouldBeginThereminHold({ pointerType: "touch", activeTouchCount: 1, traveled: 3 }), true);
  assert.equal(shouldBeginThereminHold({ pointerType: "touch", activeTouchCount: 2, traveled: 3 }), false);
  assert.equal(shouldBeginThereminHold({ pointerType: "touch", activeTouchCount: 1, traveled: 14 }), false);
  assert.equal(shouldBeginThereminHold({ pointerType: "mouse", activeTouchCount: 0, traveled: 3 }), true);
  assert.throws(
    () => shouldBeginThereminHold({ pointerType: "touch", activeTouchCount: 1, traveled: Number.NaN }),
    /finite travel distance/i,
  );
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
  // A Retina desktop must draw at its real physical resolution. Anything less
  // is upscaled, and upscaling is exactly what reads as "pixelated".
  assert.equal(desktop.pixelRatio, 2);
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
  assert.equal(compact.pixelRatio, 2);
  assert.ok(
    390 * 844 * compact.pixelRatio ** 2 <= compact.maxBackingPixels,
    "a Retina phone stays inside its physical-pixel budget",
  );
  assert.equal(compact.particleCount, 480);
  assert.equal(compact.trailSamples, 96);

  const reduced = selectRenderProfile({
    width: 390,
    height: 844,
    devicePixelRatio: 3,
    hardwareConcurrency: 4,
    reducedMotion: true,
  });
  assert.equal(reduced.pixelRatio, 2);
  assert.equal(reduced.particleCount, 90);
  assert.equal(reduced.trailSamples, 40);
  assert.equal(reduced.autoDrift, false);
  assert.equal(reduced.twinkle, false);
  assert.equal(reduced.grain, false);
  assert.equal(compact.grain, false);
  assert.ok(reduced.starCount < compact.starCount);
  assert.ok(compact.starCount < desktop.starCount);

  const largeCompact = selectRenderProfile({
    width: 768,
    height: 1024,
    devicePixelRatio: 2,
    hardwareConcurrency: 4,
    reducedMotion: false,
  });
  assert.ok(largeCompact.pixelRatio > 1);
  assert.ok(largeCompact.pixelRatio < 2);
  assert.ok(
    768 * 1024 * largeCompact.pixelRatio ** 2 <= largeCompact.maxBackingPixels + 1,
    "large low-core screens stay sharp without exceeding the mobile GPU budget",
  );

  // A full-screen browser on a Retina laptop is the ordinary case, not an
  // extreme one: it has to stay at a real 2x.
  const laptopFullScreen = selectRenderProfile({
    width: 1728,
    height: 1085,
    devicePixelRatio: 2,
    hardwareConcurrency: 10,
    reducedMotion: false,
  });
  assert.equal(laptopFullScreen.pixelRatio, 2);

  // Only a genuinely enormous canvas gives ground, and it gives it gradually.
  const fiveK = selectRenderProfile({
    width: 2560,
    height: 1440,
    devicePixelRatio: 2,
    hardwareConcurrency: 10,
    reducedMotion: false,
  });
  assert.ok(fiveK.pixelRatio < 2, "a 5K canvas trims the backing buffer");
  assert.ok(fiveK.pixelRatio > 1.5, "…but never back down to a soft image");

  assert.throws(() => selectRenderProfile({
    width: 390,
    height: 844,
    devicePixelRatio: Number.NaN,
    hardwareConcurrency: 4,
    reducedMotion: false,
  }), /finite device metrics/i);
});

test("a visited system is framed so every one of its worlds stays on screen", () => {
  const radius = 4.2;
  for (const [aspect, fovDegrees] of [[1.6, 42], [390 / 844, 55], [844 / 390, 42], [1, 42]]) {
    const distance = visitedSystemCameraDistance(radius, aspect);
    const halfFov = (fovDegrees * Math.PI) / 360;
    const halfWidth = Math.tan(halfFov) * distance * aspect;
    assert.ok(
      halfWidth >= radius * 1.2,
      `an outermost orbit at ${aspect.toFixed(2)} stays inside the frame`,
    );
  }
  // A tall frame has to stand further back than a wide one for the same system.
  assert.ok(
    visitedSystemCameraDistance(radius, 390 / 844) > visitedSystemCameraDistance(radius, 1.6),
  );
  assert.throws(
    () => visitedSystemCameraDistance(0, 1.6),
    /finite radius and aspect/i,
  );
});

test("quality adapts to measured frame cost instead of guessing from device metrics", () => {
  assert.equal(QUALITY_LADDER[0].pixelRatioScale, 1);
  assert.equal(QUALITY_LADDER[0].samples, 4);
  for (let index = 1; index < QUALITY_LADDER.length; index += 1) {
    assert.ok(
      QUALITY_LADDER[index].pixelRatioScale <= QUALITY_LADDER[index - 1].pixelRatioScale,
      "the ladder only ever gets cheaper",
    );
  }
  // Multisampling is surrendered before resolution: a slightly softer line edge
  // costs less beauty than a whole upscaled image.
  assert.ok(QUALITY_LADDER[1].pixelRatioScale === 1 && QUALITY_LADDER[1].samples < 4);

  // Dropping frames on a 60 Hz display: 33 ms against a 16.7 ms refresh.
  assert.deepEqual(
    nextQualityLevel({ level: 0, medianFrameMillis: 33, fastestFrameMillis: 16.7 }),
    { level: 1, goodWindows: 0 },
  );

  // The case an absolute threshold could never see: a downgraded machine now
  // sitting exactly on a 60 Hz vsync has to be able to climb back.
  let state = { level: 2, goodWindows: 0 };
  for (let window = 0; window < 3; window += 1) {
    state = nextQualityLevel({ ...state, medianFrameMillis: 16.7, fastestFrameMillis: 16.6 });
    assert.equal(state.level, 2, "one good window is not enough to spend resolution again");
  }
  state = nextQualityLevel({ ...state, medianFrameMillis: 16.7, fastestFrameMillis: 16.6 });
  assert.deepEqual(state, { level: 1, goodWindows: 0 }, "sustained smoothness recovers quality");

  // The same must hold on a 120 Hz display, where 8.3 ms is keeping up.
  assert.deepEqual(
    nextQualityLevel({
      level: 1,
      goodWindows: 3,
      medianFrameMillis: 8.4,
      fastestFrameMillis: 8.3,
    }),
    { level: 0, goodWindows: 0 },
  );
  // …and 16.7 ms on that same 120 Hz display is dropping every other frame.
  assert.equal(
    nextQualityLevel({ level: 0, medianFrameMillis: 16.7, fastestFrameMillis: 8.3 }).level,
    1,
  );

  // A single good window in the middle of a bad stretch does not accumulate.
  assert.equal(
    nextQualityLevel({
      level: 2,
      goodWindows: 3,
      medianFrameMillis: 21,
      fastestFrameMillis: 16.6,
    }).goodWindows,
    0,
  );

  assert.equal(
    nextQualityLevel({
      level: QUALITY_LADDER.length - 1,
      medianFrameMillis: 90,
      fastestFrameMillis: 16.7,
    }).level,
    QUALITY_LADDER.length - 1,
  );
  assert.equal(nextQualityLevel({ level: 0, goodWindows: 9, medianFrameMillis: 16.7 }).level, 0);
  assert.throws(
    () => nextQualityLevel({ level: 0, medianFrameMillis: Number.NaN }),
    /finite/i,
  );
});

test("orbit lines are multisampled, because alpha-to-coverage needs real samples", () => {
  const desktop = selectRenderProfile({
    width: 1440,
    height: 1024,
    devicePixelRatio: 2,
    hardwareConcurrency: 10,
    reducedMotion: false,
  });
  const compact = selectRenderProfile({
    width: 390,
    height: 844,
    devicePixelRatio: 3,
    hardwareConcurrency: 4,
    reducedMotion: false,
  });
  const reduced = selectRenderProfile({
    width: 390,
    height: 844,
    devicePixelRatio: 3,
    hardwareConcurrency: 4,
    reducedMotion: true,
  });

  assert.equal(desktop.samples, 4);
  assert.equal(compact.samples, 4);
  assert.equal(reduced.samples, 0, "reduced motion trades edge quality for battery");
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

test("camera distance uses honest semantic scale labels instead of fake continuous units", () => {
  assert.equal(cameraScaleLabel(5), "0.6 AU");
  assert.equal(cameraScaleLabel(10), "1.2 AU");
  assert.equal(cameraScaleLabel(27), "WITHIN 50 LY");
  assert.equal(cameraScaleLabel(50), "≈100 KLY WIDE");
  assert.equal(cameraScaleLabel(63), "≈10 MLY WIDE");
  assert.equal(cameraScaleLabel(72), "COSMIC WEB");
});

test("semantic camera directions reveal the form of each world without twisting the player", () => {
  const system = cosmicCameraDirection("system");
  const galaxy = cosmicCameraDirection("galaxy");
  const localGroup = cosmicCameraDirection("localGroup");

  assert.ok(system.z > system.y, "the orbit harp stays in its familiar editorial angle");
  const visited = cosmicCameraDirection("visitedSystem");
  assert.ok(
    visited.y > system.y,
    "a system you are only reading opens further, so its orbits separate",
  );
  assert.ok(visited.z > visited.y, "…without tipping into a flat map from above");
  assert.ok(galaxy.y > galaxy.z, "the Milky Way opens toward a legible face-on spiral");
  assert.ok(localGroup.z > localGroup.y, "the Local Group regains spatial depth");
  assert.ok(["system", "visitedSystem", "neighborhood", "galaxy", "localGroup", "universe"].every((id) => {
    const direction = cosmicCameraDirection(id);
    return Math.abs(Math.hypot(direction.x, direction.y, direction.z) - 1) < 1e-9;
  }));
  assert.throws(() => cosmicCameraDirection("nowhere"), /unknown cosmic camera scale/i);
});

test("each cosmic world has an authored centre instead of drifting off a small screen", () => {
  const star = { x: 2, y: 0, z: -1 };
  assert.deepEqual(cosmicCameraTarget("system", star), star);
  assert.deepEqual(cosmicCameraTarget("neighborhood", star), star);
  assert.deepEqual(cosmicCameraTarget("galaxy", star), {
    x: -3.2,
    y: -0.7,
    z: -1,
  });
  assert.deepEqual(cosmicCameraTarget("localGroup", star), {
    x: 1,
    y: 0,
    z: -3.5,
  });
  assert.deepEqual(cosmicCameraTarget("universe", star), {
    x: 2,
    y: 0,
    z: -11,
  });
  assert.throws(() => cosmicCameraTarget("nowhere", star), /unknown cosmic camera scale/i);
  assert.throws(
    () => cosmicCameraTarget("galaxy", { x: Number.NaN, y: 0, z: 0 }),
    /finite star position/i,
  );
});

test("explicit camera zoom stays inside the same safe flight envelope as gestures", () => {
  assert.equal(nextCameraDistance(8, -1), 6.4);
  assert.equal(nextCameraDistance(3.3, -1), 3.2);
  assert.equal(nextCameraDistance(23.4, 1), 25);
  assert.equal(nextCameraDistance(71.5, 1), 72);
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

test("the grip on a visited system's star is measured on screen, never on its plane", () => {
  // A visited system is a flat disc seen from about 38 degrees above its own
  // plane, so the part of the screen that maps to "inside the innermost orbit"
  // is a thin band: a press aimed squarely at the Sun landed 4.5 units out on
  // a plane whose limit was 0.95, and adding a world to a real system was
  // therefore impossible. A player aims at what they can see.
  assert.equal(starGripRadius({ width: 1280, height: 800 }), 68);
  // Never below the smallest thing a finger may be asked to hit.
  assert.equal(starGripRadius({ width: 390, height: 480 }), 44);
  assert.equal(starGripRadius({ width: 2560, height: 1600 }), 136);
  assert.throws(() => starGripRadius({ width: 0, height: 800 }), /finite viewport/i);
  assert.throws(() => starGripRadius({ width: 800 }), /finite viewport/i);
});

test("a world in a visited system is big enough to hit with a finger", () => {
  // Measured on a 390 by 844 portrait phone before this existed: all 131
  // catalogue worlds projected touch targets between 15 and 42 pixels across.
  // Not one reached the 44 this instrument asks of anything a finger must hit,
  // and the size was baked when the system was built rather than solved
  // against the camera that fits it to the frame.
  const pixelsPerWorldUnit = 39.3;
  const small = systemTouchRadius({ bodyRadius: 0.052, pixelsPerWorldUnit });
  assert.ok(small * 2 * pixelsPerWorldUnit >= 44, `smallest world was ${(small * 2 * pixelsPerWorldUnit).toFixed(1)} px`);

  // A world already comfortable is not shrunk to the minimum.
  const roomy = systemTouchRadius({ bodyRadius: 0.158, pixelsPerWorldUnit: 400 });
  assert.ok(Math.abs(roomy - 0.158 * 3.4) < 1e-9, "a generous target keeps its generosity");
});

test("a touch target never swells past its share of the gap to the next orbit", () => {
  // Two worlds that both claim the same pixel are worse than one that is small.
  const crowded = systemTouchRadius({
    bodyRadius: 0.052,
    pixelsPerWorldUnit: 39.3,
    neighbourGap: 0.4,
  });
  assert.ok(crowded <= 0.4 * 0.46 + 1e-9, `crowded target was ${crowded}`);
  const open = systemTouchRadius({
    bodyRadius: 0.052,
    pixelsPerWorldUnit: 39.3,
    neighbourGap: 4,
  });
  assert.ok(open * 2 * 39.3 >= 44, "an open system still reaches the minimum");
});

test("a touch target refuses to be sized from nonsense", () => {
  assert.throws(() => systemTouchRadius({ bodyRadius: 0, pixelsPerWorldUnit: 40 }), /positive body radius/);
  assert.throws(() => systemTouchRadius({ bodyRadius: 0.1, pixelsPerWorldUnit: 0 }), /pixels per world unit/);
  assert.throws(
    () => systemTouchRadius({ bodyRadius: 0.1, pixelsPerWorldUnit: 40, minimumPixels: 0 }),
    /positive minimum/,
  );
});

test("a tall frame looks further down onto a visited system than a wide one", () => {
  // A planetary system is a flat disc, so the angle decides how much of the
  // picture it occupies. The fit solves for width — measured on a 390 by 844
  // phone at 38 degrees, the system filled 85% of the width and 24% of the
  // height and floated in an empty column.
  const laptop = visitedSystemElevation(1440 / 900);
  const phone = visitedSystemElevation(390 / 844);
  assert.ok(Math.abs(laptop - (38 * Math.PI) / 180) < 1e-9, "a wide frame keeps the low angle");
  assert.ok(phone > laptop, "a tall frame looks further down");
  assert.ok(phone < (75 * Math.PI) / 180, "never overhead — a disc seen from above is a diagram");

  // How much of the frame that actually buys, at the solved fit distance.
  const share = (aspect, height) => {
    const distance = visitedSystemCameraDistance(4.2, aspect);
    const halfFrame = Math.tan((52 * Math.PI) / 360) * distance;
    return (4.2 * Math.sin(visitedSystemElevation(aspect))) / halfFrame;
  };
  assert.ok(share(390 / 844) > 0.33, `portrait fills ${(share(390 / 844) * 100).toFixed(0)}% of the height`);
  assert.ok(share(1440 / 900) > 0.33, "and a laptop still does too");
});

test("a visited system's elevation refuses a frame it cannot read", () => {
  assert.throws(() => visitedSystemElevation(0), /finite aspect/);
  assert.throws(() => visitedSystemElevation(Number.NaN), /finite aspect/);
});
