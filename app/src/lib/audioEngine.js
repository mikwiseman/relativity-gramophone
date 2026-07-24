import {
  COSMIC_VOICES,
  VOICE_HARMONICS,
  moonHarmonicFrequency,
  voiceParameters,
  voicePluckParameters,
} from "./sonification.js";

const AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext;

const REVERB_SECONDS = 3.1;

function ramp(parameter, value, now, duration = 0.08) {
  parameter.cancelScheduledValues(now);
  parameter.setValueAtTime(Math.max(0.0001, parameter.value), now);
  parameter.exponentialRampToValueAtTime(Math.max(0.0001, value), now + duration);
}

function seededNoise(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

export class AudioEngine {
  context = null;
  master = null;
  sumBus = null;
  shelf = null;
  saturator = null;
  compressor = null;
  fieldBus = null;
  delay = null;
  delayFeedback = null;
  delayReturn = null;
  reverb = null;
  reverbReturn = null;
  drone = null;
  gestation = null;
  voices = new Map();
  voiceWaves = null;
  noiseBuffer = null;
  latestFrame = null;

  async resume(activateField = true) {
    if (!AudioContextClass) throw new Error("Web Audio API is not available in this browser");

    if (!this.context) this.createGraph();
    if (this.context.state === "suspended") await this.context.resume();
    this.setFieldActive(activateField);
    if (this.latestFrame) this.updateField(this.latestFrame);
  }

  createGraph() {
    this.context = new AudioContextClass({ latencyHint: "interactive" });
    this.master = this.context.createGain();
    this.sumBus = this.context.createGain();
    this.shelf = this.context.createBiquadFilter();
    this.saturator = this.context.createWaveShaper();
    this.compressor = this.context.createDynamicsCompressor();
    this.fieldBus = this.context.createGain();
    this.delay = this.context.createDelay(1);
    this.delayFeedback = this.context.createGain();
    this.delayReturn = this.context.createGain();
    this.reverb = this.context.createConvolver();
    this.reverbReturn = this.context.createGain();

    this.master.gain.value = 0.34;
    this.sumBus.gain.value = 1;
    this.fieldBus.gain.value = 0.0001;
    this.shelf.type = "highshelf";
    this.shelf.frequency.value = 7400;
    this.shelf.gain.value = -2.8;
    this.saturator.curve = this.createSaturationCurve();
    this.saturator.oversample = "2x";
    this.compressor.threshold.value = -20;
    this.compressor.knee.value = 14;
    this.compressor.ratio.value = 5;
    this.compressor.attack.value = 0.008;
    this.compressor.release.value = 0.24;
    this.delay.delayTime.value = 0.19;
    this.delayFeedback.gain.value = 0.16;
    this.delayReturn.gain.value = 0.11;
    this.reverb.buffer = this.createReverbImpulse();
    this.reverbReturn.gain.value = 0.3;

    this.fieldBus.connect(this.master);
    this.master.connect(this.sumBus);
    this.delay.connect(this.delayFeedback).connect(this.delay);
    this.delay.connect(this.delayReturn).connect(this.sumBus);
    this.reverb.connect(this.reverbReturn).connect(this.sumBus);
    this.sumBus.connect(this.shelf).connect(this.saturator).connect(this.compressor).connect(this.context.destination);
    this.voiceWaves = this.createVoiceWaves();
    this.noiseBuffer = this.createNoiseBuffer();
    this.createDrone();
  }

  createSaturationCurve() {
    const samples = 1024;
    const curve = new Float32Array(samples);
    const drive = 1.35;
    const normalize = Math.tanh(drive);
    for (let index = 0; index < samples; index += 1) {
      const x = (index / (samples - 1)) * 2 - 1;
      curve[index] = Math.tanh(x * drive) / normalize;
    }
    return curve;
  }

  createReverbImpulse() {
    const rate = this.context.sampleRate;
    const length = Math.max(1, Math.floor(REVERB_SECONDS * rate));
    const impulse = this.context.createBuffer(2, length, rate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = impulse.getChannelData(channel);
      const random = seededNoise(channel === 0 ? 1905 : 2026);
      let smoothed = 0;
      for (let index = 0; index < length; index += 1) {
        const progress = index / length;
        const raw = (random() * 2 - 1) * Math.pow(1 - progress, 2.35) * Math.exp(-2.6 * progress);
        const darkening = 0.14 + progress * 0.7;
        smoothed += (raw - smoothed) * (1 - darkening);
        data[index] = smoothed;
      }
      const predelaySamples = Math.floor(rate * 0.018);
      for (let index = 0; index < predelaySamples && index < length; index += 1) {
        data[index] *= index / predelaySamples;
      }
    }
    return impulse;
  }

  createNoiseBuffer() {
    const rate = this.context.sampleRate;
    const length = Math.floor(rate * 0.24);
    const buffer = this.context.createBuffer(1, length, rate);
    const data = buffer.getChannelData(0);
    const random = seededNoise(777);
    for (let index = 0; index < length; index += 1) {
      data[index] = random() * 2 - 1;
    }
    return buffer;
  }

  createVoiceWaves() {
    const waves = new Map();
    for (const [voiceId, harmonics] of Object.entries(VOICE_HARMONICS)) {
      const real = new Float32Array(harmonics.length);
      const imag = Float32Array.from(harmonics);
      waves.set(voiceId, this.context.createPeriodicWave(real, imag));
    }
    return waves;
  }

  applyVoiceWave(oscillator, voiceId, fallbackWaveform) {
    const wave = this.voiceWaves?.get(voiceId);
    if (wave) oscillator.setPeriodicWave(wave);
    else oscillator.type = fallbackWaveform;
  }

  createDrone() {
    const now = this.context.currentTime;
    const fundamental = this.context.createOscillator();
    const shimmer = this.context.createOscillator();
    const shimmerGain = this.context.createGain();
    const fifth = this.context.createOscillator();
    const fifthGain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    const reverbSend = this.context.createGain();

    fundamental.type = "sine";
    shimmer.type = "sine";
    fifth.type = "sine";
    fundamental.frequency.value = 55;
    shimmer.frequency.value = 55 * 1.0035;
    fifth.frequency.value = 82.5;
    shimmerGain.gain.value = 0.4;
    fifthGain.gain.value = 0.12;
    filter.type = "lowpass";
    filter.frequency.value = 420;
    filter.Q.value = 0.72;
    gain.gain.value = 0.026;
    reverbSend.gain.value = 0.12;

    fundamental.connect(filter);
    shimmer.connect(shimmerGain).connect(filter);
    fifth.connect(fifthGain).connect(filter);
    filter.connect(gain).connect(this.fieldBus);
    gain.connect(this.delay);
    gain.connect(reverbSend).connect(this.reverb);
    fundamental.start(now);
    shimmer.start(now);
    fifth.start(now);
    this.drone = { fundamental, shimmer, shimmerGain, fifth, fifthGain, filter, gain, reverbSend };
  }

  createVoice(bodyId) {
    const now = this.context.currentTime;
    const fundamental = this.context.createOscillator();
    const partial = this.context.createOscillator();
    const sub = this.context.createOscillator();
    const partialGain = this.context.createGain();
    const subGain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    const panner = this.context.createStereoPanner();
    const tremolo = this.context.createOscillator();
    const tremoloDepth = this.context.createGain();
    const vibrato = this.context.createOscillator();
    const vibratoDepth = this.context.createGain();
    const delaySend = this.context.createGain();
    const reverbSend = this.context.createGain();

    fundamental.type = "sine";
    partial.type = "triangle";
    sub.type = "sine";
    partialGain.gain.value = 0.08;
    subGain.gain.value = 0.0001;
    filter.type = "lowpass";
    filter.Q.value = 1.15;
    gain.gain.value = 0.0001;
    tremolo.type = "sine";
    tremolo.frequency.value = 0.4;
    tremoloDepth.gain.value = 0.02;
    vibrato.type = "sine";
    vibrato.frequency.value = 4.4;
    vibratoDepth.gain.value = 3;
    delaySend.gain.value = 0.13;
    reverbSend.gain.value = 0.08;

    fundamental.connect(filter);
    partial.connect(partialGain).connect(filter);
    sub.connect(subGain).connect(filter);
    filter.connect(gain).connect(panner).connect(this.fieldBus);
    panner.connect(delaySend).connect(this.delay);
    panner.connect(reverbSend).connect(this.reverb);
    tremolo.connect(tremoloDepth).connect(gain.gain);
    vibrato.connect(vibratoDepth);
    vibratoDepth.connect(fundamental.detune);
    vibratoDepth.connect(partial.detune);
    fundamental.start(now);
    partial.start(now);
    sub.start(now);
    tremolo.start(now);
    vibrato.start(now);

    const voice = {
      fundamental,
      partial,
      sub,
      partialGain,
      subGain,
      filter,
      gain,
      panner,
      tremolo,
      tremoloDepth,
      vibrato,
      vibratoDepth,
      delaySend,
      reverbSend,
      appliedVoiceId: null,
    };
    this.voices.set(bodyId, voice);
    return voice;
  }

  releaseVoice(bodyId) {
    const voice = this.voices.get(bodyId);
    if (!voice) return;
    this.voices.delete(bodyId);
    const now = this.context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0.0001, now, 0.09);
    const stopAt = now + 0.6;
    for (const oscillator of [voice.fundamental, voice.partial, voice.sub, voice.tremolo, voice.vibrato]) {
      oscillator.stop(stopAt);
    }
    setTimeout(() => {
      const nodes = [
        voice.gain,
        voice.panner,
        voice.filter,
        voice.partialGain,
        voice.subGain,
        voice.tremoloDepth,
        voice.vibratoDepth,
        voice.delaySend,
        voice.reverbSend,
      ];
      for (const node of nodes) node.disconnect();
    }, 700);
  }

  setFieldActive(active) {
    if (!this.context || !this.fieldBus) return;
    ramp(this.fieldBus.gain, active ? 0.72 : 0.0001, this.context.currentTime, active ? 0.34 : 0.12);
  }

  audibleBody(body, parentOverride = null) {
    if (body.kind !== "moon") return body;
    const parent = parentOverride
      ?? this.latestFrame?.bodies.find((candidate) => candidate.id === body.parentId);
    if (!parent) return body;
    return {
      ...body,
      frequency: moonHarmonicFrequency({
        moonId: body.id,
        parentFrequency: voiceParameters(parent).frequency,
      }),
      properRate: 1,
      doppler: 1,
    };
  }

  updateField(frame) {
    this.latestFrame = frame;
    if (!this.context || this.context.state !== "running") return;
    const now = this.context.currentTime;
    const resonanceStrength = Math.max(
      frame.resonance?.strength ?? 0,
      (frame.challengeProximity ?? 0) * 0.62,
    );

    const aliveIds = new Set(frame.bodies.map((body) => body.id));
    for (const bodyId of [...this.voices.keys()]) {
      if (!aliveIds.has(bodyId)) this.releaseVoice(bodyId);
    }

    for (const body of frame.bodies) {
      const voice = this.voices.get(body.id) ?? this.createVoice(body.id);
      const parameters = voiceParameters(this.audibleBody(body), resonanceStrength);
      const fundamentalFrequency = parameters.frequency / 2;
      if (voice.appliedVoiceId !== body.voice) {
        voice.appliedVoiceId = body.voice;
        this.applyVoiceWave(voice.fundamental, body.voice, parameters.waveform);
      }
      voice.partial.type = parameters.partialWaveform;
      voice.fundamental.frequency.setTargetAtTime(fundamentalFrequency, now, parameters.glideSeconds);
      voice.partial.frequency.setTargetAtTime(
        fundamentalFrequency * parameters.partialRatio,
        now,
        Math.max(0.025, parameters.glideSeconds * 0.85),
      );
      voice.sub.frequency.setTargetAtTime(
        fundamentalFrequency * parameters.subRatio,
        now,
        Math.max(0.035, parameters.glideSeconds),
      );
      voice.partialGain.gain.setTargetAtTime(parameters.partialGain, now, 0.1);
      voice.subGain.gain.setTargetAtTime(parameters.subGain, now, 0.12);
      voice.filter.frequency.setTargetAtTime(parameters.cutoff, now, 0.12);
      voice.filter.Q.setTargetAtTime(parameters.q, now, 0.12);
      voice.gain.gain.setTargetAtTime(parameters.gain * 0.23, now, 0.1);
      voice.panner.pan.setTargetAtTime(parameters.pan, now, 0.08);
      voice.tremolo.frequency.setTargetAtTime(parameters.tremoloRate, now, 0.12);
      voice.tremoloDepth.gain.setTargetAtTime(parameters.tremoloDepth * parameters.gain, now, 0.12);
      voice.vibrato.frequency.setTargetAtTime(parameters.vibratoRate, now, 0.12);
      voice.vibratoDepth.gain.setTargetAtTime(parameters.vibratoDepthCents, now, 0.12);
      const distance = Math.hypot(body.x ?? 0, body.y ?? 0);
      voice.delaySend.gain.setTargetAtTime(body.kind === "moon" ? 0.035 : 0.13, now, 0.18);
      voice.reverbSend.gain.setTargetAtTime(
        body.kind === "moon"
          ? Math.min(0.12, 0.035 + distance * 0.16)
          : Math.min(0.34, 0.06 + distance * 0.42),
        now,
        0.25,
      );
    }

    if (this.drone) {
      const breath = Math.min(1, Math.max(0, frame.starBreath ?? 0.5));
      this.drone.fundamental.frequency.setTargetAtTime(55 * (1 + resonanceStrength * 0.018), now, 0.25);
      this.drone.fifth.frequency.setTargetAtTime(82.5 * (1 + resonanceStrength * 0.018), now, 0.25);
      this.drone.filter.frequency.setTargetAtTime(
        352 + breath * 46 + resonanceStrength * 380,
        now,
        0.18,
      );
      this.drone.gain.gain.setTargetAtTime(
        0.015 + breath * 0.008 + resonanceStrength * 0.018,
        now,
        0.14,
      );
    }
  }

  playOrbitNote(body) {
    if (!this.context || this.context.state !== "running") return;

    const now = this.context.currentTime;
    const audibleBody = this.audibleBody(body);
    const parameters = voiceParameters({
      ...audibleBody,
      displayMass: audibleBody.displayMass ?? audibleBody.mass,
      doppler: audibleBody.doppler ?? 1 + audibleBody.velocityX * 0.075,
    });
    const duration = parameters.release + (audibleBody.displayMass ?? audibleBody.mass) * 0.32;
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    const panner = this.context.createStereoPanner();
    const fundamental = this.context.createOscillator();
    const partial = this.context.createOscillator();
    const sub = this.context.createOscillator();
    const vibrato = this.context.createOscillator();
    const vibratoDepth = this.context.createGain();
    const partialGain = this.context.createGain();
    const subGain = this.context.createGain();

    this.applyVoiceWave(fundamental, audibleBody.voice, parameters.waveform);
    partial.type = parameters.partialWaveform;
    sub.type = "sine";
    const entranceRatio = 1 - Math.min(0.035, parameters.glideSeconds * 0.2);
    const glideEnd = now + Math.max(0.02, parameters.glideSeconds * 1.7);
    fundamental.frequency.setValueAtTime(parameters.frequency * entranceRatio, now);
    fundamental.frequency.exponentialRampToValueAtTime(parameters.frequency, glideEnd);
    partial.frequency.setValueAtTime(parameters.frequency * parameters.partialRatio * entranceRatio, now);
    partial.frequency.exponentialRampToValueAtTime(parameters.frequency * parameters.partialRatio, glideEnd);
    sub.frequency.setValueAtTime(parameters.frequency * parameters.subRatio, now);
    vibrato.type = "sine";
    vibrato.frequency.setValueAtTime(parameters.vibratoRate, now);
    vibratoDepth.gain.setValueAtTime(parameters.vibratoDepthCents, now);
    partial.detune.setValueAtTime(-7 + (audibleBody.displayMass ?? audibleBody.mass) * 8, now);
    partialGain.gain.value = parameters.partialGain;
    subGain.gain.value = parameters.subGain;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(parameters.cutoff, now);
    filter.Q.value = parameters.q;
    panner.pan.setValueAtTime(parameters.pan, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(parameters.gain, now + parameters.attack);
    gain.gain.exponentialRampToValueAtTime(parameters.gain * 0.28, now + 0.32);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    const reverbSend = this.context.createGain();
    reverbSend.gain.value = 0.16;
    fundamental.connect(filter);
    partial.connect(partialGain).connect(filter);
    sub.connect(subGain).connect(filter);
    vibrato.connect(vibratoDepth);
    vibratoDepth.connect(fundamental.detune);
    vibratoDepth.connect(partial.detune);
    filter.connect(gain).connect(panner).connect(this.master);
    panner.connect(this.delay);
    panner.connect(reverbSend).connect(this.reverb);

    fundamental.start(now);
    partial.start(now);
    sub.start(now);
    vibrato.start(now);
    fundamental.stop(now + duration + 0.05);
    partial.stop(now + duration + 0.05);
    sub.stop(now + duration + 0.05);
    vibrato.stop(now + duration + 0.05);
  }

  playPluck(body, { offset, strength }) {
    if (!this.context || this.context.state !== "running") return;

    const now = this.context.currentTime;
    const parameters = voicePluckParameters(this.audibleBody(body), { offset, strength });
    const duration = parameters.decay;
    const first = this.context.createOscillator();
    const second = this.context.createOscillator();
    const octave = this.context.createOscillator();
    const octaveGain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    const panner = this.context.createStereoPanner();
    const delaySend = this.context.createGain();

    first.type = "triangle";
    second.type = "sine";
    octave.type = "sine";
    for (const [oscillator, ratio] of [[first, 1], [second, 1], [octave, 2]]) {
      oscillator.frequency.setValueAtTime(parameters.frequency * ratio * 1.006, now);
      oscillator.frequency.exponentialRampToValueAtTime(parameters.frequency * ratio, now + 0.028);
    }
    first.detune.setValueAtTime(parameters.detuneCents, now);
    second.detune.setValueAtTime(-parameters.detuneCents, now);
    octaveGain.gain.setValueAtTime(parameters.partialGain, now);
    octaveGain.gain.exponentialRampToValueAtTime(0.0001, now + duration * 0.45);
    filter.type = "lowpass";
    filter.Q.value = 1.35;
    filter.frequency.setValueAtTime(parameters.cutoff, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(320, parameters.cutoff * 0.42), now + duration);
    panner.pan.setValueAtTime(parameters.pan, now);
    delaySend.gain.value = 0.2;

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(parameters.gain, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    const reverbSend = this.context.createGain();
    reverbSend.gain.value = 0.2;
    first.connect(filter);
    second.connect(filter);
    octave.connect(octaveGain).connect(filter);
    filter.connect(gain).connect(panner).connect(this.master);
    panner.connect(delaySend).connect(this.delay);
    panner.connect(reverbSend).connect(this.reverb);

    const strike = this.context.createBufferSource();
    const strikeFilter = this.context.createBiquadFilter();
    const strikeGain = this.context.createGain();
    strike.buffer = this.noiseBuffer;
    strikeFilter.type = "bandpass";
    strikeFilter.frequency.setValueAtTime(Math.min(9000, parameters.cutoff * 1.7), now);
    strikeFilter.Q.value = 1.1;
    strikeGain.gain.setValueAtTime(0.028 + parameters.strength * 0.05, now);
    strikeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
    strike.connect(strikeFilter).connect(strikeGain).connect(panner);
    strike.start(now);
    strike.stop(now + 0.09);

    for (const oscillator of [first, second, octave]) {
      oscillator.start(now);
      oscillator.stop(now + duration + 0.1);
    }
  }

  updateGestation({ frequency, pan, voice, kind = "planet" }) {
    if (!this.context || this.context.state !== "running") return;
    const now = this.context.currentTime;
    if (!this.gestation) {
      const oscillator = this.context.createOscillator();
      const overtone = this.context.createOscillator();
      const vibrato = this.context.createOscillator();
      const vibratoDepth = this.context.createGain();
      const overtoneGain = this.context.createGain();
      const filter = this.context.createBiquadFilter();
      const gain = this.context.createGain();
      const panner = this.context.createStereoPanner();
      const reverbSend = this.context.createGain();
      this.applyVoiceWave(oscillator, voice, "sine");
      overtone.type = kind === "moon" ? "sine" : "triangle";
      oscillator.frequency.value = frequency;
      overtone.frequency.value = frequency * (kind === "moon" ? 1.5 : 2.01);
      const profile = COSMIC_VOICES[voice];
      vibrato.frequency.value = profile.vibratoRate;
      vibratoDepth.gain.value = profile.vibratoDepthCents;
      overtoneGain.gain.value = kind === "moon" ? 0.22 : 0.13;
      filter.type = "lowpass";
      filter.frequency.value = Math.min(8_000, Math.max(900, frequency * 6));
      filter.Q.value = kind === "moon" ? 1.8 : 1.15;
      gain.gain.value = 0.0001;
      reverbSend.gain.value = kind === "moon" ? 0.3 : 0.18;
      vibrato.connect(vibratoDepth);
      vibratoDepth.connect(oscillator.detune);
      vibratoDepth.connect(overtone.detune);
      oscillator.connect(filter);
      overtone.connect(overtoneGain).connect(filter);
      filter.connect(gain).connect(panner).connect(this.master);
      panner.connect(this.delay);
      panner.connect(reverbSend).connect(this.reverb);
      oscillator.start(now);
      overtone.start(now);
      vibrato.start(now);
      gain.gain.exponentialRampToValueAtTime(0.02, now + 0.3);
      this.gestation = {
        oscillator,
        overtone,
        vibrato,
        vibratoDepth,
        overtoneGain,
        filter,
        gain,
        panner,
        reverbSend,
        appliedVoiceId: voice,
      };
    }
    if (this.gestation.appliedVoiceId !== voice) {
      this.applyVoiceWave(this.gestation.oscillator, voice, "sine");
      this.gestation.appliedVoiceId = voice;
    }
    const profile = COSMIC_VOICES[voice];
    this.gestation.vibrato.frequency.setTargetAtTime(profile.vibratoRate, now, 0.08);
    this.gestation.vibratoDepth.gain.setTargetAtTime(profile.vibratoDepthCents, now, 0.08);
    this.gestation.oscillator.frequency.setTargetAtTime(frequency, now, profile.glideSeconds);
    this.gestation.overtone.frequency.setTargetAtTime(
      frequency * (kind === "moon" ? 1.5 : 2.01),
      now,
      Math.max(0.04, profile.glideSeconds),
    );
    this.gestation.filter.frequency.setTargetAtTime(
      Math.min(8_000, Math.max(900, frequency * 6)),
      now,
      0.12,
    );
    this.gestation.panner.pan.setTargetAtTime(pan, now, 0.08);
  }

  endGestation() {
    if (!this.gestation || !this.context) return;
    const {
      oscillator,
      overtone,
      vibrato,
      vibratoDepth,
      overtoneGain,
      filter,
      gain,
      panner,
      reverbSend,
    } = this.gestation;
    this.gestation = null;
    const now = this.context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(0.0001, now, 0.07);
    oscillator.stop(now + 0.55);
    overtone.stop(now + 0.55);
    vibrato.stop(now + 0.55);
    setTimeout(() => {
      for (const node of [
        gain,
        panner,
        vibratoDepth,
        overtoneGain,
        filter,
        reverbSend,
      ]) node.disconnect();
    }, 650);
  }

  playBirthBloom(body) {
    if (!this.context || this.context.state !== "running") return;

    const now = this.context.currentTime;
    const parameters = voiceParameters(body);
    const mass = Math.min(1.3, body.displayMass ?? body.mass ?? 0.5);
    const duration = 2.1 + mass * 1.2;
    const fundamental = this.context.createOscillator();
    const shimmer = this.context.createOscillator();
    const sub = this.context.createOscillator();
    const shimmerGain = this.context.createGain();
    const subGain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    const panner = this.context.createStereoPanner();

    fundamental.type = parameters.waveform;
    shimmer.type = "sine";
    sub.type = "sine";
    fundamental.frequency.setValueAtTime(parameters.frequency / 4, now);
    fundamental.frequency.exponentialRampToValueAtTime(parameters.frequency, now + 0.42);
    shimmer.frequency.setValueAtTime(parameters.frequency * 3.007, now);
    sub.frequency.setValueAtTime(Math.max(30, parameters.frequency / 8), now);
    shimmerGain.gain.setValueAtTime(0.028, now);
    shimmerGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
    subGain.gain.setValueAtTime(0.052 * mass, now);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(420, now);
    filter.frequency.exponentialRampToValueAtTime(parameters.cutoff, now + 0.5);
    filter.Q.value = parameters.q;
    panner.pan.setValueAtTime(parameters.pan, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.055 + mass * 0.05, now + 0.34);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    const reverbSend = this.context.createGain();
    reverbSend.gain.value = 0.3;
    fundamental.connect(filter);
    shimmer.connect(shimmerGain).connect(filter);
    sub.connect(subGain).connect(filter);
    filter.connect(gain).connect(panner).connect(this.master);
    panner.connect(this.delay);
    panner.connect(reverbSend).connect(this.reverb);

    for (const oscillator of [fundamental, shimmer, sub]) {
      oscillator.start(now);
      oscillator.stop(now + duration + 0.1);
    }
  }

  playMoonBloom(moon, parent) {
    if (!this.context || this.context.state !== "running") return;
    this.playOrbitNote({
      ...parent,
      displayMass: Math.max(0.12, (parent.displayMass ?? parent.mass ?? 0.5) * 0.46),
      doppler: 1,
    });
    this.playOrbitNote(this.audibleBody(moon, parent));
  }

  playConsumption(body) {
    if (!this.context || this.context.state !== "running") return;

    const now = this.context.currentTime;
    const parameters = voiceParameters(body);
    const mass = Math.min(1.3, body.displayMass ?? body.mass ?? 0.5);
    const duration = 1.7 + mass * 0.8;
    const fall = this.context.createOscillator();
    const thump = this.context.createOscillator();
    const thumpGain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();

    fall.type = parameters.waveform;
    thump.type = "sine";
    fall.frequency.setValueAtTime(parameters.frequency, now);
    fall.frequency.exponentialRampToValueAtTime(55, now + 0.85);
    thump.frequency.setValueAtTime(46, now);
    thumpGain.gain.setValueAtTime(0.075 * mass, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2300, now);
    filter.frequency.exponentialRampToValueAtTime(150, now + duration);
    filter.Q.value = 0.9;

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.06 + mass * 0.03, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    const reverbSend = this.context.createGain();
    reverbSend.gain.value = 0.24;
    fall.connect(filter);
    thump.connect(thumpGain).connect(filter);
    filter.connect(gain).connect(this.master);
    gain.connect(this.delay);
    gain.connect(reverbSend).connect(this.reverb);

    for (const oscillator of [fall, thump]) {
      oscillator.start(now);
      oscillator.stop(now + duration + 0.1);
    }
  }

  playVoicePreview(voiceId) {
    const profile = COSMIC_VOICES[voiceId];
    if (!profile) throw new Error(`Unknown cosmic voice: ${voiceId}`);
    this.playOrbitNote({
      voice: voiceId,
      frequency: profile.previewFrequency,
      displayMass: voiceId === "moon" ? 0.96 : 0.68,
      mass: voiceId === "moon" ? 0.96 : 0.68,
      properRate: 0.986,
      doppler: voiceId === "light" ? 1.018 : 1,
      x: 0,
      y: 0.24,
    });
  }

  playChallengeSuccess() {
    if (!this.context || this.context.state !== "running") return;
    const now = this.context.currentTime;
    for (const [index, ratio] of [1, 1.5, 2].entries()) {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = index === 1 ? "triangle" : "sine";
      oscillator.frequency.value = 220 * ratio;
      gain.gain.setValueAtTime(0.0001, now + index * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.045, now + index * 0.08 + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.88 + index * 0.08);
      oscillator.connect(gain).connect(this.master);
      oscillator.start(now + index * 0.08);
      oscillator.stop(now + 1 + index * 0.08);
    }
  }

  async suspend() {
    if (this.context?.state === "running") {
      this.endGestation();
      this.setFieldActive(false);
      await this.context.suspend();
    }
  }
}
