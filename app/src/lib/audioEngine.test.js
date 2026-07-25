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
