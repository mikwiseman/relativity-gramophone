import test from "node:test";
import assert from "node:assert/strict";

import { nearestStringPoint } from "./harpStrings.js";

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
