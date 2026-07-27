/**
 * Measuring the picture.
 *
 * "Beautiful" is a judgement, but most of the ways a rendered frame fails are
 * not judgements at all — they are measurable. A frame that is too busy, that
 * clips its highlights to white, that bands a gradient into visible steps, that
 * carries eleven hues in a two-colour design, or that draws a thin line as a
 * chain of beads: each of those is a number, and each moved the wrong way at
 * some point in this project's history.
 *
 * So the metrics live here as pure functions over pixels, unit-tested against
 * synthetic images whose correct answers are known by construction. The browser
 * does one thing only: hands over the frame. Read it from the WebGL drawing
 * buffer through `drawImage` + `getImageData` — never from a screenshot. A
 * screenshot of a bright object on black is resampled and invents faint rings
 * around it; that cost an hour of chasing a halo that was never rendered.
 *
 * Everything here works in display-referred sRGB, on 0..1, because that is what
 * the eye is given. Where linear light is the right space it is said so.
 */

/** Rec. 709 luma on display-referred sRGB, 0..1. */
export function luminanceAt(data, index) {
  return (0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]) / 255;
}

function assertFrame(frame) {
  if (!frame || !frame.data || !Number.isFinite(frame.width) || !Number.isFinite(frame.height)) {
    throw new Error("A frame needs data, width and height");
  }
  if (frame.data.length < frame.width * frame.height * 4) {
    throw new Error("Frame data is shorter than its own dimensions");
  }
  return frame;
}

/**
 * INK COVERAGE — how much of the frame is drawn on.
 *
 * This is the one metric that must go DOWN as the product improves. The design
 * is a lacquer box: black, with a few luminous things on it. A frame that keeps
 * gaining glow, particles, labels and chrome gains coverage, and it gains it
 * invisibly, one addition at a time.
 *
 * `threshold` is display-referred luma. 0.06 is roughly where a viewer in a dim
 * room stops reading a pixel as black.
 */
export function inkCoverage(frame, { threshold = 0.06 } = {}) {
  assertFrame(frame);
  const { data, width, height } = frame;
  const total = width * height;
  let lit = 0;
  for (let i = 0; i < total; i += 1) {
    if (luminanceAt(data, i * 4) > threshold) lit += 1;
  }
  return lit / total;
}

/**
 * TONAL RANGE — the shape of the light, not its amount.
 *
 * `black` is the share of the frame that is genuinely black: on this artwork it
 * should be most of it. `clipped` is the share that has blown out to white in
 * every channel, which is where a star stops being a photosphere and becomes a
 * disc of paper. `p50`/`p95`/`p999` say whether the lit part has any modelling
 * in it or is one flat value.
 */
export function tonalRange(frame, { blackBelow = 0.02, clipAbove = 0.985 } = {}) {
  assertFrame(frame);
  const { data, width, height } = frame;
  const total = width * height;
  const values = new Float64Array(total);
  let black = 0;
  let clipped = 0;
  for (let i = 0; i < total; i += 1) {
    const index = i * 4;
    const luma = luminanceAt(data, index);
    values[i] = luma;
    if (luma <= blackBelow) black += 1;
    if (data[index] / 255 >= clipAbove
      && data[index + 1] / 255 >= clipAbove
      && data[index + 2] / 255 >= clipAbove) clipped += 1;
  }
  values.sort();
  const at = (q) => values[Math.min(total - 1, Math.max(0, Math.round(q * (total - 1))))];
  return {
    black: black / total,
    clipped: clipped / total,
    p50: at(0.5),
    p95: at(0.95),
    p999: at(0.999),
    max: values[total - 1],
  };
}

/**
 * BANDING — how many flat steps a gradient is made of.
 *
 * Walk a line of pixels and count the runs where luminance holds still. A true
 * gradient over N pixels has runs of one or two; a banded one has long
 * plateaus separated by jumps. Returned as the longest plateau in pixels and
 * the number of plateaus longer than `plateau`, because one wide step is worse
 * than many narrow ones.
 *
 * `samples` is an array of {x, y} along the line to walk — a radius out of a
 * glow, for example.
 */
