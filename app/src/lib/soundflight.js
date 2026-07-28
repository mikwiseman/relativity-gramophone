import { spectralMix } from "./sonification.js";

const DEFAULT_STATE = Object.freeze({ mode: "compose", followingBodyId: null });
export const INITIAL_PLAYBACK = true;
export const INSTRUMENT_TITLE = "WAI GRAMOPHONE";

/**
 * Sound that has never started and sound the browser took away are not the
 * same state, and collapsing them into one is what put a full-screen "TOUCH TO
 * HEAR · ONE TAP STARTS THE UNIVERSE" over a universe the player had already
 * made. Switching to another tab suspends the audio context; coming back then
 * claimed nothing had ever happened — and because the canvas is deliberately
 * inert behind that gate, it also took away every gesture at once. A player
 * who could not make a planet, could not make a moon and could not touch an
 * orbit was not hitting three bugs. They were hitting this one.
 *
 * So `locked` now means only what it says: this instrument has never made a
 * sound, and a trusted gesture is still owed. Once it has sounded, a suspended
 * context is `suspended` — the canvas stays alive, and the next thing the
 * player touches starts the sound on its way to doing what they asked.
 */
export function reconcileAudioState({ engineState, intentionalPause, hasSounded = false }) {
  if (typeof engineState !== "string" || typeof intentionalPause !== "boolean") {
    throw new Error("Audio reconciliation requires engine state and intentional pause");
  }
  if (typeof hasSounded !== "boolean") {
    throw new Error("Audio reconciliation requires whether this instrument has ever sounded");
  }
  if (intentionalPause) {
    return {
      audioState: "paused",
      shouldSuspend: engineState === "running",
    };
  }
  if (engineState === "running") return { audioState: "running", shouldSuspend: false };
  return {
    audioState: hasSounded ? "suspended" : "locked",
    shouldSuspend: false,
  };
}

export function playbackControl({ audioState, isPlaying }) {
  if (!["locked", "suspended", "paused", "running"].includes(audioState)) {
    throw new Error(`Unknown audio state: ${audioState ?? "missing"}`);
  }
  if (audioState === "locked") {
    return {
      icon: "play",
      label: "START SOUND",
      ariaLabel: "Start sound",
      pressed: false,
    };
  }
  if (audioState === "running" && isPlaying) {
    return {
      icon: "pause",
      label: "PAUSE",
      ariaLabel: "Pause music",
      pressed: true,
    };
  }
  return {
    icon: "play",
    label: "PLAY",
    ariaLabel: "Play music",
    pressed: false,
  };
}

const VOICE_VISUALS = Object.freeze({
  earth: Object.freeze({ label: "EARTH", colorName: "CYAN", color: 0x72edff }),
  moon: Object.freeze({ label: "MOON", colorName: "AMBER", color: 0xffc66d }),
  light: Object.freeze({ label: "LIGHT", colorName: "MAGENTA", color: 0xff76d6 }),
  "alpha-centauri": Object.freeze({ label: "ALPHA CEN", colorName: "MINT", color: 0x8fffc1 }),
  theremin: Object.freeze({ label: "THEREMIN", colorName: "VIOLET", color: 0xb99cff }),
  ondes: Object.freeze({ label: "ONDES", colorName: "AZURE", color: 0x7fb8ff }),
  trautonium: Object.freeze({ label: "TRAUTONIUM", colorName: "COPPER", color: 0xff8a66 }),
});

const DOPPLER_APPROACH_TINT = Object.freeze({ r: 0x86 / 255, g: 0xe6 / 255, b: 0xff / 255 });
const DOPPLER_RECEDE_TINT = Object.freeze({ r: 0xff / 255, g: 0x8a / 255, b: 0x66 / 255 });

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function createSoundflightState() {
  return { ...DEFAULT_STATE };
}

const LAUNCH_GUIDANCE = Object.freeze({
  armed: Object.freeze({
    eyebrow: "CREATE A SINGING WORLD",
    title: "DRAG FROM THE STAR",
    detail: "Distance chooses the pitch",
    activeStep: 0,
  }),
  forming: Object.freeze({
    eyebrow: "A NEW VOICE IS FORMING",
    title: "MOVE OUTWARD",
    detail: "Close sings high · far sings low",
    activeStep: 1,
  }),
  aiming: Object.freeze({
    eyebrow: "THE ORBIT IS READY",
    title: "RELEASE TO HEAR IT",
    detail: "A stable voice joins the symphony",
    activeStep: 2,
  }),
});

export function launchGuidance(phase) {
  const guidance = LAUNCH_GUIDANCE[phase];
  if (!guidance) throw new Error(`Unknown launch phase: ${phase}`);
  return { ...guidance };
}

