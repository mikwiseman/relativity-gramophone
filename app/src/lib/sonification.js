function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

const MOON_HARMONIC_RATIOS = Object.freeze([3 / 2, 2]);

function moonOrdinal(moonId) {
  if (typeof moonId !== "string") throw new Error("Moon harmony requires a moon id");
  const match = moonId.match(/-(\d+)$/u);
  if (!match) throw new Error(`Moon harmony requires an ordinal id: ${moonId}`);
  return Math.max(0, Number(match[1]) - 1);
}

export function moonHarmonicFrequency({ moonId, parentFrequency }) {
  if (!Number.isFinite(parentFrequency) || parentFrequency <= 0) {
    throw new Error("Moon harmony requires a positive parent frequency");
  }
  const ratio = MOON_HARMONIC_RATIOS[Math.min(moonOrdinal(moonId), MOON_HARMONIC_RATIOS.length - 1)];
  let frequency = parentFrequency * ratio;
  while (frequency > 1_760) frequency /= 2;
  while (frequency < 55) frequency *= 2;
  return frequency;
}

export const SONIFICATION_MODEL = "cosmic-voices/2";

export const KEPLER_OCTAVE_LIFT = 2 ** 12;

export function keplerPitch(period) {
  if (!Number.isFinite(period) || period <= 0) return null;
  return clamp(KEPLER_OCTAVE_LIFT / period, 55, 1760);
}

export function visibleWavelengthToAudibleFrequency(wavelengthNm) {
  const wavelength = clamp(wavelengthNm, 380, 700);
  const spectralPosition = Math.log(700 / wavelength) / Math.log(700 / 380);
  return 220 * (2 ** (spectralPosition * 2));
}

export const COSMIC_VOICE_ORDER = [
  "earth",
  "theremin",
  "ondes",
  "trautonium",
  "light",
  "moon",
  "alpha-centauri",
];

