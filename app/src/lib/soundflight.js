import { spectralMix } from "./sonification.js";

const DEFAULT_STATE = Object.freeze({ mode: "compose", followingBodyId: null });
export const INITIAL_PLAYBACK = true;
export const INSTRUMENT_TITLE = "WAI GRAMOPHONE";

export function playbackControl({ audioState, isPlaying }) {
  if (!["locked", "paused", "running"].includes(audioState)) {
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

  if (reducedMotion) {
    return {
      pixelRatio: 1,
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

  const compact = Math.min(width, height) < 620 || hardwareConcurrency <= 4;
  if (compact) {
    return {
      pixelRatio: Math.min(1, Math.max(0.75, devicePixelRatio)),
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
    pixelRatio: Math.min(1.5, Math.max(1, devicePixelRatio)),
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
  neighborhood: Object.freeze({ x: -0.08, y: 0.31, z: 0.948 }),
  galaxy: Object.freeze({ x: 0.06, y: 0.89, z: 0.45 }),
  localGroup: Object.freeze({ x: -0.08, y: 0.42, z: 0.904 }),
  universe: Object.freeze({ x: 0.04, y: 0.3, z: 0.953 }),
});

const COSMIC_CAMERA_TARGET_OFFSETS = Object.freeze({
  system: Object.freeze({ x: 0, y: 0, z: 0 }),
  neighborhood: Object.freeze({ x: 0, y: 0, z: 0 }),
  galaxy: Object.freeze({ x: -5.2, y: -0.7, z: 0 }),
  localGroup: Object.freeze({ x: -1, y: 0, z: -2.5 }),
  universe: Object.freeze({ x: 0, y: 0, z: -10 }),
});

export function cosmicCameraDirection(scaleId) {
  const direction = COSMIC_CAMERA_DIRECTIONS[scaleId];
  if (!direction) throw new Error(`Unknown cosmic camera scale: ${scaleId}`);
  const length = Math.hypot(direction.x, direction.y, direction.z);
  return {
    x: direction.x / length,
    y: direction.y / length,
    z: direction.z / length,
  };
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

export function instrumentLesson({
  planetCount,
  hasPluckedOrbit = false,
  thereminPhase = "idle",
  hasPlayedTheremin = false,
}) {
  if (!Number.isInteger(planetCount) || planetCount < 0) {
    throw new Error("Instrument lesson requires a planet count");
  }
  if (!["idle", "arming", "active"].includes(thereminPhase)) {
    throw new Error(`Unknown theremin lesson phase: ${thereminPhase}`);
  }
  if (planetCount === 0 || hasPlayedTheremin) return null;
  if (!hasPluckedOrbit) {
    return {
      step: 1,
      total: 2,
      label: "ORBIT STRING",
      instruction: "SWIPE THE GLOWING LINE",
      showBeacon: false,
    };
  }
  return {
    step: 2,
    total: 2,
    label: "LIGHT THEREMIN",
    instruction: thereminPhase === "active"
      ? "MOVE TO BEND THE NOTE"
      : thereminPhase === "arming"
        ? "KEEP HOLDING"
        : "HOLD THE PULSING LIGHT",
    showBeacon: thereminPhase !== "active",
  };
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
  if (planetCount === 0) return "DRAG FROM THE STAR TO MAKE A PLANET";
  if (thereminPhase === "arming") return "KEEP HOLDING";
  if (thereminPhase === "active") return "BEND THE NOTE";
  if (!hasPluckedOrbit) return "PLAY YOUR NEW WORLD";
  if (!hasPlayedTheremin) return "FIND THE LIGHT THEREMIN";
  return "FLY TO NEARBY STARS";
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
  if (planetCount === 0) return "PULL OUTWARD · RELEASE TO HEAR A WORLD";
  if (thereminPhase === "arming") return "A LIGHT IS FORMING";
  if (thereminPhase === "active") return "LEFT–RIGHT = PITCH · UP–DOWN = POWER";
  if (!hasPluckedOrbit) return "SWIPE ITS GLOWING ORBIT LIKE A STRING";
  if (!hasPlayedTheremin) return "HOLD THE PULSING LIGHT · THEN MOVE";
  return "TAP NEXT FLIGHT TO LEAVE YOUR SYSTEM";
}
