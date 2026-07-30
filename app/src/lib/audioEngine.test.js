import test from "node:test";
import assert from "node:assert/strict";

import {
  assertAudioContextRunning,
  AudioEngine,
  configurePlaybackAudioSession,
} from "./audioEngine.js";

test("audio activation succeeds only after the browser reports a running context", () => {
  assert.equal(assertAudioContextRunning("running"), "running");
  assert.throws(
    () => assertAudioContextRunning("suspended"),
    /browser is waiting for a tap/i,
  );
  assert.throws(
    () => assertAudioContextRunning("closed"),
    /audio context is closed/i,
  );
});

test("a new audio engine reports its honest uninitialized state", () => {
  assert.equal(new AudioEngine().getState(), "uninitialized");
});

test("iPhone audio uses the media playback session before the graph starts", () => {
  const audioSession = { type: "auto" };

  assert.equal(configurePlaybackAudioSession(audioSession), true);
  assert.equal(audioSession.type, "playback");
  assert.equal(configurePlaybackAudioSession(null), false);
});

test("a trusted gesture schedules audible output before awaiting WebKit resume", async () => {
  const calls = [];
  const context = {
    state: "suspended",
    currentTime: 0,
    async resume() {
      calls.push("resume");
      this.state = "running";
    },
  };

  class GestureAudioEngine extends AudioEngine {
    createGraph() {
      calls.push("graph");
      this.context = context;
    }

    playUnlockChime() {
      calls.push("chime");
    }

    async verifyClockAdvances() {
      calls.push("clock");
    }

    setFieldActive() {
      calls.push("field");
    }
  }

  const engine = new GestureAudioEngine({
    AudioContextClass: class FakeAudioContext {},
    audioSession: { type: "auto" },
  });

  await engine.activateFromGesture(true);

  assert.deepEqual(calls, ["graph", "chime", "resume", "clock", "field"]);
  assert.equal(engine.audioSession.type, "playback");
});

test("the polyphony ceiling fades the oldest notes first, every time", () => {
  // The rule is first-in-first-out and device-independent: when a strum would
  // pile more than twenty-four one-shot notes on the bus, the oldest fade over
  // thirty milliseconds instead of letting the browser steal whatever it likes.
  const engine = new AudioEngine();
  const faded = [];
  engine.context = { currentTime: 10 };
  const makeGain = () => ({
    gain: {
      cancelScheduledValues: () => {},
      setTargetAtTime: (value, at, constant) => {
        if (value < 1) faded.push({ at, constant });
      },
    },
  });

  for (let index = 0; index < 24; index += 1) {
    engine.trackOneShot(makeGain(), { onended: null });
  }
  assert.equal(engine.oneShots.size, 24);
  assert.equal(faded.length, 0, "no one fades at the ceiling itself");

  engine.trackOneShot(makeGain(), { onended: null });
  assert.equal(engine.oneShots.size, 24, "the 25th note replaces the oldest");
  assert.equal(faded.length, 1);
  assert.equal(faded[0].at, 10);
  assert.ok(faded[0].constant > 0 && faded[0].constant <= 0.05, "a fast musical fade, not a click");

  engine.trackOneShot(makeGain(), { onended: null });
  engine.trackOneShot(makeGain(), { onended: null });
  assert.equal(engine.oneShots.size, 24);
  assert.equal(faded.length, 3);
});
