/**
 * The closest approach between two line segments, in 2D.
 *
 * Returns how far apart they come, where along the first segment that happens
 * (`s`, from 0 to 1), and the point on the second. Parallel and degenerate
 * cases fall out of the clamping rather than being special-cased.
 */
function closestApproach(a0, a1, b0, b1) {
  const ux = a1.x - a0.x;
  const uy = a1.y - a0.y;
  const vx = b1.x - b0.x;
  const vy = b1.y - b0.y;
  const wx = a0.x - b0.x;
  const wy = a0.y - b0.y;
  const a = ux * ux + uy * uy;
  const b = ux * vx + uy * vy;
  const c = vx * vx + vy * vy;
  const d = ux * wx + uy * wy;
  const e = vx * wx + vy * wy;
  const denominator = a * c - b * b;

  let s;
  let t;
  if (denominator <= 1e-12) {
    // Parallel, or one of them has no length: slide along the second only.
    s = 0;
    t = c > 0 ? e / c : 0;
  } else {
    s = (b * e - c * d) / denominator;
    t = (a * e - b * d) / denominator;
  }
  s = Math.min(1, Math.max(0, s));
  t = Math.min(1, Math.max(0, t));
  // Clamping s may have moved us off the true minimum, so re-solve t for the
  // clamped s, then re-solve s for the clamped t. Two passes is exact for
  // segments.
  t = c > 0 ? Math.min(1, Math.max(0, ((a0.x + ux * s) - b0.x) * vx + ((a0.y + uy * s) - b0.y) * vy) / c) : 0;
  s = a > 0 ? Math.min(1, Math.max(0, (((b0.x + vx * t) - a0.x) * ux + ((b0.y + vy * t) - a0.y) * uy) / a)) : 0;
  const px = a0.x + ux * s;
  const py = a0.y + uy * s;
  const qx = b0.x + vx * t;
  const qy = b0.y + vy * t;
  return { s, t, distance: Math.hypot(px - qx, py - qy), x: qx, y: qy };
}

/**
 * Every string a hand crosses on its way from one point to the next, in the
 * order it meets them.
 *
 * The screen says "SWIPE IT LIKE A STRING", and a swipe is a path, not a point.
 * Two things follow, and both were wrong before this existed. A strum must be
 * able to begin on empty sky — a hand that lands on black and sweeps across
 * three orbits is strumming three orbits. And the gesture is the whole segment
 * between two pointer samples: at 60 Hz a quick flick reports points hundreds
 * of pixels apart, so testing only where the finger was *seen* misses every
 * line in between, and the fastest, most natural strum is the one that goes
 * silent.
 *
 * Each string can be struck at most once per sweep, at its closest approach,
 * and the returned offset says where along that orbit it was struck — which is
 * what sets the timbre.
 */
export function stringsAlongSweep(from, to, strings, threshold) {
  if (Math.hypot(to.x - from.x, to.y - from.y) <= 0) return [];
  const hits = [];

  for (const string of strings) {
    const points = string.points;
    if (!points || points.length < 2) continue;

    let pathLength = 0;
    const segmentLengths = [];
    for (let index = 1; index < points.length; index += 1) {
      const length = Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
      segmentLengths.push(length);
      pathLength += length;
    }
    if (pathLength <= 0) continue;

    let traversed = 0;
    let best = null;
    for (let index = 1; index < points.length; index += 1) {
      const segmentLength = segmentLengths[index - 1];
      if (segmentLength <= 0) {
        traversed += segmentLength;
        continue;
      }
      const approach = closestApproach(from, to, points[index - 1], points[index]);
      if (approach.distance <= threshold && (!best || approach.distance < best.distance)) {
        best = {
          bodyId: string.bodyId,
          distance: approach.distance,
          offset: (traversed + segmentLength * approach.t) / pathLength,
          x: approach.x,
          y: approach.y,
          sweep: approach.s,
        };
      }
      traversed += segmentLength;
    }
    if (best) hits.push(best);
  }

  // The order the hand meets them is the order they should sound.
  return hits.sort((first, second) => first.sweep - second.sweep);
}

export function nearestStringPoint(point, strings, threshold) {
  let best = null;

  for (const string of strings) {
    const points = string.points;
    if (!points || points.length < 2) continue;

    let pathLength = 0;
    const segmentLengths = [];
    for (let index = 1; index < points.length; index += 1) {
      const length = Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
      segmentLengths.push(length);
      pathLength += length;
    }
    if (pathLength <= 0) continue;

    let traversed = 0;
    for (let index = 1; index < points.length; index += 1) {
      const start = points[index - 1];
      const end = points[index];
      const segmentLength = segmentLengths[index - 1];
      if (segmentLength <= 0) continue;
      const deltaX = end.x - start.x;
      const deltaY = end.y - start.y;
      const projection = Math.min(1, Math.max(0,
        ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / (segmentLength * segmentLength),
      ));
      const closestX = start.x + deltaX * projection;
      const closestY = start.y + deltaY * projection;
      const distance = Math.hypot(point.x - closestX, point.y - closestY);
      if (distance <= threshold && (!best || distance < best.distance)) {
        best = {
          bodyId: string.bodyId,
          distance,
          offset: (traversed + segmentLength * projection) / pathLength,
          x: closestX,
          y: closestY,
        };
      }
      traversed += segmentLength;
    }
  }

  return best;
}