const MOON_GUIDANCE = Object.freeze({
  armed: Object.freeze({
    eyebrow: "ADD A MOON",
    title: "DRAG FROM {PARENT} TO ITS HALO",
    detail: "Release anywhere inside the glowing orbit",
  }),
  forming: Object.freeze({
    eyebrow: "MOON ORBIT",
    title: "MOVE INTO THE HALO",
    detail: "Near sounds brighter · far sounds slower",
  }),
  aiming: Object.freeze({
    eyebrow: "MOON ORBIT READY",
    title: "RELEASE TO ADD THE MOON",
    detail: "Its orbit becomes an overtone",
  }),
});

export function moonGuidance(phase, parentLabel = "EUROPA") {
  const guidance = MOON_GUIDANCE[phase];
  if (!guidance) throw new Error(`Unknown moon phase: ${phase}`);
  return {
    ...guidance,
    title: guidance.title.replace("{PARENT}", parentLabel.toUpperCase()),
  };
}

export function canBeginRadialLaunchFromHit(bodyId) {
  return bodyId == null || bodyId === "star";
}

export function shouldApplyGestationUpdate({ requestId, currentRequestId, engaged }) {
  return engaged && requestId === currentRequestId;
}

export function shouldApplyThereminRelease({ requestId, currentRequestId }) {
  if (!Number.isInteger(requestId) || !Number.isInteger(currentRequestId)) {
    throw new Error("Theremin release requires integer request ids");
  }
  return requestId === currentRequestId;
}

export function shouldShowMoonPlacementGuide({ activeDrag }) {
  if (typeof activeDrag !== "boolean") {
    throw new Error("Moon placement guide requires an explicit drag state");
  }
  return activeDrag;
}

export function shouldArmDirectMoon({
  body,
  interactionMode,
  isListener,
  siblingCount,
  liveBodyCount,
  maxWorlds,
}) {
  if (typeof interactionMode !== "string"
    || typeof isListener !== "boolean"
    || !Number.isInteger(siblingCount)
    || !Number.isInteger(liveBodyCount)
    || !Number.isInteger(maxWorlds)) {
    throw new Error("Direct moon creation requires an explicit interaction state");
  }
  return !isListener
    && interactionMode === "compose"
    && body?.kind === "planet"
    && siblingCount < 2
    && liveBodyCount < maxWorlds;
}

export function audioUnlockPhase(pointerType) {
  if (typeof pointerType !== "string" || pointerType.length === 0) {
    throw new Error("Audio unlock requires a pointer type");
  }
  return pointerType === "mouse" ? "pointerdown" : "pointerup";
}

export function shouldCancelDirectManipulation({ pointerType, activeTouchCount }) {
  if (pointerType !== "touch") return false;
  if (!Number.isInteger(activeTouchCount) || activeTouchCount < 1) {
    throw new Error("Direct manipulation requires a positive touch count");
  }
  return activeTouchCount > 1;
}

export function shouldDeferStringPluck(pointerType) {
  if (typeof pointerType !== "string" || pointerType.length === 0) {
    throw new Error("String pluck requires a pointer type");
  }
  return pointerType !== "mouse";
}

/**
 * Whether a string crossed *during* a sweep sounds now or waits.
 *
 * A tap on a string waits for the release, so that a second finger arriving
 * can cancel the note and a pinch is never heard as music. A sweep is a
 * different gesture: the hand is already down and moving across the orbits,
 * and holding every crossing back until the finger lifts turns a strum across
 * three strings into a single late note. So a sweep sounds as it happens —
 * unless a second finger really is down, which is the case the waiting was
 * protecting in the first place.
 */
export function shouldSoundSweptString({ pointerType, activeTouchCount = 0 }) {
  if (typeof pointerType !== "string" || pointerType.length === 0) {
    throw new Error("A swept string requires a pointer type");
  }
  if (!Number.isInteger(activeTouchCount) || activeTouchCount < 0) {
    throw new Error("A swept string requires how many touches are down");
  }
  if (pointerType === "mouse") return true;
  return activeTouchCount <= 1;
}

export function shouldSoundThereminOnRelease({ pointerType, active }) {
  if (typeof active !== "boolean") {
    throw new Error("Theremin release requires an explicit active state");
  }
  return active && audioUnlockPhase(pointerType) === "pointerup";
}

export function thereminReleaseDisposition({
  wasActive,
  releaseFailed,
  hasReleaseParameters,
}) {
  if (typeof wasActive !== "boolean"
    || typeof releaseFailed !== "boolean"
    || typeof hasReleaseParameters !== "boolean") {
    throw new Error("Theremin completion requires an explicit release state");
  }
  const shouldSoundRelease = wasActive && !releaseFailed && hasReleaseParameters;
  return {
    activeDuringCompletion: wasActive && !shouldSoundRelease,
    completionPhase: releaseFailed || !wasActive ? "cancel" : null,
    shouldSoundRelease,
  };
}

