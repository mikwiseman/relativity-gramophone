/**
 * The bridge between the running picture and the measurements in
 * `frameBeauty.js`. Development only — `main.jsx` installs it behind
 * `import.meta.env.DEV`, so it is dead code in a production build and the
 * shipped instrument carries none of it.
 *
 * Read the drawing buffer, never a screenshot. A screenshot of a bright object
 * on absolute black is resampled on its way out, and the resampling invents
 * faint rings around every star; measuring one of those cost an hour of
 * chasing a halo that was never rendered. `drawImage` from the live canvas is
 * the actual pixels the GPU produced.
 *
 * The capture happens inside `requestAnimationFrame`, immediately after the
 * renderer has drawn. Three.js does not preserve the drawing buffer, so a read
 * taken at any other moment is allowed to come back blank.
 */
import { banding, edgeRipple, frameBeauty, hueSpread, inkCoverage, tonalRange } from "./frameBeauty.js";

/**
 * Grab one frame from a live canvas as ImageData.
 *
 * `scale` shrinks the read; 1 is the true drawing buffer. Coverage, tone and
 * hue are all area statistics and survive a downsample, but banding and edge
 * ripple are per-pixel questions and must be measured at scale 1.
 */
export function captureFrame(canvas, { scale = 1, immediate = false } = {}) {
  if (!canvas || typeof canvas.getContext !== "function") {
    throw new Error("A frame capture needs a canvas");
  }
  const width = Math.max(1, Math.round(canvas.width * scale));
  const height = Math.max(1, Math.round(canvas.height * scale));
  const read = () => {
    const surface = document.createElement("canvas");
    surface.width = width;
    surface.height = height;
    const context = surface.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("No 2D context to read the frame into");
    context.drawImage(canvas, 0, 0, width, height);
    const frame = context.getImageData(0, 0, width, height);
    // A read that came back with nothing in it is a failed read, not a black
    // frame — say so rather than returning a beautifully empty measurement.
    let anyAlpha = false;
    for (let i = 3; i < frame.data.length; i += 4 * 997) {
      if (frame.data[i] !== 0) { anyAlpha = true; break; }
    }
    if (!anyAlpha) {
      throw new Error("The drawing buffer read back empty — capture inside a frame, after the draw");
    }
    return { data: frame.data, width: frame.width, height: frame.height };
  };
  // `immediate` is for a tab that is not painting on its own — a hidden or
  // throttled one, where the next animation frame may never arrive. It is only
  // valid straight after a draw you know happened; the emptiness check above
  // is what stops it quietly measuring a buffer that was never filled.
  if (immediate) return Promise.resolve(read());
  if (typeof document !== "undefined" && document.hidden) {
    return Promise.reject(new Error(
      "This document is hidden, so nothing is being drawn. Show it, or capture with { immediate: true } directly after a frame you forced.",
    ));
  }
  return new Promise((resolve, reject) => {
    requestAnimationFrame(() => {
      try {
        resolve(read());
      } catch (error) {
        reject(error);
      }
    });
  });
}

/** A horizontal line of sample points — for banding across a glow's radius. */
export function radialSamples({ x, y, dx = 1, dy = 0, count = 64 }) {
  return Array.from({ length: count }, (unused, i) => ({ x: x + dx * i, y: y + dy * i }));
}

/** Cuts across a roughly horizontal line — for edge ripple along an orbit. */
export function crossSectionsAlong({ x, y, dx = 1, count = 64, thickness = 3 }) {
  const half = Math.floor(thickness / 2);
  return Array.from({ length: count }, (unused, i) => (
    Array.from({ length: thickness }, (unused2, k) => ({ x: x + dx * i, y: y - half + k }))
  ));
}

/**
 * Everything the frame can be asked without knowing where anything is.
 * Returns the numbers rounded to something a human can read in a console.
 */
export async function measureCanvas(canvas, options = {}) {
  const frame = await captureFrame(canvas, options.capture);
  const measured = frameBeauty(frame, options);
  return {
    size: [frame.width, frame.height],
    inkCoverage: Number(measured.inkCoverage.toFixed(4)),
    black: Number(measured.tone.black.toFixed(4)),
    clipped: Number(measured.tone.clipped.toFixed(5)),
    p50: Number(measured.tone.p50.toFixed(4)),
    p95: Number(measured.tone.p95.toFixed(4)),
    p999: Number(measured.tone.p999.toFixed(4)),
    max: Number(measured.tone.max.toFixed(4)),
    colouredShare: Number(measured.hue.colouredShare.toFixed(4)),
    distinctHues: measured.hue.distinctHues,
  };
}

/** What `main.jsx` hangs on `window.__rgBeauty` in development. */
export const frameBeautyProbe = {
  captureFrame,
  measureCanvas,
  radialSamples,
  crossSectionsAlong,
  banding,
  edgeRipple,
  frameBeauty,
  hueSpread,
  inkCoverage,
  tonalRange,
};
