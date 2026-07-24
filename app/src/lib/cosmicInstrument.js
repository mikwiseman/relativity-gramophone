function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothstep(minimum, maximum, value) {
  if (minimum === maximum) return value < minimum ? 0 : 1;
  const normalized = clamp((value - minimum) / (maximum - minimum), 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
}

const SCALE_COPY = Object.freeze({
  orbit: Object.freeze({
    label: "INNER ORBIT",
    detail: "Each body is a voice",
  }),
  system: Object.freeze({
    label: "STAR SYSTEM",
    detail: "The system becomes a chord",
  }),
  galaxy: Object.freeze({
    label: "MILKY WAY",
    detail: "Every system joins the record",
  }),
  universe: Object.freeze({
    label: "DEEP UNIVERSE",
    detail: "Galaxies breathe as one choir",
  }),
});

export function cosmicScaleForDistance(distance) {
  if (!Number.isFinite(distance) || distance <= 0) {
    throw new Error("Cosmic scale requires a positive camera distance");
  }

  const id = distance < 6.2
    ? "orbit"
    : distance < 19
      ? "system"
      : distance < 46
        ? "galaxy"
        : "universe";
  const galaxyArrival = smoothstep(13, 30, distance);
  const universeArrival = smoothstep(38, 58, distance);

  return {
    id,
    ...SCALE_COPY[id],
    systemMix: clamp(1 - smoothstep(16, 36, distance) * 0.88, 0.12, 1),
    galaxyMix: clamp(galaxyArrival * (1 - universeArrival * 0.38), 0, 1),
    universeMix: universeArrival,
  };
}

export function thereminParameters({ x, y, width, height }) {
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new Error("Theremin mapping requires finite pointer and viewport geometry");
  }
  const horizontal = clamp(x / width, 0, 1);
  const vertical = 1 - clamp(y / height, 0, 1);
  return {
    frequency: 110 * (2 ** (horizontal * 3)),
    gain: 0.004 + vertical * 0.058,
    pan: horizontal * 2 - 1,
    cutoff: 700 + vertical * vertical * 6500,
    vibratoDepth: 7 + (1 - Math.abs(horizontal - 0.5) * 2) * 11,
  };
}

export function cathedralIntensity(resonance, bodyCount) {
  if (!resonance
    || !Array.isArray(resonance.bodyIds)
    || resonance.bodyIds.length !== 2
    || !Number.isFinite(resonance.strength)
    || !Number.isInteger(bodyCount)
    || bodyCount < 2
    || resonance.strength < 0.82) {
    return 0;
  }
  const harmonicLock = smoothstep(0.82, 0.97, resonance.strength);
  const ensemble = clamp((bodyCount - 1) / 3, 0.42, 1);
  return clamp(harmonicLock * ensemble, 0, 1);
}

export function memoryCometEnvelope(progress) {
  if (!Number.isFinite(progress)) throw new Error("Memory comet progress must be finite");
  if (progress < 0 || progress > 1) {
    return {
      visible: false,
      opacity: 0,
      orbitMix: 0,
      galaxyMix: 0,
    };
  }
  return {
    visible: true,
    opacity: smoothstep(0, 0.18, progress) * (1 - smoothstep(0.7, 1, progress)),
    orbitMix: 1 - smoothstep(0.24, 0.7, progress),
    galaxyMix: smoothstep(0.34, 0.92, progress),
  };
}
