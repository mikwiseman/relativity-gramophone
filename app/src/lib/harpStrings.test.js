import test from "node:test";
import assert from "node:assert/strict";

import { nearestStringPoint, stringsAlongSweep } from "./harpStrings.js";

const HORIZONTAL = { bodyId: "io", points: Array.from({ length: 11 }, (_, i) => ({ x: i * 10, y: 0 })) };
const VERTICAL = { bodyId: "europa", points: Array.from({ length: 11 }, (_, i) => ({ x: 60, y: -50 + i * 10 })) };

test("a touch near a string finds the string, its offset along the path, and the contact point", () => {
  const hit = nearestStringPoint({ x: 50, y: 6 }, [HORIZONTAL], 12);

  assert.equal(hit.bodyId, "io");
  assert.ok(Math.abs(hit.offset - 0.5) < 0.02);
  assert.ok(Math.abs(hit.distance - 6) < 1e-9);
  assert.ok(Math.abs(hit.x - 50) < 1e-9 && Math.abs(hit.y - 0) < 1e-9);
});

test("the closest of several strings wins and far touches miss", () => {
  const nearVertical = nearestStringPoint({ x: 65, y: 20 }, [HORIZONTAL, VERTICAL], 12);
  const miss = nearestStringPoint({ x: 200, y: 200 }, [HORIZONTAL, VERTICAL], 12);

  assert.equal(nearVertical.bodyId, "europa");
  assert.equal(miss, null);
});

test("offset runs from the string's start to its end and clamps to the segment ends", () => {
  const nearStart = nearestStringPoint({ x: -4, y: 3 }, [HORIZONTAL], 12);
  const nearEnd = nearestStringPoint({ x: 104, y: -3 }, [HORIZONTAL], 12);

  assert.ok(nearStart.offset === 0);
  assert.ok(nearEnd.offset === 1);
});

test("degenerate paths are ignored", () => {
  const dot = { bodyId: "callisto", points: [{ x: 5, y: 5 }] };
  assert.equal(nearestStringPoint({ x: 5, y: 5 }, [dot], 12), null);
});

// Three parallel strings, so a single sweep can cross all of them.
const RUNG_A = { bodyId: "a", points: [{ x: 20, y: -60 }, { x: 20, y: 60 }] };
const RUNG_B = { bodyId: "b", points: [{ x: 60, y: -60 }, { x: 60, y: 60 }] };
const RUNG_C = { bodyId: "c", points: [{ x: 100, y: -60 }, { x: 100, y: 60 }] };
const RUNGS = [RUNG_A, RUNG_B, RUNG_C];

test("a sweep strums every string it crosses, in the order the hand meets them", () => {
  // The instruction on screen is "SWIPE IT LIKE A STRING". A hand that starts
  // on empty sky and sweeps across three orbits must sound all three; before
  // this existed it sounded none of them, because a strum could only be armed
  // by landing within fourteen pixels of a line.
  const hits = stringsAlongSweep({ x: 0, y: 0 }, { x: 140, y: 0 }, RUNGS, 14);
  assert.deepEqual(hits.map((hit) => hit.bodyId), ["a", "b", "c"]);
  assert.ok(hits.every((hit) => hit.distance < 1e-9));
});

test("a sweep the other way strums the same strings in the opposite order", () => {
  const hits = stringsAlongSweep({ x: 140, y: 0 }, { x: 0, y: 0 }, RUNGS, 14);
  assert.deepEqual(hits.map((hit) => hit.bodyId), ["c", "b", "a"]);
});

test("a fast flick does not jump over the strings between its samples", () => {
  // A pointer sampled at 60 Hz during a quick flick reports points hundreds of
  // pixels apart. Testing only where the finger was seen misses every line in
  // between, so the fastest, most natural strum is the one that goes silent.
  const seen = stringsAlongSweep({ x: 0, y: 0 }, { x: 400, y: 0 }, RUNGS, 14);
  assert.equal(seen.length, 3, "the path between two samples is part of the gesture");
  assert.equal(nearestStringPoint({ x: 400, y: 0 }, RUNGS, 14), null, "neither endpoint touches a string");
});

test("a sweep that misses every string sounds nothing", () => {
  assert.deepEqual(stringsAlongSweep({ x: 0, y: 200 }, { x: 140, y: 200 }, RUNGS, 14), []);
});

test("a sweep along a string strums it once, not once per segment", () => {
  const along = stringsAlongSweep({ x: 20, y: -50 }, { x: 20, y: 50 }, RUNGS, 14);
  assert.deepEqual(along.map((hit) => hit.bodyId), ["a"]);
});

test("a sweep that has not moved reports nothing rather than dividing by zero", () => {
  assert.deepEqual(stringsAlongSweep({ x: 20, y: 0 }, { x: 20, y: 0 }, RUNGS, 14), []);
});

test("each hit carries where on its own string it was struck", () => {
  // Timbre comes from where along the orbit the string is plucked, so a strum
  // has to say where it crossed, not merely that it did.
  const [hit] = stringsAlongSweep({ x: 0, y: -30 }, { x: 40, y: -30 }, [RUNG_A], 14);
  assert.equal(hit.bodyId, "a");
  assert.ok(Math.abs(hit.offset - 0.25) < 0.02, `offset was ${hit.offset}`);
  assert.ok(Math.abs(hit.x - 20) < 1e-9 && Math.abs(hit.y + 30) < 1e-9);
});

test("a grazing sweep is judged by its closest approach, not by crossing", () => {
  const grazed = stringsAlongSweep({ x: 0, y: 0 }, { x: 14, y: 0 }, [RUNG_A], 14);
  assert.equal(grazed.length, 1);
  assert.ok(Math.abs(grazed[0].distance - 6) < 1e-9, `distance was ${grazed[0].distance}`);
  assert.deepEqual(stringsAlongSweep({ x: 0, y: 0 }, { x: 5, y: 0 }, [RUNG_A], 14), []);
});

test("degenerate strings are ignored by a sweep too", () => {
  const dot = { bodyId: "callisto", points: [{ x: 5, y: 5 }] };
  assert.deepEqual(stringsAlongSweep({ x: 0, y: 5 }, { x: 10, y: 5 }, [dot], 14), []);
});