export function shouldBeginThereminHold({
  pointerType,
  activeTouchCount,
  traveled,
  dragThreshold = 8,
}) {
  if (!Number.isFinite(traveled) || traveled < 0) {
    throw new Error("Theremin hold requires a finite travel distance");
  }
  if (!Number.isFinite(dragThreshold) || dragThreshold <= 0) {
    throw new Error("Theremin hold requires a positive drag threshold");
  }
  if (pointerType === "touch") {
    if (!Number.isInteger(activeTouchCount) || activeTouchCount < 0) {
      throw new Error("Theremin hold requires a valid touch count");
    }
    return activeTouchCount === 1 && traveled <= dragThreshold;
  }
  return activeTouchCount === 0 && traveled <= dragThreshold;
}

export function shouldRefreshMusicalConnection({
  now,
  lastUpdatedAt,
  previous,
  first,
  second,
  minInterval,
}) {
  if (!Number.isFinite(now)
    || !Number.isFinite(first?.x)
    || !Number.isFinite(first?.z)
    || !Number.isFinite(second?.x)
    || !Number.isFinite(second?.z)
    || !Number.isFinite(minInterval)) {
    throw new Error("Musical connection refresh requires finite positions and timing");
  }
  if (typeof lastUpdatedAt !== "number" || Number.isNaN(lastUpdatedAt) || minInterval <= 0) {
    throw new Error("Musical connection refresh requires valid timing");
  }
  if (previous == null) return true;
  if (previous.length !== 4) {
    throw new Error("Musical connection refresh requires four previous coordinates");
  }
  for (let index = 0; index < previous.length; index += 1) {
    if (!Number.isFinite(previous[index])) {
      throw new Error("Musical connection refresh requires four previous coordinates");
    }
  }
  const moved = Math.abs(previous[0] - first.x) > 0.0001
    || Math.abs(previous[1] - first.z) > 0.0001
    || Math.abs(previous[2] - second.x) > 0.0001
    || Math.abs(previous[3] - second.z) > 0.0001;
  return moved && now - lastUpdatedAt >= minInterval;
}

export function voiceVisual(voiceId) {
  const visual = VOICE_VISUALS[voiceId];
  if (!visual) throw new Error(`Unknown cosmic voice: ${voiceId}`);
  return { ...visual };
}

export function dopplerTintedColor(hexColor, doppler) {
  if (!Number.isFinite(hexColor) || !Number.isFinite(doppler)) {
    throw new Error("Doppler tinting requires a finite color and doppler factor");
  }
  const { shift } = spectralMix({ doppler });
  const tint = shift >= 0 ? DOPPLER_APPROACH_TINT : DOPPLER_RECEDE_TINT;
  const amount = Math.abs(shift) * 0.38;
  const mix = (channel, target) => clamp(channel + (target - channel) * amount, 0, 1);
  return {
    r: mix(((hexColor >> 16) & 0xff) / 255, tint.r),
    g: mix(((hexColor >> 8) & 0xff) / 255, tint.g),
    b: mix((hexColor & 0xff) / 255, tint.b),
    shift,
  };
}

export function buildMusicalConnections(bodies, star) {
  if (![star?.x, star?.y].every(Number.isFinite)) throw new Error("Musical connections require a finite star position");
  return bodies.map((body, index) => {
    if (![body?.x, body?.y].every(Number.isFinite)) throw new Error(`Musical connection requires a finite body: ${body?.id ?? "missing"}`);
    const visual = voiceVisual(body.voice);
    return {
      bodyId: body.id,
      sourceId: index === 0 ? "star" : bodies[index - 1].id,
      voice: body.voice,
      color: visual.color,
    };
  });
}

export function buildResonanceBridge(bodies, resonance) {
  if (!resonance) return null;
  if (!Array.isArray(resonance.bodyIds) || resonance.bodyIds.length !== 2) {
    throw new Error("A resonance bridge requires exactly two bodies");
  }
  const first = bodies.find((body) => body.id === resonance.bodyIds[0]);
  const second = bodies.find((body) => body.id === resonance.bodyIds[1]);
  if (!first || !second) throw new Error("A resonance bridge requires two live bodies");
  if (![resonance.numerator, resonance.denominator, resonance.strength].every(Number.isFinite)) {
    throw new Error("A resonance bridge requires a finite physical ratio");
  }
  return {
    label: resonance.label,
    numerator: resonance.numerator,
    denominator: resonance.denominator,
    bodyIds: [...resonance.bodyIds],
    colors: [voiceVisual(first.voice).color, voiceVisual(second.voice).color],
    strength: resonance.strength,
  };
}

