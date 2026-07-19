import test from "node:test";
import assert from "node:assert/strict";

import {
  RESONANCE_TARGETS,
  captureResonance,
  measureTargetResonance,
} from "./gameProgress.js";

test("resonance seals are collected once in discovery order", () => {
  const first = captureResonance([], "3:2");
  const second = captureResonance(first, "2:1");

  assert.deepEqual(first, ["3:2"]);
  assert.deepEqual(second, ["3:2", "2:1"]);
  assert.equal(captureResonance(second, "3:2"), second);
  assert.throws(() => captureResonance(second, "4:1"), /Unknown resonance target/);
  assert.deepEqual(RESONANCE_TARGETS, ["2:1", "3:2", "5:3"]);
});

test("target guidance uses live orbital periods and points toward the ratio", () => {
  const exact = measureTargetResonance([
    { id: "one", period: 10 },
    { id: "two", period: 15 },
    { id: "three", period: 27 },
  ], "3:2");
  const narrow = measureTargetResonance([
    { id: "one", period: 10 },
    { id: "two", period: 14 },
  ], "3:2");
  const wide = measureTargetResonance([
    { id: "one", period: 10 },
    { id: "two", period: 17 },
  ], "3:2");

  assert.equal(exact.observedRatio, 1.5);
  assert.equal(exact.lockStrength, 1);
  assert.equal(exact.direction, "HOLD THE ORBIT");
  assert.equal(narrow.direction, "WIDEN THE RATIO");
  assert.equal(wide.direction, "NARROW THE RATIO");
  assert.ok(narrow.proximity > 0 && narrow.proximity < 1);
  assert.ok(wide.proximity > 0 && wide.proximity < 1);
});

test("target guidance chooses the closest physical pair and rejects bad data", () => {
  const guide = measureTargetResonance([
    { id: "one", period: 10 },
    { id: "two", period: 21 },
    { id: "three", period: 15.1 },
  ], "3:2");

  assert.deepEqual(guide.bodyIds, ["one", "three"]);
  assert.throws(() => measureTargetResonance([], "3:2"), /orbital periods/i);
  assert.throws(() => measureTargetResonance([{ id: "one", period: 10 }], "4:1"), /Unknown resonance target/);
});
