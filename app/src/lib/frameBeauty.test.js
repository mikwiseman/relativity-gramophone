import test from "node:test";
import assert from "node:assert/strict";

import {
  banding,
  edgeRipple,
  frameBeauty,
  hueSpread,
  inkCoverage,
  luminanceAt,
  tonalRange,
} from "./frameBeauty.js";

/** A frame whose answers are known by construction. */
function makeFrame(width, height, paint) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y) ?? [0, 0, 0];
      const index = (y * width + x) * 4;
      data[index] = r;
      data[index + 1] = g;
      data[index + 2] = b;
      data[index + 3] = 255;
    }
  }
  return { data, width, height };
}

test("a frame that is all black has no ink on it", () => {
  const frame = makeFrame(20, 20, () => [0, 0, 0]);
  assert.equal(inkCoverage(frame), 0);
  assert.equal(tonalRange(frame).black, 1);
  assert.equal(tonalRange(frame).clipped, 0);
});

test("ink coverage counts exactly the lit pixels", () => {
  // One lit column in twenty: 5% coverage, whatever else is on the frame.
  const frame = makeFrame(20, 20, (x) => (x === 0 ? [255, 255, 255] : [0, 0, 0]));
  assert.equal(inkCoverage(frame), 0.05);
});

test("a pixel just under the threshold is still black to the eye", () => {
  const dim = Math.round(0.05 * 255);
  const frame = makeFrame(10, 10, () => [dim, dim, dim]);
  assert.equal(inkCoverage(frame, { threshold: 0.06 }), 0);
  assert.equal(inkCoverage(frame, { threshold: 0.01 }), 1);
});

test("clipping is counted only when every channel has blown out", () => {
  // A saturated red at full strength is not clipped white: it still has form.
  const red = makeFrame(10, 10, () => [255, 0, 0]);
  assert.equal(tonalRange(red).clipped, 0);
  const white = makeFrame(10, 10, () => [255, 255, 255]);
  assert.equal(tonalRange(white).clipped, 1);
});

test("the percentiles describe the lit part, not the black around it", () => {
  // 90% black, 10% at half brightness.
  const frame = makeFrame(10, 10, (x, y) => (y === 0 ? [128, 128, 128] : [0, 0, 0]));
  const tone = tonalRange(frame);
  assert.equal(tone.p50, 0);
  assert.ok(tone.p95 > 0.4 && tone.p95 < 0.6, `p95 was ${tone.p95}`);
  assert.ok(tone.max > 0.4);
});

test("a smooth ramp has no plateaus; a quantised one does", () => {
  const smooth = makeFrame(64, 1, (x) => [x * 4, x * 4, x * 4]);
  const samples = Array.from({ length: 64 }, (unused, x) => ({ x, y: 0 }));
  assert.equal(banding(smooth, samples).plateaus, 0);

  // Eight steps of eight pixels each: every step is a plateau.
  const stepped = makeFrame(64, 1, (x) => {
    const step = Math.floor(x / 8) * 32;
    return [step, step, step];
  });
  const banded = banding(stepped, samples, { plateau: 6 });
  assert.equal(banded.plateaus, 8);
  assert.equal(banded.longestPlateau, 8);
});

test("banding refuses to answer from too few samples", () => {
  const frame = makeFrame(4, 1, () => [0, 0, 0]);
  assert.throws(() => banding(frame, [{ x: 0, y: 0 }]), /at least three samples/);
});

test("a two-colour design measures as two hues, and grey does not count", () => {
  // Half gold, half cyan, on a grey field that must be ignored as uncoloured.
  const frame = makeFrame(30, 10, (x) => {
    if (x < 10) return [214, 168, 84];
    if (x < 20) return [96, 208, 224];
    return [90, 90, 90];
  });
  const hue = hueSpread(frame);
  assert.equal(hue.distinctHues, 2, `hues found: ${hue.distinctHues}`);
  assert.ok(Math.abs(hue.colouredShare - 2 / 3) < 1e-9);
});

test("a frame with no colour in it reports none rather than dividing by zero", () => {
  const frame = makeFrame(10, 10, () => [40, 40, 40]);
  const hue = hueSpread(frame);
  assert.equal(hue.colouredShare, 0);
  assert.equal(hue.distinctHues, 0);
});

test("a line of even brightness has no ripple; a beaded one does", () => {
  const even = makeFrame(10, 10, (x, y) => (y === 5 ? [200, 200, 200] : [0, 0, 0]));
  const cuts = Array.from({ length: 10 }, (unused, x) => (
    [{ x, y: 4 }, { x, y: 5 }, { x, y: 6 }]
  ));
  assert.equal(edgeRipple(even, cuts).ripple, 0);

  // Alternating bright and dim: the chain of beads the eye actually sees.
  const beaded = makeFrame(10, 10, (x, y) => (
    y === 5 ? (x % 2 === 0 ? [200, 200, 200] : [120, 120, 120]) : [0, 0, 0]
  ));
  const rippled = edgeRipple(beaded, cuts);
  assert.ok(rippled.ripple > 0.4, `ripple was ${rippled.ripple}`);
});

test("edge ripple refuses to answer from a single cross section", () => {
  const frame = makeFrame(4, 4, () => [0, 0, 0]);
  assert.throws(() => edgeRipple(frame, [[{ x: 0, y: 0 }]]), /at least two cross sections/);
});

test("luma weights green the way the eye does", () => {
  const green = new Uint8ClampedArray([0, 255, 0, 255]);
  const blue = new Uint8ClampedArray([0, 0, 255, 255]);
  assert.ok(luminanceAt(green, 0) > luminanceAt(blue, 0) * 9);
});

test("a malformed frame is an error, never a silent zero", () => {
  assert.throws(() => inkCoverage(null), /needs data, width and height/);
  assert.throws(
    () => inkCoverage({ data: new Uint8ClampedArray(4), width: 10, height: 10 }),
    /shorter than its own dimensions/,
  );
});

test("the one-call summary agrees with the individual measurements", () => {
  const frame = makeFrame(20, 20, (x) => (x < 2 ? [214, 168, 84] : [0, 0, 0]));
  const all = frameBeauty(frame);
  assert.equal(all.inkCoverage, inkCoverage(frame));
  assert.deepEqual(all.tone, tonalRange(frame));
  assert.equal(all.hue.distinctHues, hueSpread(frame).distinctHues);
});