export const COSMIC_VOICES = Object.freeze({
  earth: Object.freeze({
    id: "earth",
    label: "EARTH",
    channel: "MAGNETOSPHERE / WHISTLER CHORUS",
    explanation: "Plasma-wave behavior mapped into an airy, rising electromagnetic chorus.",
    waveform: "sine",
    partialWaveform: "triangle",
    partialRatio: 2.03,
    partialGainScale: 0.86,
    subRatio: 0.5,
    subGain: 0.018,
    cutoffScale: 1.08,
    q: 1.7,
    tremoloScale: 1.38,
    attack: 0.028,
    release: 1.65,
    glideSeconds: 0.055,
    vibratoRate: 4.1,
    vibratoDepthCents: 3,
    previewFrequency: 246.94,
  }),
  moon: Object.freeze({
    id: "moon",
    label: "MOON",
    channel: "APOLLO SEISMIC / LONG GONG",
    explanation: "Dry lunar rock keeps seismic energy ringing far longer than rock on Earth.",
    waveform: "triangle",
    partialWaveform: "sine",
    partialRatio: 2.71,
    partialGainScale: 1.32,
    subRatio: 0.62,
    subGain: 0.026,
    cutoffScale: 0.64,
    q: 3.1,
    tremoloScale: 0.52,
    attack: 0.012,
    release: 3.8,
    glideSeconds: 0.07,
    vibratoRate: 3.2,
    vibratoDepthCents: 1.5,
    previewFrequency: 164.81,
  }),
  light: Object.freeze({
    id: "light",
    label: "LIGHT",
    channel: "380-700 NM / LOG PITCH MAP",
    explanation: "Visible wavelengths are compressed logarithmically into the audible range.",
    waveform: "sine",
    partialWaveform: "sawtooth",
    partialRatio: 4.001,
    partialGainScale: 0.52,
    subRatio: 1,
    subGain: 0,
    cutoffScale: 1.62,
    q: 0.82,
    tremoloScale: 1.9,
    attack: 0.008,
    release: 1.08,
    glideSeconds: 0.025,
    vibratoRate: 6.2,
    vibratoDepthCents: 4,
    previewFrequency: visibleWavelengthToAudibleFrequency(550),
    wavelengthNm: 550,
  }),
  "alpha-centauri": Object.freeze({
    id: "alpha-centauri",
    label: "ALPHA CEN",
    channel: "A+B DUET / PROXIMA SUBTONE",
    explanation: "Two Sun-like voices orbit above a low pulse for the red dwarf Proxima.",
    waveform: "sine",
    partialWaveform: "sine",
    partialRatio: 1.498,
    partialGainScale: 1.04,
    subRatio: 0.501,
    subGain: 0.052,
    cutoffScale: 0.93,
    q: 1.28,
    tremoloScale: 0.76,
    attack: 0.045,
    release: 2.45,
    glideSeconds: 0.075,
    vibratoRate: 4.4,
    vibratoDepthCents: 5,
    previewFrequency: 220,
  }),
  theremin: Object.freeze({
    id: "theremin",
    label: "THEREMIN",
    channel: "HETERODYNE FIELD / HAND-DRAWN PORTAMENTO",
    explanation: "A continuous field voice glides between orbital pitches with human vibrato.",
    waveform: "sine",
    partialWaveform: "triangle",
    partialRatio: 2.004,
    partialGainScale: 0.68,
    subRatio: 0.5,
    subGain: 0.006,
    cutoffScale: 1.24,
    q: 1.15,
    tremoloScale: 0.54,
    attack: 0.08,
    release: 2.7,
    glideSeconds: 0.14,
    vibratoRate: 5.3,
    vibratoDepthCents: 18,
    previewFrequency: 329.63,
  }),
  ondes: Object.freeze({
    id: "ondes",
    label: "ONDES MARTENOT",
    channel: "RUBAN / RINGING DIFFUSERS",
    explanation: "A ribbon-like singing tone blooms through a near-unison halo and long acoustic tail.",
    waveform: "sine",
    partialWaveform: "sine",
    partialRatio: 1.006,
    partialGainScale: 1.18,
    subRatio: 0.5,
    subGain: 0.014,
    cutoffScale: 1.12,
    q: 1.9,
    tremoloScale: 0.58,
    attack: 0.065,
    release: 3.05,
    glideSeconds: 0.06,
    vibratoRate: 4.7,
    vibratoDepthCents: 7.5,
    previewFrequency: 261.63,
  }),
  trautonium: Object.freeze({
    id: "trautonium",
    label: "TRAUTONIUM",
    channel: "RIBBON / SUBHARMONIC MIXTURE",
    explanation: "A pressed ribbon voice divides the fundamental into a dark subharmonic chord.",
    waveform: "sawtooth",
    partialWaveform: "square",
    partialRatio: 2 / 3,
    partialGainScale: 1.08,
    subRatio: 0.5,
    subGain: 0.085,
    cutoffScale: 0.72,
    q: 3.8,
    tremoloScale: 0.38,
    attack: 0.018,
    release: 1.8,
    glideSeconds: 0.035,
    vibratoRate: 3.1,
    vibratoDepthCents: 2.4,
    previewFrequency: 196,
  }),
});

export const VOICE_HARMONICS = Object.freeze({
  earth: Object.freeze([0, 1, 0.36, 0.2, 0.11, 0.052, 0.026, 0.013]),
  moon: Object.freeze([0, 1, 0.14, 0.31, 0.08, 0.15, 0.04, 0.02]),
  light: Object.freeze([0, 1, 0.5, 0.34, 0.25, 0.19, 0.14, 0.1, 0.075, 0.055]),
  "alpha-centauri": Object.freeze([0, 1, 0.56, 0.18, 0.27, 0.07, 0.11, 0.03]),
  theremin: Object.freeze([0, 1, 0.19, 0.07, 0.035, 0.018, 0.009, 0.004]),
  ondes: Object.freeze([0, 1, 0.42, 0.11, 0.2, 0.065, 0.09, 0.028]),
  trautonium: Object.freeze([0, 1, 0.68, 0.45, 0.31, 0.23, 0.16, 0.11, 0.075]),
});

const DEFAULT_BODY_VOICES = Object.freeze({ io: "earth", europa: "moon", callisto: "light" });

export function isCosmicVoice(value) {
  return Object.hasOwn(COSMIC_VOICES, value);
}