export function frequencyToNoteName(frequency) {
  if (!Number.isFinite(frequency) || frequency <= 0) throw new Error("Frequency must be positive");
  const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
  const notes = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
  return `${notes[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

export function reduceSoundflightState(state, action) {
  switch (action.type) {
    case "ARM_LAUNCH":
      return { mode: "launch", followingBodyId: null };
    case "FOLLOW_BODY":
      if (!action.bodyId) throw new Error("FOLLOW_BODY requires a bodyId");
      return createSoundflightState();
    case "COMPLETE_LAUNCH":
      if (!action.bodyId) throw new Error("COMPLETE_LAUNCH requires a bodyId");
      return createSoundflightState();
    case "ARM_MOON":
      if (!action.bodyId) throw new Error("ARM_MOON requires a bodyId");
      return { mode: "moon", followingBodyId: action.bodyId };
    case "COMPLETE_MOON":
      if (!action.bodyId) throw new Error("COMPLETE_MOON requires a bodyId");
      return createSoundflightState();
    case "ENTER_EXPLORE":
      return { mode: "explore", followingBodyId: null };
    case "EXIT_EXPLORE":
      return createSoundflightState();
    case "USER_NAVIGATE":
      return state.mode === "explore" ? state : createSoundflightState();
    case "CANCEL":
      return createSoundflightState();
    default:
      throw new Error(`Unknown soundflight action: ${action.type}`);
  }
}

export function selectRenderProfile({
  width,
  height,
  devicePixelRatio,
  hardwareConcurrency,
  reducedMotion,
}) {
  if (![width, height, devicePixelRatio, hardwareConcurrency].every(Number.isFinite)) {
    throw new Error("Soundflight render profile requires finite device metrics");
  }

  const compact = Math.min(width, height) < 620 || hardwareConcurrency <= 4;
  // The budget has to be large enough that an ordinary full-screen browser on a
  // Retina laptop still draws at a real 2x — a canvas upscaled from 1.2x or 1.5x
  // is precisely what the eye reads as "pixelated". Only a canvas far larger
  // than a laptop screen gives any resolution back, and the adaptive quality
  // ladder (`nextQualityLevel`) then trims the rest from measured frame cost
  // rather than from a guess made before a single frame has been drawn.
  const maxBackingPixels = compact ? 2_600_000 : 12_000_000;
  const idealPixelRatio = Math.min(2, Math.max(1, devicePixelRatio));
  const budgetPixelRatio = Math.sqrt(maxBackingPixels / Math.max(1, width * height));
  const pixelRatio = Math.min(idealPixelRatio, Math.max(1, budgetPixelRatio));

  if (reducedMotion) {
    return {
      pixelRatio,
      maxBackingPixels,
      samples: 0,
      particleCount: 90,
      trailSamples: 40,
      bloomStrength: 0.72,
      starCount: 700,
      dustCount: 260,
      twinkle: false,
      grain: false,
      autoDrift: false,
    };
  }

  if (compact) {
    return {
      pixelRatio,
      maxBackingPixels,
      samples: 4,
      particleCount: 480,
      trailSamples: 96,
      bloomStrength: 0.92,
      starCount: 1500,
      dustCount: 620,
      twinkle: true,
      grain: false,
      autoDrift: false,
    };
  }

  return {
    pixelRatio,
    maxBackingPixels,
    samples: 4,
    particleCount: 1100,
    trailSamples: 160,
    bloomStrength: 1.18,
    starCount: 2600,
    dustCount: 1100,
    twinkle: true,
    grain: true,
    autoDrift: false,
  };
}

/**
 * The order in which GPU cost is surrendered when a machine cannot hold the
 * full-resolution artwork at frame rate. Multisampling goes first, because a
 * marginally softer line edge costs far less beauty than upscaling the whole
 * image; resolution is only traded away after that, and gradually.
 */
export const QUALITY_LADDER = [
  { pixelRatioScale: 1, samples: 4 },
  { pixelRatioScale: 1, samples: 2 },
  { pixelRatioScale: 0.84, samples: 2 },
  { pixelRatioScale: 0.7, samples: 2 },
  { pixelRatioScale: 0.58, samples: 0 },
];

/**
 * One step of the adaptive ladder, from the median and the floor of a whole
 * measurement window.
 *
 * The measurement is relative to the display, not to a fixed millisecond
 * count. A browser paces `requestAnimationFrame` to vsync, so a machine that
 * is comfortably keeping up still reports 16.7 ms on a 60 Hz screen and 8.3 ms
 * on a 120 Hz one; an absolute "faster than 13 ms means recover" threshold is
 * simply unreachable on the commonest display there is, and the artwork would
 * stay dimmed forever after one slow moment. The fastest frame in the window is
 * the refresh interval, and keeping up means the median sits on it.
 *
 * Median rather than mean, so one stall — a texture upload, a collection —
 * never dims the artwork; and recovery asks for several good windows in a row
 * while one bad window is enough to give ground, so a machine sitting exactly
 * on the boundary settles instead of oscillating.
 */
export function nextQualityLevel({
  level,
  medianFrameMillis,
  fastestFrameMillis = medianFrameMillis,
  goodWindows = 0,
  slowRatio = 1.55,
  keepingUpRatio = 1.18,
  windowsBeforeRecovery = 4,
}) {
  if (!Number.isFinite(medianFrameMillis) || !Number.isFinite(fastestFrameMillis)) {
    throw new Error("Adaptive quality needs a finite measured frame cost");
  }
  const refresh = Math.max(1, Math.min(fastestFrameMillis, medianFrameMillis));
  if (medianFrameMillis > refresh * slowRatio) {
    return { level: Math.min(QUALITY_LADDER.length - 1, level + 1), goodWindows: 0 };
  }
  if (medianFrameMillis > refresh * keepingUpRatio) return { level, goodWindows: 0 };
  const windows = goodWindows + 1;
  if (level > 0 && windows >= windowsBeforeRecovery) {
    return { level: level - 1, goodWindows: 0 };
  }
  return { level, goodWindows: windows };
}

export function bodyToStage(body, scale = 10) {
  if (!Number.isFinite(body?.x) || !Number.isFinite(body?.y) || !Number.isFinite(scale)) {
    throw new Error("A finite body position and stage scale are required");
  }
  return { x: body.x * scale, y: 0, z: -body.y * scale };
}

export function sonicIntensity({ displayMass, doppler, resonanceStrength, impulse }) {
  if (![displayMass, doppler, resonanceStrength, impulse].every(Number.isFinite)) {
    throw new Error("Sonic intensity requires finite physical values");
  }
  const massEnergy = clamp(displayMass, 0, 1) * 0.14;
  const dopplerEnergy = clamp(Math.abs(doppler - 1) / 0.06, 0, 1) * 0.26;
  const harmonicEnergy = clamp(resonanceStrength, 0, 1) * 0.24;
  const impulseEnergy = clamp(impulse, 0, 1) * 0.48;
  return clamp(0.03 + massEnergy + dopplerEnergy + harmonicEnergy + impulseEnergy, 0, 1);
}

export function shouldAutoSoundBody(body) {
  if (body?.kind !== "planet" && body?.kind !== "moon") {
    throw new Error("Automatic sound requires a playable body kind");
  }
  return body.kind === "planet";
}

export function shouldOrbitAffectCameraFit(body) {
  if (body?.kind !== "planet" && body?.kind !== "moon") {
    throw new Error("Camera fit requires a playable body kind");
  }
  return body.kind === "planet";
}

export function orbitStringStyle({ kind, selected, isPlaying, impulse }) {
  if ((kind !== "planet" && kind !== "moon")
    || typeof selected !== "boolean"
    || typeof isPlaying !== "boolean"
    || !Number.isFinite(impulse)) {
    throw new Error("Orbit string style requires an explicit playable state");
  }
  const energy = clamp(impulse, 0, 1);
  if (kind === "moon") {
    return {
      opacity: 0.07 + (selected ? 0.07 : 0) + (isPlaying ? 0.01 : 0) + energy * 0.12,
      linewidth: 0.85 + (selected ? 0.3 : 0) + energy * 0.45,
    };
  }
  return {
    opacity: 0.16 + (selected ? 0.15 : 0) + (isPlaying ? 0.025 : 0) + energy * 0.42,
    linewidth: 1.15 + (selected ? 0.75 : 0) + energy * 1.5,
  };
}

export function cameraScaleLabel(distance) {
  if (!Number.isFinite(distance) || distance <= 0) throw new Error("Camera distance must be positive");
  if (distance >= 69) return "COSMIC WEB";
  if (distance >= 59) return "≈10 MLY WIDE";
  if (distance >= 38) return "≈100 KLY WIDE";
  if (distance >= 21) return "WITHIN 50 LY";
  return `${(distance * 0.12).toFixed(1)} AU`;
}

const COSMIC_CAMERA_DIRECTIONS = Object.freeze({
  system: Object.freeze({ x: 0, y: 0.37, z: 0.929 }),
  // A visited system is read, not composed in. Seven concentric orbits seen at
  // the composition angle collapse into one another; lifted to about 38 degrees
  // they separate into rings a child can aim at one at a time.
  visitedSystem: Object.freeze({ x: 0, y: 0.62, z: 0.785 }),
  neighborhood: Object.freeze({ x: -0.08, y: 0.31, z: 0.948 }),
  galaxy: Object.freeze({ x: 0.06, y: 0.89, z: 0.45 }),
  localGroup: Object.freeze({ x: -0.08, y: 0.42, z: 0.904 }),
  universe: Object.freeze({ x: 0.04, y: 0.3, z: 0.953 }),
});

const COSMIC_CAMERA_TARGET_OFFSETS = Object.freeze({
  system: Object.freeze({ x: 0, y: 0, z: 0 }),
  visitedSystem: Object.freeze({ x: 0, y: 0, z: 0 }),
  neighborhood: Object.freeze({ x: 0, y: 0, z: 0 }),
  galaxy: Object.freeze({ x: -5.2, y: -0.7, z: 0 }),
  localGroup: Object.freeze({ x: -1, y: 0, z: -2.5 }),
  universe: Object.freeze({ x: 0, y: 0, z: -10 }),
});

/**
 * How far above its own plane a visited system is read from, in the frame the
 * camera actually has.
 *
 * A planetary system is a flat disc, so how much of the picture it occupies is
 * decided by this angle and nothing else. The fit solves for width, because
 * the disc is wide — and on a portrait phone that leaves the system a band
 * filling 85 per cent of the width and 24 per cent of the height, floating in
 * an empty column. Measured, at 38 degrees: 102 pixels of an available 422.
 *
 * A tall frame therefore looks further down onto the system, opening the
 * ellipse into the space it has; a wide frame keeps the low, dramatic angle
 * that separates seven concentric orbits into rings a child can aim at. It
 * never goes overhead — a disc seen from directly above is a diagram.
 */
export function visitedSystemElevation(aspect) {
  if (!Number.isFinite(aspect) || aspect <= 0) {
    throw new Error("A visited system's elevation needs a finite aspect ratio");
  }
  // 38 degrees on anything as wide as a laptop, opening to 62 on a phone held
  // upright. Interpolated on the aspect between those two shapes.
  const tallness = clamp((1.2 - aspect) / (1.2 - 0.46), 0, 1);
  return (38 + tallness * 24) * (Math.PI / 180);
}

export function cosmicCameraDirection(scaleId, seconds = 0, aspect = null) {
  const direction = COSMIC_CAMERA_DIRECTIONS[scaleId];
  if (!direction) throw new Error(`Unknown cosmic camera scale: ${scaleId}`);
  let { x, y, z } = direction;
  if (scaleId === "visitedSystem" && Number.isFinite(aspect) && aspect > 0) {
    const elevation = visitedSystemElevation(aspect);
    y = Math.sin(elevation);
    z = Math.cos(elevation);
    x = 0;
  }
  // A frozen camera on coplanar ellipses is a diagram, however well it is lit.
  // Parallax is the cue that tells an eye "this is a solid thing in space", and
  // a few degrees of slow sway buys it for nothing. Only a system you are
  // reading breathes; the composition camera stays where the player put it.
  if (scaleId === "visitedSystem" && Number.isFinite(seconds)) {
    const azimuth = Math.sin(seconds * 0.185) * 0.075;
    const rise = Math.sin(seconds * 0.121 + 1.4) * 0.045;
    const cos = Math.cos(azimuth);
    const sin = Math.sin(azimuth);
    const swungX = x * cos + z * sin;
    const swungZ = z * cos - x * sin;
    x = swungX;
    z = swungZ;
    y += rise;
  }
  const length = Math.hypot(x, y, z);
  return { x: x / length, y: y / length, z: z / length };
}

export function cosmicCameraTarget(scaleId, starPosition) {
  const offset = COSMIC_CAMERA_TARGET_OFFSETS[scaleId];
  if (!offset) throw new Error(`Unknown cosmic camera scale: ${scaleId}`);
  if (!starPosition || ![starPosition.x, starPosition.y, starPosition.z].every(Number.isFinite)) {
    throw new Error("Cosmic camera target requires a finite star position");
  }
  return {
    x: starPosition.x + offset.x,
    y: starPosition.y + offset.y,
    z: starPosition.z + offset.z,
  };
}

/**
 * How close to a visited system's star a press has to land to begin adding a
 * world, measured in screen pixels.
 *
 * It has to be screen pixels. The system is a flat disc seen from about 38
 * degrees above its own plane, so the region of *screen* that maps to "within
 * the innermost orbit" on that plane is a thin band a few dozen pixels tall,
 * and a hand aiming at the star misses it almost every time — measured on the
 * Solar System, a press aimed squarely at the Sun landed 4.5 units out on a
 * plane whose limit was 0.95. A player aims at what they can see, so that is
 * what is measured.
 *
 * Never below the 44 px the rest of this instrument treats as the smallest
 * thing a finger can be asked to hit.
 */
export function starGripRadius({ width, height }) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("A star grip needs a finite viewport");
  }
  return Math.max(44, Math.min(width, height) * 0.085);
}

/**
 * How wide a world's invisible touch sphere has to be, in world units, for a
 * fingertip to find it.
 *
 * It has to be solved against the camera, not baked when the system is built.
 * A visited system is fitted to the frame, so the same world is a different
 * number of pixels across on a phone and on a laptop — and measured on a
 * 390 by 844 portrait phone, every one of the 131 catalogue worlds came out
 * between 15 and 42 pixels. Not one of them reached the 44 this instrument
 * asks of anything a finger must hit.
 *
 * The cap is what keeps it honest: a target may not swell past its share of
 * the gap to the next orbit, because two worlds that both claim the same pixel
 * are worse than one that is small. Where the gap forbids 44 px, the target
 * takes what the gap allows and the number says so.
 */
export function systemTouchRadius({
  bodyRadius,
  pixelsPerWorldUnit,
  neighbourGap = Infinity,
  minimumPixels = 44,
}) {
  if (!Number.isFinite(bodyRadius) || bodyRadius <= 0) {
    throw new Error("A touch target needs a positive body radius");
  }
  if (!Number.isFinite(pixelsPerWorldUnit) || pixelsPerWorldUnit <= 0) {
    throw new Error("A touch target needs the camera's scale in pixels per world unit");
  }
  if (!Number.isFinite(minimumPixels) || minimumPixels <= 0) {
    throw new Error("A touch target needs a positive minimum in pixels");
  }
  const generous = Math.max(bodyRadius * 3.4, 0.14);
  const comfortable = minimumPixels / 2 / pixelsPerWorldUnit;
  const ceiling = Number.isFinite(neighbourGap) ? Math.max(generous, neighbourGap * 0.46) : Infinity;
  return Math.min(Math.max(generous, comfortable), ceiling);
}

export function nextCameraDistance(distance, direction) {
  if (!Number.isFinite(distance) || distance <= 0) throw new Error("Camera distance must be positive");
  if (direction !== -1 && direction !== 1) throw new Error("Camera zoom direction must be -1 or 1");
  return clamp(distance + direction * 1.6, 3.2, 72);
}

export function editorialCameraDistance(systemRadius, aspect) {
  if (!Number.isFinite(systemRadius) || systemRadius < 0 || !Number.isFinite(aspect) || aspect <= 0) {
    throw new Error("Editorial camera fit requires a finite system radius and aspect");
  }
  const portraitPenalty = aspect < 0.8 ? 0.8 / aspect : 1;
  return clamp(Math.max(8.4, systemRadius * 2.05) * portraitPenalty, 8.4, 24);
}

/**
 * How far back to stand so a whole visited system, and the names under its
 * outermost worlds, are inside the frame.
 *
 * The player's own composition is framed by feel; a system you have travelled
 * to has a known drawn radius, so its fit can be solved instead of guessed.
 * Solving it is what stops a portrait phone from cutting two of TRAPPIST-1's
 * seven worlds off the sides.
 */
export function visitedSystemCameraDistance(outerRadius, aspect) {
  if (!Number.isFinite(outerRadius) || outerRadius <= 0
    || !Number.isFinite(aspect) || aspect <= 0) {
    throw new Error("A visited system fit requires a finite radius and aspect");
  }
  const halfFov = ((aspect < 0.8 ? 55 : 42) * Math.PI) / 360;
  // Names hang below their world, and the orbits are seen at a tilt, so the
  // vertical requirement is smaller than the horizontal one but not by the
  // full cosine.
  const needed = outerRadius * 1.26;
  const forWidth = needed / (Math.tan(halfFov) * aspect);
  const forHeight = (needed * 0.86) / Math.tan(halfFov);
  return clamp(Math.max(forWidth, forHeight), 8.4, 34);
}

export function moonCameraDistance(haloRadius, aspect) {
  if (!Number.isFinite(haloRadius) || haloRadius < 0 || !Number.isFinite(aspect) || aspect <= 0) {
    throw new Error("Moon camera fit requires a finite halo radius and aspect");
  }
  const portraitPenalty = aspect < 0.82 ? 0.82 / aspect : 1;
  return clamp(Math.max(4.8, haloRadius * 3.25) * portraitPenalty, 4.8, 8.8);
}

export function shouldAdvancePhysics({ isPlaying, interactionMode, creationActive = false }) {
  if (typeof isPlaying !== "boolean"
    || typeof interactionMode !== "string"
    || typeof creationActive !== "boolean") {
    throw new Error("Physics playback requires an explicit play state and interaction mode");
  }
  return isPlaying && !creationActive && interactionMode !== "moon";
}

export function shouldCelebrateThereminEnd({ sounded }) {
  if (typeof sounded !== "boolean") {
    throw new Error("Theremin completion requires an explicit sounded state");
  }
  return sounded;
}

/**
 * The four things this instrument can do, taught one gesture at a time.
 *
 * Hear it, play a string, make a world, give that world a moon. The order is
 * the order a child can act in: the sky opens already turning, so there is
 * something to play before there is anything to build.
 *
 * The creation steps do NOT depend on the sky being empty. They used to, and
 * when the instrument changed to open with three worlds already in it, that
 * quietly deleted the entire lesson about making worlds — the one thing the
 * owner asks for first. A step is finished when the player has done it, never
 * when the scene happens to look a certain way.
 */
export function instrumentLesson({
  audioState = "running",
  planetCount,
  hasPluckedOrbit = false,
  hasBornWorld = false,
  hasBornMoon = false,
}) {
  if (!["locked", "suspended", "paused", "running"].includes(audioState)) {
    throw new Error(`Unknown instrument lesson audio state: ${audioState}`);
  }
  if (!Number.isInteger(planetCount) || planetCount < 0) {
    throw new Error("Instrument lesson requires a planet count");
  }
  const total = 4;
  if (audioState !== "running") {
    return {
      step: 1,
      total,
      label: "SOUND",
      instruction: "TOUCH TO HEAR THE UNIVERSE",
      detail: "SOUND STARTS WITH ONE TAP",
    };
  }
  if (planetCount > 0 && !hasPluckedOrbit) {
    return {
      step: 2,
      total,
      label: "PLAY",
      instruction: "TOUCH AN ORBIT",
      detail: "SWIPE IT LIKE A STRING",
    };
  }
  // A moon needs a world to hang on, so an empty sky always asks for a world
  // first however much the player has already built and fed to the star.
  if (!hasBornWorld || planetCount === 0) {
    return {
      step: 3,
      total,
      label: "MAKE A WORLD",
      instruction: "PULL THE STAR",
      detail: "RELEASE TO MAKE A PLANET",
    };
  }
  if (!hasBornMoon) {
    return {
      step: 4,
      total,
      label: "MAKE A MOON",
      instruction: "PULL A WORLD OUTWARD",
      detail: "RELEASE INSIDE ITS GLOWING BAND",
    };
  }
  return null;
}

export function instrumentHint({
  planetCount,
  selectedMoonCount = 0,
  isListener = false,
  hasPluckedOrbit = false,
  thereminPhase = "idle",
  hasPlayedTheremin = false,
}) {
  if (!Number.isInteger(planetCount) || planetCount < 0) {
    throw new Error("Instrument guidance requires a planet count");
  }
  if (!Number.isInteger(selectedMoonCount) || selectedMoonCount < 0) {
    throw new Error("Instrument guidance requires a moon count");
  }
  if (!["idle", "arming", "active"].includes(thereminPhase)) {
    throw new Error(`Unknown theremin guidance phase: ${thereminPhase}`);
  }
  if (isListener) return "TOUCH A GLOWING ORBIT";
  if (planetCount === 0) return "DRAG THE STAR OUTWARD";
  if (thereminPhase === "arming") return "KEEP HOLDING";
  if (thereminPhase === "active") return "MOVE YOUR FINGER";
  if (!hasPluckedOrbit) return "TOUCH AN ORBIT";
  return "PULL A PLANET FOR A MOON";
}

export function instrumentGuidanceDetail({
  planetCount,
  selectedMoonCount = 0,
  isListener = false,
  hasPluckedOrbit = false,
  thereminPhase = "idle",
  hasPlayedTheremin = false,
}) {
  if (!Number.isInteger(planetCount) || planetCount < 0) {
    throw new Error("Instrument detail requires a planet count");
  }
  if (!Number.isInteger(selectedMoonCount) || selectedMoonCount < 0) {
    throw new Error("Instrument detail requires a moon count");
  }
  if (!["idle", "arming", "active"].includes(thereminPhase)) {
    throw new Error(`Unknown theremin guidance phase: ${thereminPhase}`);
  }
  if (isListener) return "SWIPE ACROSS ORBITS TO PLAY THE COMPOSITION";
  if (planetCount === 0) return "RELEASE TO MAKE A SINGING PLANET";
  if (thereminPhase === "arming") return "THE LIGHT IS WAKING";
  if (thereminPhase === "active") return "SIDEWAYS CHANGES NOTE · UP MAKES IT BRIGHTER";
  if (!hasPluckedOrbit) return "SWIPE IT LIKE A STRING";
  return "OR CHOOSE LIGHT OR FLY";
}
