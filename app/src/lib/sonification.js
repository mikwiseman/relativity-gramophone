function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
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

export const COSMIC_VOICE_ORDER = ["earth", "moon", "light", "alpha-centauri"];

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
    previewFrequency: 164.81,
  }),
  light: Object.freeze({
    id: "light",
    label: "LIGHT",
    channel: "380–700 NM / LOG PITCH MAP",
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
    previewFrequency: 220,
  }),
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
  const partialGain = clamp(0.035 + mass * 0.075 + resonanceStrength * 0.025, 0.03, 0.16);
  const fallbackFrequency = profile.id === "light"
    ? visibleWavelengthToAudibleFrequency(body.wavelengthNm ?? profile.wavelengthNm)
    : body.frequency;
  const sungFrequency = keplerPitch(body.period) ?? fallbackFrequency;

  return {
    frequency: clamp(sungFrequency * properRate * doppler, 40, 1800),
    gain: clamp(0.018 + mass * 0.052 + resonanceStrength * 0.008, 0.015, 0.11),
    waveform: profile.waveform,
    partialWaveform: profile.partialWaveform,
    partialRatio: profile.partialRatio,
    partialGain: clamp(partialGain * profile.partialGainScale, 0.02, 0.2),
    subRatio: profile.subRatio,
    subGain: profile.subGain,
    cutoff: clamp((3300 - distance * 2800 + mass * 480) * profile.cutoffScale, 520, 7200),
    q: profile.q,
    pan: clamp(body.x / 0.52, -0.86, 0.86),
    tremoloRate: clamp((0.28 + (1 - properRate) * 18 + resonanceStrength * 0.6) * profile.tremoloScale, 0.16, 4.2),
    tremoloDepth: clamp(0.018 + Math.abs(doppler - 1) * 1.8 + resonanceStrength * 0.025, 0.01, 0.12),
    attack: profile.attack,
    release: profile.release,
  };
}

export function isResonanceChallengeComplete(resonance, target, threshold = 0.82) {
  return Boolean(resonance && resonance.label === target && resonance.strength >= threshold);
}

export function hapticPattern({ kind, strength = 0.5 }) {
  if (kind === "audition") return [Math.round(4 + clamp(strength, 0, 1) * 3)];
  if (kind === "crossing") return [8];
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