export function banding(frame, samples, { plateau = 6, quantum = 1 / 255 } = {}) {
  assertFrame(frame);
  if (!Array.isArray(samples) || samples.length < 3) {
    throw new Error("Banding needs at least three samples along a line");
  }
  const { data, width } = frame;
  let runs = 0;
  let longest = 0;
  let run = 1;
  let previous = null;
  for (const point of samples) {
    const index = (Math.round(point.y) * width + Math.round(point.x)) * 4;
    const luma = luminanceAt(data, index);
    if (previous !== null && Math.abs(luma - previous) <= quantum / 2) {
      run += 1;
    } else {
      if (run >= plateau) runs += 1;
      longest = Math.max(longest, run);
      run = 1;
    }
    previous = luma;
  }
  if (run >= plateau) runs += 1;
  longest = Math.max(longest, run);
  return { plateaus: runs, longestPlateau: longest };
}

/**
 * HUE DISCIPLINE — how many colours are actually on screen.
 *
 * The chrome is meant to be two tokens, and the sky is meant to take its
 * colours from real blackbody temperature rather than from a palette. Both
 * claims are checkable: bucket the hue of every pixel that is bright enough and
 * saturated enough to read as coloured, and count the buckets carrying real
 * weight. Grey pixels are excluded — a starfield is not a colour decision.
 */
export function hueSpread(frame, {
  buckets = 36,
  minSaturation = 0.22,
  minLuma = 0.08,
  significantShare = 0.02,
} = {}) {
  assertFrame(frame);
  const { data, width, height } = frame;
  const total = width * height;
  const histogram = new Float64Array(buckets);
  let coloured = 0;
  for (let i = 0; i < total; i += 1) {
    const index = i * 4;
    const r = data[index] / 255;
    const g = data[index + 1] / 255;
    const b = data[index + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    if (max <= 0 || delta / max < minSaturation) continue;
    if (luminanceAt(data, index) < minLuma) continue;
    let hue;
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue = ((hue * 60) + 360) % 360;
    histogram[Math.min(buckets - 1, Math.floor((hue / 360) * buckets))] += 1;
    coloured += 1;
  }
  if (coloured === 0) return { colouredShare: 0, distinctHues: 0, histogram: Array.from(histogram) };
  let distinct = 0;
  for (const count of histogram) {
    if (count / coloured >= significantShare) distinct += 1;
  }
  return {
    colouredShare: coloured / total,
    distinctHues: distinct,
    histogram: Array.from(histogram, (count) => count / coloured),
  };
}

/**
 * EDGE RIPPLE — whether a thin drawn line is a line or a chain of beads.
 *
 * An orbit string is one pixel wide and drifts continuously across the pixel
 * grid. If its total brightness rises and falls as it drifts, the eye reads
 * beads. Take the peak brightness of the line at each of many positions along
 * it and return the relative spread. This is the measurement that settled the
 * `alphaToCoverage` question: 8.3% ripple with it, 4.2% without.
 *
 * `crossSections` is an array of arrays — each inner array is the pixels of one
 * cut across the line.
 */
export function edgeRipple(frame, crossSections) {
  assertFrame(frame);
  if (!Array.isArray(crossSections) || crossSections.length < 2) {
    throw new Error("Edge ripple needs at least two cross sections");
  }
  const { data, width } = frame;
  const peaks = crossSections.map((section) => {
    if (!Array.isArray(section) || section.length === 0) {
      throw new Error("Every cross section needs at least one sample");
    }
    let peak = 0;
    for (const point of section) {
      const index = (Math.round(point.y) * width + Math.round(point.x)) * 4;
      peak = Math.max(peak, luminanceAt(data, index));
    }
    return peak;
  });
  const mean = peaks.reduce((sum, value) => sum + value, 0) / peaks.length;
  if (mean <= 0) return { mean: 0, ripple: 0, peaks };
  const min = Math.min(...peaks);
  const max = Math.max(...peaks);
  return { mean, ripple: (max - min) / mean, peaks };
}

/**
 * One call, for the harness: everything that needs no geometry knowledge.
 * Banding and edge ripple need to be told where to look, so they stay separate.
 */
export function frameBeauty(frame, options = {}) {
  return {
    inkCoverage: inkCoverage(frame, options.ink),
    tone: tonalRange(frame, options.tone),
    hue: hueSpread(frame, options.hue),
  };
}
