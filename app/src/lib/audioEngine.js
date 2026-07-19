import { COSMIC_VOICES, voiceParameters, voicePluckParameters } from "./sonification.js";

const AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext;

function ramp(parameter, value, now, duration = 0.08) {
  parameter.cancelScheduledValues(now);
  parameter.setValueAtTime(Math.max(0.0001, parameter.value), now);
  parameter.exponentialRampToValueAtTime(Math.max(0.0001, value), now + duration);
}

export class AudioEngine {
  context = null;
  master = null;
  compressor = null;
  fieldBus = null;
  delay = null;
  delayFeedback = null;
  delayReturn = null;
  drone = null;
  gestation = null;
  voices = new Map();
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
    this.compressor = this.context.createDynamicsCompressor();
    this.fieldBus = this.context.createGain();
    this.delay = this.context.createDelay(1);
    this.delayFeedback = this.context.createGain();
    this.delayReturn = this.context.createGain();

    this.master.gain.value = 0.34;
    this.fieldBus.gain.value = 0.0001;
    this.compressor.threshold.value = -20;
    this.compressor.knee.value = 14;
    this.compressor.ratio.value = 5;
    this.compressor.attack.value = 0.008;
    this.compressor.release.value = 0.24;
    this.delay.delayTime.value = 0.19;
    this.delayFeedback.gain.value = 0.16;
    this.delayReturn.gain.value = 0.11;

