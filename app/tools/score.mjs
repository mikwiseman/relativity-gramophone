#!/usr/bin/env node
/**
 * Print the instrument's report card: five axes, each scored 0–100 from the
 * same modules the product runs on plus one measured frame
 * (tools/frame-metrics.json, captured from the live drawing buffer with
 * `window.__rgBeauty.measureCanvas`). The bar is 95 on every axis; the exit
 * code says whether it holds, and `scorecard.test.js` holds the same bar
 * inside `npm test`.
 */
import { readFileSync } from "node:fs";
import { scorecard } from "../src/lib/scorecard.js";

const frame = JSON.parse(
  readFileSync(new URL("./frame-metrics.json", import.meta.url), "utf8"),
);

const { axes, summary } = scorecard(frame);
const bar = 95;
let failed = false;

console.log(`\nWAI GRAMOPHONE — report card (frame measured ${frame.capturedAt})\n`);
for (const [axis, score] of Object.entries(summary)) {
  const mark = score > bar ? "✓" : "✗";
  if (score <= bar) failed = true;
  console.log(`${mark} ${axis.toUpperCase().padEnd(10)} ${String(score).padStart(5)} / 100`);
  for (const [name, value] of Object.entries(axes[axis])) {
    console.log(`    ${name.padEnd(46, "·")} ${String(Math.round(value)).padStart(3)}`);
  }
}
console.log(`\nbar: every axis > ${bar}. ${failed ? "NOT MET." : "Met."}\n`);
process.exit(failed ? 1 : 0);
