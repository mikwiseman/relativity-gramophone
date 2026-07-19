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
