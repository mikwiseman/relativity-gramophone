export const RESONANCE_TARGETS = Object.freeze(["2:1", "3:2", "5:3"]);

const TARGET_VALUES = Object.freeze({
  "2:1": 2,
  "3:2": 3 / 2,
  "5:3": 5 / 3,
});

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function isResonanceTarget(value) {
  return Object.hasOwn(TARGET_VALUES, value);
}

export function assertResonanceSeals(value) {
  if (!Array.isArray(value) || value.some((target) => !isResonanceTarget(target)) || new Set(value).size !== value.length) {
    throw new Error("Invalid resonance seals");
  }
}

export function captureResonance(current, target) {
  assertResonanceSeals(current);
  if (!isResonanceTarget(target)) throw new Error(`Unknown resonance target: ${target}`);
  return current.includes(target) ? current : [...current, target];
}

export function measureTargetResonance(bodies, target) {
  if (!isResonanceTarget(target)) throw new Error(`Unknown resonance target: ${target}`);
  const periodicBodies = Array.isArray(bodies)
    ? bodies.filter((body) => Number.isFinite(body?.period) && body.period > 0)
    : [];
  if (periodicBodies.length < 2) throw new Error("At least two live orbital periods are required");

  const targetValue = TARGET_VALUES[target];
  let closest = null;
  for (let firstIndex = 0; firstIndex < periodicBodies.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < periodicBodies.length; secondIndex += 1) {
      const first = periodicBodies[firstIndex];
      const second = periodicBodies[secondIndex];
      const observedRatio = Math.max(first.period, second.period) / Math.min(first.period, second.period);
      const relativeError = Math.abs(observedRatio - targetValue) / targetValue;
      if (closest && closest.relativeError <= relativeError) continue;
      closest = {
        bodyIds: [first.id, second.id],
        observedRatio,
        relativeError,
      };
    }
  }

  const lockStrength = clamp(1 - closest.relativeError / 0.035, 0, 1);
  const proximity = clamp(1 - Math.abs(Math.log(closest.observedRatio / targetValue)) / Math.log(1.4), 0, 1);
  const direction = closest.relativeError <= 0.007
    ? "HOLD THE ORBIT"
    : closest.observedRatio < targetValue
      ? "WIDEN THE RATIO"
      : "NARROW THE RATIO";

  return {
    target,
    ...closest,
    proximity,
    lockStrength,
    direction,
  };
}
