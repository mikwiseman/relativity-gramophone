import { COSMIC_VOICES, voiceParameters } from "./sonification.js";

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

  setFieldActive(active) {
    if (!this.context || !this.fieldBus) return;
    ramp(this.fieldBus.gain, active ? 0.72 : 0.0001, this.context.currentTime, active ? 0.34 : 0.12);
  }

  updateField(frame) {
    this.latestFrame = frame;
    if (!this.context || this.context.state !== "running") return;
    const now = this.context.currentTime;
    const resonanceStrength = frame.resonance?.strength ?? 0;

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
      this.setFieldActive(false);
      await this.context.suspend();
    }
  }
}