export function defaultVoiceForBody(bodyId) {
  const voice = DEFAULT_BODY_VOICES[bodyId];
  if (!voice) throw new Error(`No default cosmic voice for ${bodyId}`);
  return voice;
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
  const profile = COSMIC_VOICES[body.voice] ?? COSMIC_VOICES.earth;
  const isMoon = body.kind === "moon";
  const partialGain = clamp(0.035 + mass * 0.075 + resonanceStrength * 0.025, 0.03, 0.16)
    * (isMoon ? 0.32 : 1);
  const fallbackFrequency = isMoon
    ? body.frequency
    : profile.id === "light"
      ? visibleWavelengthToAudibleFrequency(body.wavelengthNm ?? profile.wavelengthNm)
      : body.frequency;
  const sungFrequency = isMoon ? fallbackFrequency : keplerPitch(body.period) ?? fallbackFrequency;
  const baseGain = clamp(0.018 + mass * 0.052 + resonanceStrength * 0.008, 0.015, 0.11);
  const baseTremoloDepth = clamp(
    0.018 + Math.abs(doppler - 1) * 1.8 + resonanceStrength * 0.025,
    0.01,
    0.12,
  );

  return {
    frequency: clamp(sungFrequency * properRate * doppler, 40, 1800),
    gain: isMoon ? baseGain * 0.28 : baseGain,
    waveform: profile.waveform,
    partialWaveform: profile.partialWaveform,
    partialRatio: profile.partialRatio,
    partialGain: clamp(partialGain * profile.partialGainScale, 0.006, 0.2),
    subRatio: profile.subRatio,
    subGain: profile.subGain * (isMoon ? 0.22 : 1),
    cutoff: clamp(
      (3300 - distance * 2800 + mass * 480) * profile.cutoffScale * (isMoon ? 0.78 : 1),
      520,
      7200,
    ),
    q: profile.q * (isMoon ? 0.72 : 1),
    pan: clamp(body.x / 0.52, -0.86, 0.86),
    tremoloRate: clamp(
      (0.28 + (1 - properRate) * 18 + resonanceStrength * 0.6)
        * profile.tremoloScale
        * (isMoon ? 0.48 : 1),
      0.12,
      4.2,
    ),
    tremoloDepth: isMoon ? Math.min(0.02, baseTremoloDepth * 0.22) : baseTremoloDepth,
    attack: isMoon ? Math.max(0.08, profile.attack * 1.6) : profile.attack,
    release: isMoon ? Math.min(2.2, profile.release * 0.72) : profile.release,
    glideSeconds: isMoon ? Math.max(0.12, profile.glideSeconds * 1.8) : profile.glideSeconds,
    vibratoRate: profile.vibratoRate,
    vibratoDepthCents: profile.vibratoDepthCents * (isMoon ? 0.38 : 1),
  };
}

export function voicePluckParameters(body, { offset, strength }) {
  const clampedOffset = clamp(offset, 0, 1);
  const clampedStrength = clamp(strength, 0, 1);
  const mass = clamp(body.displayMass ?? body.mass ?? 0.5, 0.1, 1.3);
  const live = voiceParameters(body);
  const isMoon = body.kind === "moon";
  const baseGain = clamp(0.028 + clampedStrength * 0.058 + mass * 0.008, 0.02, 0.1);
  const basePartialGain = clamp(0.06 + clampedOffset * 0.3, 0.05, 0.4);

  return {
    frequency: live.frequency,
    pan: live.pan,
    strength: clampedStrength,
    gain: baseGain * (isMoon ? 0.55 : 1),
    cutoff: clamp(1050 + clampedOffset * 5200, 900, 7500),
    partialGain: basePartialGain * (isMoon ? 0.55 : 1),
    decay: clamp(0.85 + (1 - clampedOffset) * 1.15 + mass * 0.5, 0.7, 3),
    detuneCents: 4,
  };
}

export function isResonanceChallengeComplete(resonance, target, threshold = 0.82) {
  return Boolean(resonance && resonance.label === target && resonance.strength >= threshold);
}

export function hapticPattern({ kind, strength = 0.5 }) {
  if (kind === "audition") return [Math.round(4 + clamp(strength, 0, 1) * 3)];
  if (kind === "crossing") return [8];
  if (kind === "pluck") return [Math.round(3 + clamp(strength, 0, 1) * 4)];
  if (kind === "birth") {
    const normalized = clamp(strength, 0, 1);
    return [Math.round(6 + normalized * 6), 30, Math.round(4 + normalized * 3)];
  }
  if (kind === "consumption") return [12, 26, 6];
  if (kind === "resonance") {
    const normalized = clamp(strength, 0, 1);
    return [Math.round(5 + normalized * 2), 22, Math.round(7 + normalized * 4.5)];
  }
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