    this.fieldBus.connect(this.master);
    this.master.connect(this.compressor).connect(this.context.destination);
    this.delay.connect(this.delayFeedback).connect(this.delay);
    this.delay.connect(this.delayReturn).connect(this.compressor);
    this.createDrone();
  }

  createDrone() {
    const now = this.context.currentTime;
    const fundamental = this.context.createOscillator();
    const fifth = this.context.createOscillator();
    const fifthGain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();

    fundamental.type = "sine";
    fifth.type = "sine";
    fundamental.frequency.value = 55;
    fifth.frequency.value = 82.5;
    fifthGain.gain.value = 0.12;
    filter.type = "lowpass";
    filter.frequency.value = 420;
    filter.Q.value = 0.72;
    gain.gain.value = 0.026;

    fundamental.connect(filter);
    fifth.connect(fifthGain).connect(filter);
    filter.connect(gain).connect(this.fieldBus);
    gain.connect(this.delay);
    fundamental.start(now);
    fifth.start(now);
    this.drone = { fundamental, fifth, fifthGain, filter, gain };
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
    const delaySend = this.context.createGain();

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
    delaySend.gain.value = 0.13;

    fundamental.connect(filter);
    partial.connect(partialGain).connect(filter);
    sub.connect(subGain).connect(filter);
    filter.connect(gain).connect(panner).connect(this.fieldBus);
    panner.connect(delaySend).connect(this.delay);
    tremolo.connect(tremoloDepth).connect(gain.gain);
    fundamental.start(now);
    partial.start(now);
    sub.start(now);
    tremolo.start(now);

    const voice = { fundamental, partial, sub, partialGain, subGain, filter, gain, panner, tremolo, tremoloDepth };
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
    for (const oscillator of [voice.fundamental, voice.partial, voice.sub, voice.tremolo]) oscillator.stop(stopAt);
    setTimeout(() => {
      for (const node of [voice.gain, voice.panner, voice.filter, voice.partialGain, voice.subGain, voice.tremoloDepth]) {
        node.disconnect();
      }
    }, 700);
  }

  setFieldActive(active) {
    if (!this.context || !this.fieldBus) return;
    ramp(this.fieldBus.gain, active ? 0.72 : 0.0001, this.context.currentTime, active ? 0.34 : 0.12);
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
      const parameters = voiceParameters(body, resonanceStrength);
      const fundamentalFrequency = parameters.frequency / 2;
      voice.fundamental.type = parameters.waveform;
      voice.partial.type = parameters.partialWaveform;
      voice.fundamental.frequency.setTargetAtTime(fundamentalFrequency, now, 0.055);
      voice.partial.frequency.setTargetAtTime(fundamentalFrequency * parameters.partialRatio, now, 0.07);
      voice.sub.frequency.setTargetAtTime(fundamentalFrequency * parameters.subRatio, now, 0.09);
      voice.partialGain.gain.setTargetAtTime(parameters.partialGain, now, 0.1);
      voice.subGain.gain.setTargetAtTime(parameters.subGain, now, 0.12);
      voice.filter.frequency.setTargetAtTime(parameters.cutoff, now, 0.12);
      voice.filter.Q.setTargetAtTime(parameters.q, now, 0.12);
      voice.gain.gain.setTargetAtTime(parameters.gain * 0.23, now, 0.1);
      voice.panner.pan.setTargetAtTime(parameters.pan, now, 0.08);
      voice.tremolo.frequency.setTargetAtTime(parameters.tremoloRate, now, 0.12);
      voice.tremoloDepth.gain.setTargetAtTime(parameters.tremoloDepth * parameters.gain, now, 0.12);
    }

    if (this.drone) {
      this.drone.fundamental.frequency.setTargetAtTime(55 * (1 + resonanceStrength * 0.018), now, 0.25);
      this.drone.fifth.frequency.setTargetAtTime(82.5 * (1 + resonanceStrength * 0.018), now, 0.25);
      this.drone.filter.frequency.setTargetAtTime(360 + resonanceStrength * 380, now, 0.25);
      this.drone.gain.gain.setTargetAtTime(0.018 + resonanceStrength * 0.018, now, 0.2);
    }
  }

  playOrbitNote(body) {
    if (!this.context || this.context.state !== "running") return;

    const now = this.context.currentTime;
    const parameters = voiceParameters({
      ...body,
      displayMass: body.displayMass ?? body.mass,
      doppler: body.doppler ?? 1 + body.velocityX * 0.075,
    });
    const duration = parameters.release + (body.displayMass ?? body.mass) * 0.32;
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    const panner = this.context.createStereoPanner();
    const fundamental = this.context.createOscillator();
    const partial = this.context.createOscillator();
    const sub = this.context.createOscillator();
    const partialGain = this.context.createGain();
    const subGain = this.context.createGain();

    fundamental.type = parameters.waveform;
    partial.type = parameters.partialWaveform;
    sub.type = "sine";
    fundamental.frequency.setValueAtTime(parameters.frequency, now);
    partial.frequency.setValueAtTime(parameters.frequency * parameters.partialRatio, now);
    sub.frequency.setValueAtTime(parameters.frequency * parameters.subRatio, now);
    partial.detune.setValueAtTime(-7 + (body.displayMass ?? body.mass) * 8, now);
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

    fundamental.connect(filter);
    partial.connect(partialGain).connect(filter);
    sub.connect(subGain).connect(filter);
    filter.connect(gain).connect(panner).connect(this.master);
    panner.connect(this.delay);

    fundamental.start(now);
    partial.start(now);
    sub.start(now);
    fundamental.stop(now + duration + 0.05);
    partial.stop(now + duration + 0.05);
    sub.stop(now + duration + 0.05);
  }

  playPluck(body, { offset, strength }) {
    if (!this.context || this.context.state !== "running") return;

    const now = this.context.currentTime;
    const parameters = voicePluckParameters(body, { offset, strength });
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

    first.connect(filter);
    second.connect(filter);
    octave.connect(octaveGain).connect(filter);
    filter.connect(gain).connect(panner).connect(this.master);
    panner.connect(delaySend).connect(this.delay);

    for (const oscillator of [first, second, octave]) {
      oscillator.start(now);
      oscillator.stop(now + duration + 0.1);
    }
  }

  updateGestation({ frequency, pan }) {
    if (!this.context || this.context.state !== "running") return;
    const now = this.context.currentTime;
    if (!this.gestation) {
      const oscillator = this.context.createOscillator();
      const vibrato = this.context.createOscillator();
      const vibratoDepth = this.context.createGain();
      const gain = this.context.createGain();
      const panner = this.context.createStereoPanner();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      vibrato.frequency.value = 4.4;
      vibratoDepth.gain.value = 1.7;
      gain.gain.value = 0.0001;
      vibrato.connect(vibratoDepth).connect(oscillator.frequency);
      oscillator.connect(gain).connect(panner).connect(this.master);
      panner.connect(this.delay);
      oscillator.start(now);
      vibrato.start(now);
      gain.gain.exponentialRampToValueAtTime(0.02, now + 0.3);
      this.gestation = { oscillator, vibrato, vibratoDepth, gain, panner };
    }
    this.gestation.oscillator.frequency.setTargetAtTime(frequency, now, 0.075);
    this.gestation.panner.pan.setTargetAtTime(pan, now, 0.08);
  }

  endGestation() {
    if (!this.gestation || !this.context) return;
    const { oscillator, vibrato, vibratoDepth, gain, panner } = this.gestation;
    this.gestation = null;
    const now = this.context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(0.0001, now, 0.07);
    oscillator.stop(now + 0.55);
    vibrato.stop(now + 0.55);
    setTimeout(() => {
      for (const node of [gain, panner, vibratoDepth]) node.disconnect();
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

    fundamental.connect(filter);
    shimmer.connect(shimmerGain).connect(filter);
    sub.connect(subGain).connect(filter);
    filter.connect(gain).connect(panner).connect(this.master);
    panner.connect(this.delay);

    for (const oscillator of [fundamental, shimmer, sub]) {
      oscillator.start(now);
      oscillator.stop(now + duration + 0.1);
    }
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

    fall.connect(filter);
    thump.connect(thumpGain).connect(filter);
    filter.connect(gain).connect(this.master);
    gain.connect(this.delay);

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
