import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { scorecard } from "./scorecard.js";

const frame = JSON.parse(
  readFileSync(new URL("../../tools/frame-metrics.json", import.meta.url), "utf8"),
);

test("every axis of the owner's report card stays above 95 of 100", () => {
  // The bar the owner set, verbatim: flawless graphics, creation at any
  // distance, exact physics, astronomy that matches the real universe, and
  // controls a child can use — each above 95. A regression on any axis fails
  // the suite here, not a launch review. The graphics frame is a committed
  // measurement of the live drawing buffer; recapture it with the beauty
  // probe whenever the picture changes.
  const { axes, summary } = scorecard(frame);
  for (const [axis, score] of Object.entries(summary)) {
    const parts = Object.entries(axes[axis])
      .map(([name, value]) => `${name}=${Math.round(value)}`)
      .join(" ");
    assert.ok(score > 95, `${axis} scored ${score} (${parts})`);
  }
});

test("the report card refuses to grade graphics without a measured frame", () => {
  assert.throws(() => scorecard(null), /measured frame/);
  assert.throws(() => scorecard({ black: Number.NaN }), /measured frame/);
});
