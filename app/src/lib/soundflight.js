import { spectralMix } from "./sonification.js";

const DEFAULT_STATE = Object.freeze({ mode: "compose", followingBodyId: null });

const VOICE_VISUALS = Object.freeze({
  earth: Object.freeze({ label: "EARTH", colorName: "CYAN", color: 0x72edff }),
  moon: Object.freeze({ label: "MOON", colorName: "AMBER", color: 0xffc66d }),
  light: Object.freeze({ label: "LIGHT", colorName: "MAGENTA", color: 0xff76d6 }),
  "alpha-centauri": Object.freeze({ label: "ALPHA CEN", colorName: "MINT", color: 0x8fffc1 }),
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
    detail: "Low · mid · high",
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

export function canBeginRadialLaunchFromHit(bodyId) {
  return bodyId == null || bodyId === "star";
}

export function shouldApplyGestationUpdate({ requestId, currentRequestId, engaged }) {
  return engaged && requestId === currentRequestId;
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

export function cameraScaleLabel(distance) {
  if (!Number.isFinite(distance) || distance <= 0) throw new Error("Camera distance must be positive");
  return `${(distance * 0.12).toFixed(1)} AU`;
}

export function nextCameraDistance(distance, direction) {
  if (!Number.isFinite(distance) || distance <= 0) throw new Error("Camera distance must be positive");
  if (direction !== -1 && direction !== 1) throw new Error("Camera zoom direction must be -1 or 1");
  return clamp(distance + direction * 1.6, 3.2, 24);
}
