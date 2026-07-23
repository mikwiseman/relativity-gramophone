import { GRAVITATIONAL_CONSTANT, MAX_WORLDS } from "./physicsEngine.js";
import { COSMIC_VOICE_ORDER, keplerPitch } from "./sonification.js";

const TAU = Math.PI * 2;

export const STAR_CORE_RADIUS = 0.075;
export const BIRTH_MIN_RADIUS = 0.14;
export const BIRTH_MAX_RADIUS = 0.56;
export const BIRTH_MIN_MASS = 0.34;
export const BIRTH_MAX_MASS = 1.18;
export const AIM_DEADZONE = 0.02;
export const MUSICAL_ORBIT_RADII = Object.freeze([0.21, 0.27, 0.3538000882, 0.4636092682, 0.54]);
const MASS_GROWTH_RATE = 0.62;
const AIM_SPEED_RANGE = 2.1;
const MIN_THROW_FRACTION = 0.62;
const MAX_BOUND_SPEED_FRACTION = 0.93;
const RADIAL_LAUNCH_MIN_DISTANCE = 0.1;
const MUSICAL_ORBIT_MIN_GAP = 0.018;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function birthMassFromHold(holdSeconds) {
  return clamp(BIRTH_MIN_MASS + Math.max(0, holdSeconds) * MASS_GROWTH_RATE, BIRTH_MIN_MASS, BIRTH_MAX_MASS);
}

