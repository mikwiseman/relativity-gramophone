import test from "node:test";
import assert from "node:assert/strict";

import { assertAudioContextRunning, AudioEngine } from "./audioEngine.js";

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
