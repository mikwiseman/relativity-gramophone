function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function spectralMix({ doppler }) {
  const shift = clamp((doppler - 1) / 0.06, -1, 1);
  return {
    shift,
    cyan: (1 + shift) / 2,
    coral: (1 - shift) / 2,
  };
}

export function voiceParameters(body, resonanceStrength = 0) {
  const distance = Math.hypot(body.x, body.y);
  const mass = clamp(body.displayMass ?? body.mass ?? 0.5, 0.1, 1.3);
  const properRate = clamp(body.properRate ?? 1, 0.9, 1);
  const doppler = clamp(body.doppler ?? 1, 0.9, 1.1);

  return {
    frequency: clamp(body.frequency * properRate * doppler, 40, 1800),
    gain: clamp(0.018 + mass * 0.052 + resonanceStrength * 0.008, 0.015, 0.11),
    partialGain: clamp(0.035 + mass * 0.075 + resonanceStrength * 0.025, 0.03, 0.16),
    cutoff: clamp(3300 - distance * 2800 + mass * 480, 720, 4200),
    pan: clamp(body.x / 0.52, -0.86, 0.86),
    tremoloRate: clamp(0.28 + (1 - properRate) * 18 + resonanceStrength * 0.6, 0.22, 2.2),
    tremoloDepth: clamp(0.018 + Math.abs(doppler - 1) * 1.8 + resonanceStrength * 0.025, 0.01, 0.12),
  };
}

export function hapticPattern({ kind, strength = 0.5 }) {
  if (kind === "crossing") return [8];
  if (kind === "pericenter") {
    const normalized = clamp(strength, 0, 1);
    return [
      Math.round(4 + normalized * 4.5),
      Math.round(24 - normalized * 6),
      Math.round(3 + normalized * 3.5),
    ];
  }
  return [];
}