function allocateWorldId(existingIds) {
  const taken = new Set(existingIds);
  for (let index = 1; index <= MAX_WORLDS; index += 1) {
    const candidate = `nova-${index}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error("The sky is full — feed a world to the star");
}

export function previewOrbit(spec, star, sampleCount = 72) {
  const dx = spec.x - star.x;
  const dy = spec.y - star.y;
  const dvx = spec.vx - star.vx;
  const dvy = spec.vy - star.vy;
  const radius = Math.hypot(dx, dy);
  const mu = GRAVITATIONAL_CONSTANT * star.mass;
  const angularMomentum = dx * dvy - dy * dvx;
  const eccentricityX = (dvy * angularMomentum) / mu - dx / radius;
  const eccentricityY = (-dvx * angularMomentum) / mu - dy / radius;
  const eccentricity = Math.hypot(eccentricityX, eccentricityY);
  const semiLatus = (angularMomentum * angularMomentum) / mu;
  const periapsisAngle = Math.atan2(eccentricityY, eccentricityX);

  const points = [];
  for (let index = 0; index <= sampleCount; index += 1) {
    const trueAnomaly = (index / sampleCount) * TAU;
    const orbitRadius = semiLatus / (1 + eccentricity * Math.cos(trueAnomaly));
    if (!Number.isFinite(orbitRadius) || orbitRadius <= 0) continue;
    points.push({
      x: star.x + orbitRadius * Math.cos(trueAnomaly + periapsisAngle),
      y: star.y + orbitRadius * Math.sin(trueAnomaly + periapsisAngle),
    });
  }
  return points;
}

export function birthBodyFromGesture({ press, aim, holdSeconds, star, existingIds, birthIndex }) {
  if (existingIds.length >= MAX_WORLDS) throw new Error("The sky is full — feed a world to the star");

  const pressDx = press.x - star.x;
  const pressDy = press.y - star.y;
  const pressRadius = Math.hypot(pressDx, pressDy);
  if (pressRadius < STAR_CORE_RADIUS) throw new Error("A world cannot be born inside the star");

  const radius = clamp(pressRadius, BIRTH_MIN_RADIUS, BIRTH_MAX_RADIUS);
  const unitX = pressDx / pressRadius;
  const unitY = pressDy / pressRadius;
  const x = star.x + unitX * radius;
  const y = star.y + unitY * radius;

  const mu = GRAVITATIONAL_CONSTANT * star.mass;
  const circularSpeed = Math.sqrt(mu / radius);
  const escapeSpeed = Math.sqrt(2 * mu / radius);

  let relativeVx;
  let relativeVy;
  const aimMagnitude = aim ? Math.hypot(aim.x, aim.y) : 0;
  if (aimMagnitude > AIM_DEADZONE) {
    const thrownSpeed = clamp(
      circularSpeed * (MIN_THROW_FRACTION + aimMagnitude * AIM_SPEED_RANGE),
      circularSpeed * MIN_THROW_FRACTION,
      escapeSpeed * MAX_BOUND_SPEED_FRACTION,
    );
    relativeVx = (aim.x / aimMagnitude) * thrownSpeed;
    relativeVy = (aim.y / aimMagnitude) * thrownSpeed;
  } else {
    relativeVx = -unitY * circularSpeed;
    relativeVy = unitX * circularSpeed;
  }

  const specificEnergy = (relativeVx * relativeVx + relativeVy * relativeVy) / 2 - mu / radius;
  const semiMajor = -mu / (2 * specificEnergy);
  const period = TAU * Math.sqrt((semiMajor * semiMajor * semiMajor) / mu);

  return {
    id: allocateWorldId(existingIds),
    created: true,
    sprite: 1 + (birthIndex % 3),
    voice: COSMIC_VOICE_ORDER[birthIndex % COSMIC_VOICE_ORDER.length],
    mass: birthMassFromHold(holdSeconds),
    frequency: keplerPitch(period) ?? 220,
    pan: clamp(x / 0.52, -0.86, 0.86),
    x,
    y,
    vx: star.vx + relativeVx,
    vy: star.vy + relativeVy,
  };
}

function freeMusicalOrbitRadius(draggedRadius, existingBodies = [], star) {
  const occupiedRadii = existingBodies
    .filter((body) => body.kind === "planet")
    .map((body) => (
      Number.isFinite(body.semiMajor)
        ? body.semiMajor
        : Math.hypot(body.x - star.x, body.y - star.y)
    ))
    .filter(Number.isFinite);
  const candidates = MUSICAL_ORBIT_RADII
    .filter((candidate) => occupiedRadii.every((occupied) => (
      Math.abs(candidate - occupied) >= MUSICAL_ORBIT_MIN_GAP
    )))
    .sort((first, second) => Math.abs(first - draggedRadius) - Math.abs(second - draggedRadius));
  if (!candidates.length) throw new Error("All five orbit strings are sounding — remove a planet to retune the sky");
  return candidates[0];
}

export function birthBodyFromRadialLaunch({
  release,
  star,
  existingIds,
  existingBodies = [],
  birthIndex,
}) {
  if (existingIds.length >= MAX_WORLDS) throw new Error("The sky is full — feed a world to the star");
  if (![release?.x, release?.y, star?.x, star?.y, star?.vx, star?.vy, star?.mass].every(Number.isFinite)) {
    throw new Error("A radial launch requires finite star and release coordinates");
  }

  const dx = release.x - star.x;
  const dy = release.y - star.y;
  const draggedRadius = Math.hypot(dx, dy);
  if (draggedRadius < RADIAL_LAUNCH_MIN_DISTANCE) throw new Error("Drag outward from the star to choose a pitch");

  const radius = freeMusicalOrbitRadius(draggedRadius, existingBodies, star);
  const unitX = dx / draggedRadius;
  const unitY = dy / draggedRadius;
  const circularSpeed = Math.sqrt(GRAVITATIONAL_CONSTANT * star.mass / radius);
  const period = TAU * Math.sqrt((radius ** 3) / (GRAVITATIONAL_CONSTANT * star.mass));
  const x = star.x + unitX * radius;
  const y = star.y + unitY * radius;

  return {
    id: allocateWorldId(existingIds),
    created: true,
    sprite: 1 + (birthIndex % 3),
    voice: COSMIC_VOICE_ORDER[birthIndex % COSMIC_VOICE_ORDER.length],
    mass: clamp(BIRTH_MIN_MASS + (birthIndex % 4) * 0.16, BIRTH_MIN_MASS, BIRTH_MAX_MASS),
    frequency: keplerPitch(period) ?? 220,
    pan: clamp(x / 0.52, -0.86, 0.86),
    x,
    y,
    vx: star.vx - unitY * circularSpeed,
    vy: star.vy + unitX * circularSpeed,
  };
}
