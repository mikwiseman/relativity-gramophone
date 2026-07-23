import {
  GRAVITATIONAL_CONSTANT,
  GRAVITY_SOFTENING,
  MAX_MOONS_PER_PLANET,
  MAX_WORLDS,
  physicalMassForDisplay,
} from "./physicsEngine.js";
import { keplerPitch } from "./sonification.js";

const TAU = Math.PI * 2;
const INNER_HILL_FRACTION = 0.24;
const OUTER_HILL_FRACTION = 0.44;
export const SATELLITE_SOFTENING_CLEARANCE = 2.2;
const MIN_SIBLING_GAP_FRACTION = 0.26;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function requireFinite(values, message) {
  if (!values.every(Number.isFinite)) throw new Error(message);
}

export function satelliteStabilityBand({ parent, star }) {
  requireFinite([
    parent?.x,
    parent?.y,
    parent?.mass,
    parent?.semiMajor,
    star?.x,
    star?.y,
    star?.mass,
  ], "A stable satellite ring requires finite parent and star state");
  if (parent.kind !== "planet" || !(parent.mass > 0) || !(parent.semiMajor > 0) || !(star.mass > 0)) {
    throw new Error("A stable satellite ring requires a bound planet");
  }

  const distanceToStar = Math.max(
    parent.semiMajor,
    Math.hypot(parent.x - star.x, parent.y - star.y),
  );
  const hillRadius = distanceToStar * Math.cbrt(parent.mass / (3 * star.mass));
  const innerRadius = Math.max(
    GRAVITY_SOFTENING * SATELLITE_SOFTENING_CLEARANCE,
    hillRadius * INNER_HILL_FRACTION,
  );
  const outerRadius = hillRadius * OUTER_HILL_FRACTION;
  if (!(outerRadius > innerRadius)) throw new Error("This planet has no stable room for a moon");
  return { hillRadius, innerRadius, outerRadius };
}

function allocateMoonId(parentId, existingBodies) {
  const existingIds = new Set(existingBodies.map((body) => body.id));
  for (let index = 1; index <= MAX_MOONS_PER_PLANET; index += 1) {
    const candidate = `moon-${parentId}-${index}`;
    if (!existingIds.has(candidate)) return candidate;
  }
  throw new Error("A planet can hold at most two moons");
}

export function birthSatelliteFromRadialLaunch({
  release,
  parent,
  star,
  existingBodies,
}) {
  if (!Array.isArray(existingBodies)) throw new Error("Moon birth requires the live system");
  if (existingBodies.filter((body) => body.kind !== "star").length >= MAX_WORLDS) {
    throw new Error("The sky is full — remove a world before adding a moon");
  }
  requireFinite([
    release?.x,
    release?.y,
    parent?.x,
    parent?.y,
    parent?.vx,
    parent?.vy,
    parent?.mass,
  ], "Moon birth requires finite release and parent state");

  const siblings = existingBodies.filter((body) => body.kind === "moon" && body.parentId === parent.id);
  if (siblings.length >= MAX_MOONS_PER_PLANET) throw new Error("A planet can hold at most two moons");

  const band = satelliteStabilityBand({ parent, star });
  const dx = release.x - parent.x;
  const dy = release.y - parent.y;
  const draggedRadius = Math.hypot(dx, dy);
  if (draggedRadius < GRAVITY_SOFTENING) throw new Error("Drag outward from the planet to make a moon");
  const desiredRadius = clamp(draggedRadius, band.innerRadius, band.outerRadius);
  const siblingGap = (band.outerRadius - band.innerRadius) * MIN_SIBLING_GAP_FRACTION;
  const siblingRadii = siblings.map((body) => (
    Number.isFinite(body.semiMajor)
      ? body.semiMajor
      : Math.hypot(body.x - parent.x, body.y - parent.y)
  ));
  const isFree = (candidate) => siblingRadii.every((occupied) => (
    Math.abs(candidate - occupied) >= siblingGap - 1e-12
  ));
  const radius = isFree(desiredRadius)
    ? desiredRadius
    : [band.innerRadius, band.outerRadius]
      .filter(isFree)
      .sort((first, second) => Math.abs(first - desiredRadius) - Math.abs(second - desiredRadius))[0];
  if (!Number.isFinite(radius)) throw new Error("This planet has no stable room for another moon");

  const unitX = dx / draggedRadius;
  const unitY = dy / draggedRadius;
  const displayMass = 0.04 + siblings.length * 0.012;
  const physicalMass = physicalMassForDisplay(displayMass, "moon");
  const mu = GRAVITATIONAL_CONSTANT * (parent.mass + physicalMass);
  const speed = Math.sqrt(mu / radius);
  const period = TAU * Math.sqrt((radius ** 3) / mu);

  return {
    id: allocateMoonId(parent.id, existingBodies),
    kind: "moon",
    parentId: parent.id,
    created: true,
    sprite: 1 + (siblings.length % 3),
    voice: parent.voice,
    mass: displayMass,
    frequency: keplerPitch(period) ?? clamp(parent.frequency * 1.5, 40, 1_800),
    pan: clamp((parent.pan ?? 0) + unitX * 0.18, -0.92, 0.92),
    x: parent.x + unitX * radius,
    y: parent.y + unitY * radius,
    vx: parent.vx - unitY * speed,
    vy: parent.vy + unitX * speed,
  };
}
