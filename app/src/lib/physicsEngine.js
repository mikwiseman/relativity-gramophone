const TAU = Math.PI * 2;

export const PHYSICS_MODEL = "nbody-weak-relativity/2";
export const FIXED_STEP = 1 / 120;
export const GRAVITATIONAL_CONSTANT = 0.00665;
export const GRAVITY_SOFTENING = 0.006;
export const MAX_WORLDS = 12;

const PLANET_MASS_SCALE = 0.0028;
const FELT_RELATIVITY_GAIN = 1.18;
const MIN_CLOCK_RATE = 0.94;
const MAX_CLOCK_RATE = 0.9995;
const RESONANCE_RATIOS = [
  { numerator: 2, denominator: 1 },
  { numerator: 3, denominator: 2 },
  { numerator: 4, denominator: 3 },
  { numerator: 5, denominator: 3 },
  { numerator: 5, denominator: 4 },
];

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function clone(value) {
  return structuredClone(value);
}

function bodyDistanceSquared(first, second, softening) {
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  return { dx, dy, distanceSquared: dx * dx + dy * dy + softening * softening };
}

export function computeAccelerations(
  bodies,
  { gravitationalConstant = GRAVITATIONAL_CONSTANT, softening = GRAVITY_SOFTENING } = {},
) {
  const accelerations = bodies.map(() => ({ x: 0, y: 0 }));

  for (let firstIndex = 0; firstIndex < bodies.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < bodies.length; secondIndex += 1) {
      const first = bodies[firstIndex];
      const second = bodies[secondIndex];
      const { dx, dy, distanceSquared } = bodyDistanceSquared(first, second, softening);
      const inverseDistanceCubed = 1 / (distanceSquared * Math.sqrt(distanceSquared));
      const scale = gravitationalConstant * inverseDistanceCubed;

      accelerations[firstIndex].x += scale * second.mass * dx;
      accelerations[firstIndex].y += scale * second.mass * dy;
      accelerations[secondIndex].x -= scale * first.mass * dx;
      accelerations[secondIndex].y -= scale * first.mass * dy;
    }
  }

  return accelerations;
}

export function totalEnergy(
  bodies,
  { gravitationalConstant = GRAVITATIONAL_CONSTANT, softening = GRAVITY_SOFTENING } = {},
) {
  let kinetic = 0;
  let potential = 0;

  for (const body of bodies) kinetic += 0.5 * body.mass * (body.vx * body.vx + body.vy * body.vy);

  for (let firstIndex = 0; firstIndex < bodies.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < bodies.length; secondIndex += 1) {
      const first = bodies[firstIndex];
      const second = bodies[secondIndex];
      const { distanceSquared } = bodyDistanceSquared(first, second, softening);
      potential -= gravitationalConstant * first.mass * second.mass / Math.sqrt(distanceSquared);
    }
  }

  return kinetic + potential;
}

export function computeWeakFieldClockRate({ potential, speedSquared }) {
  const rawLoss = Math.max(0, -potential) + Math.max(0, speedSquared) / 2;
  return {
    rawLoss,
    feltRate: clamp(1 - rawLoss * FELT_RELATIVITY_GAIN, MIN_CLOCK_RATE, MAX_CLOCK_RATE),
  };
}

export function dopplerFactor(radialVelocity) {
  const beta = clamp(radialVelocity * 0.12, -0.06, 0.06);
  return Math.sqrt((1 + beta) / (1 - beta));
}

export function findClosestResonance(periodicBodies, tolerance = 0.035) {
  let closest = null;

  for (let firstIndex = 0; firstIndex < periodicBodies.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < periodicBodies.length; secondIndex += 1) {
      const first = periodicBodies[firstIndex];
      const second = periodicBodies[secondIndex];
      if (!(first.period > 0) || !(second.period > 0)) continue;
      const observedRatio = Math.max(first.period, second.period) / Math.min(first.period, second.period);

      for (const ratio of RESONANCE_RATIOS) {
        const target = ratio.numerator / ratio.denominator;
        const relativeError = Math.abs(observedRatio - target) / target;
        if (relativeError > tolerance) continue;
        const strength = 1 - relativeError / tolerance;
        if (closest && closest.strength >= strength - 1e-12) continue;
        closest = {
          label: `${ratio.numerator}:${ratio.denominator}`,
          numerator: ratio.numerator,
          denominator: ratio.denominator,
          bodyIds: [first.id, second.id],
          observedRatio,
          error: relativeError,
          strength,
        };
      }
    }
  }

  return closest;
}

function initialPlanetState(body) {
  const eccentricity = clamp(body.eccentricity, 0, 0.72);
  const eccentricAnomaly = body.phase;
  const semiMajor = body.semiMajor;
  const root = Math.sqrt(1 - eccentricity * eccentricity);
  const meanMotion = TAU / body.period;
  const anomalyRate = meanMotion / Math.max(0.25, 1 - eccentricity * Math.cos(eccentricAnomaly));

  return {
    id: body.id,
    kind: "planet",
    ...(body.created ? { created: true } : {}),
    sprite: body.sprite,
    mass: PLANET_MASS_SCALE * body.mass,
    displayMass: body.mass,
    frequency: body.frequency,
    pan: body.pan,
    voice: body.voice,
    x: semiMajor * (Math.cos(eccentricAnomaly) - eccentricity),
    y: semiMajor * root * Math.sin(eccentricAnomaly),
    vx: -semiMajor * Math.sin(eccentricAnomaly) * anomalyRate,
    vy: semiMajor * root * Math.cos(eccentricAnomaly) * anomalyRate,
    properTime: 0,
    properRate: 1,
    rawClockLoss: 0,
    potential: 0,
    period: body.period,
    semiMajor,
    eccentricity,
    doppler: 1,
  };
}

function removeCenterOfMassDrift(bodies) {
  const totalMass = bodies.reduce((sum, body) => sum + body.mass, 0);
  const centerX = bodies.reduce((sum, body) => sum + body.x * body.mass, 0) / totalMass;
  const centerY = bodies.reduce((sum, body) => sum + body.y * body.mass, 0) / totalMass;
  const velocityX = bodies.reduce((sum, body) => sum + body.vx * body.mass, 0) / totalMass;
  const velocityY = bodies.reduce((sum, body) => sum + body.vy * body.mass, 0) / totalMass;

  for (const body of bodies) {
    body.x -= centerX;
    body.y -= centerY;
    body.vx -= velocityX;
    body.vy -= velocityY;
  }
}

export function createInitialPhysicsState(compositionBodies) {
  const bodies = [
    {
      id: "star",
      kind: "star",
      sprite: 0,
      mass: 1,
      displayMass: 1,
      frequency: 55,
      pan: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      properTime: 0,
      properRate: 1,
      rawClockLoss: 0,
      potential: 0,
      period: null,
      semiMajor: 0,
      eccentricity: 0,
      doppler: 1,
    },
    ...compositionBodies.map(initialPlanetState),
  ];
  removeCenterOfMassDrift(bodies);
  return { model: PHYSICS_MODEL, time: 0, bodies };
}

function potentialAtBody(targetIndex, bodies) {
  const target = bodies[targetIndex];
  let potential = 0;
  for (let index = 0; index < bodies.length; index += 1) {
    if (index === targetIndex) continue;
    const other = bodies[index];
    const { distanceSquared } = bodyDistanceSquared(target, other, GRAVITY_SOFTENING);
    potential -= GRAVITATIONAL_CONSTANT * other.mass / Math.sqrt(distanceSquared);
  }
  return potential;
}

function osculatingElements(body, star) {
  const dx = body.x - star.x;
  const dy = body.y - star.y;
  const dvx = body.vx - star.vx;
  const dvy = body.vy - star.vy;
  const radius = Math.max(0.0001, Math.hypot(dx, dy));
  const speedSquared = dvx * dvx + dvy * dvy;
  const mu = GRAVITATIONAL_CONSTANT * (star.mass + body.mass);
  const specificEnergy = speedSquared / 2 - mu / radius;
  if (specificEnergy >= 0) return { semiMajor: radius, period: Infinity, eccentricity: 1 };
  const semiMajor = -mu / (2 * specificEnergy);
  const angularMomentum = dx * dvy - dy * dvx;
  const eccentricitySquared = Math.max(0, 1 + (2 * specificEnergy * angularMomentum * angularMomentum) / (mu * mu));
  return {
    semiMajor,
    period: TAU * Math.sqrt((semiMajor * semiMajor * semiMajor) / mu),
    eccentricity: Math.sqrt(eccentricitySquared),
  };
}

export class PhysicsEngine {
  constructor(initialState) {
    this.state = clone(initialState);
    this.updateDerived(0);
  }

  snapshot() {
    return clone(this.state);
  }

  reset(initialState) {
    this.state = clone(initialState);
    this.updateDerived(0);
  }

  getBody(bodyId) {
    return this.state.bodies.find((body) => body.id === bodyId) ?? null;
  }

  getResonance() {
    return findClosestResonance(this.state.bodies.filter((body) => body.kind === "planet"));
  }

  step(stepSize = FIXED_STEP) {
    const bodies = this.state.bodies;
    const acceleration = computeAccelerations(bodies);

    for (let index = 0; index < bodies.length; index += 1) {
      const body = bodies[index];
      body.vx += acceleration[index].x * stepSize / 2;
      body.vy += acceleration[index].y * stepSize / 2;
      body.x += body.vx * stepSize;
      body.y += body.vy * stepSize;
    }

    const nextAcceleration = computeAccelerations(bodies);
    for (let index = 0; index < bodies.length; index += 1) {
      bodies[index].vx += nextAcceleration[index].x * stepSize / 2;
      bodies[index].vy += nextAcceleration[index].y * stepSize / 2;
    }

    this.state.time += stepSize;
    this.updateDerived(stepSize);
    return this.state;
  }

  updateDerived(stepSize) {
    const star = this.getBody("star");
    for (let index = 0; index < this.state.bodies.length; index += 1) {
      const body = this.state.bodies[index];
      const potential = potentialAtBody(index, this.state.bodies);
      const speedSquared = body.vx * body.vx + body.vy * body.vy;
      const clock = computeWeakFieldClockRate({ potential, speedSquared });
      body.potential = potential;
      body.rawClockLoss = clock.rawLoss;
      body.properRate = clock.feltRate;
      body.properTime += clock.feltRate * stepSize;
      body.doppler = dopplerFactor(body.vx - (star?.vx ?? 0));

      if (body.kind === "planet" && star) Object.assign(body, osculatingElements(body, star));
    }
  }

  setBodyState(bodyId, state) {
    const body = this.getBody(bodyId);
    if (!body || body.kind !== "planet") throw new Error(`Unknown physical body: ${bodyId}`);
    for (const key of ["x", "y", "vx", "vy"]) {
      if (!Number.isFinite(state[key])) throw new Error(`Invalid ${key} for ${bodyId}`);
      body[key] = state[key];
    }
    this.updateDerived(0);
    return {
      kind: "set-body-state",
      at: Number(this.state.time.toFixed(6)),
      bodyId,
      state: { x: body.x, y: body.y, vx: body.vx, vy: body.vy },
    };
  }

  setOrbitFromGesture(bodyId, { x, y, velocityScale = 1 }) {
    const body = this.getBody(bodyId);
    const star = this.getBody("star");
    if (!body || body.kind !== "planet" || !star) throw new Error(`Unknown physical body: ${bodyId}`);
    const dx = x - star.x;
    const dy = y - star.y;
    const radius = clamp(Math.hypot(dx, dy), 0.16, 0.52);
    const unitX = dx / Math.max(Math.hypot(dx, dy), 1e-6);
    const unitY = dy / Math.max(Math.hypot(dx, dy), 1e-6);
    const relativeVx = body.vx - star.vx;
    const relativeVy = body.vy - star.vy;
    const direction = dx * relativeVy - dy * relativeVx >= 0 ? 1 : -1;
    const tangentX = -unitY * direction;
    const tangentY = unitX * direction;
    const mu = GRAVITATIONAL_CONSTANT * (star.mass + body.mass);
    const speed = Math.sqrt(mu / radius) * clamp(velocityScale, 0.72, 1.22);

    return this.setBodyState(bodyId, {
      x: star.x + unitX * radius,
      y: star.y + unitY * radius,
      vx: star.vx + tangentX * speed,
      vy: star.vy + tangentY * speed,
    });
  }

  addBody(spec) {
    if (this.getBody(spec.id)) throw new Error(`Duplicate physical body: ${spec.id}`);
    if (this.state.bodies.filter((body) => body.kind === "planet").length >= MAX_WORLDS) {
      throw new Error("The sky is full — feed a world to the star");
    }
    for (const key of ["x", "y", "vx", "vy", "mass", "frequency", "pan"]) {
      if (!Number.isFinite(spec[key])) throw new Error(`Invalid ${key} for ${spec.id}`);
    }

    this.state.bodies.push({
      id: spec.id,
      kind: "planet",
      created: true,
      sprite: spec.sprite,
      mass: PLANET_MASS_SCALE * spec.mass,
      displayMass: spec.mass,
      frequency: spec.frequency,
      pan: spec.pan,
      voice: spec.voice,
      x: spec.x,
      y: spec.y,
      vx: spec.vx,
      vy: spec.vy,
      properTime: 0,
      properRate: 1,
      rawClockLoss: 0,
      potential: 0,
      period: null,
      semiMajor: 0,
      eccentricity: 0,
      doppler: 1,
    });
    this.updateDerived(0);
    return { kind: "add-body", at: Number(this.state.time.toFixed(6)), body: clone(spec) };
  }

  removeBody(bodyId) {
    const index = this.state.bodies.findIndex((body) => body.id === bodyId);
    if (index === -1) throw new Error(`Unknown physical body: ${bodyId}`);
    if (this.state.bodies[index].kind !== "planet") throw new Error("The star cannot be removed");
    this.state.bodies.splice(index, 1);
    this.updateDerived(0);
    return { kind: "remove-body", at: Number(this.state.time.toFixed(6)), bodyId };
  }

  applyEvent(event) {
    if (event.kind === "add-body") {
      this.addBody(event.body);
      return;
    }
    if (event.kind === "remove-body") {
      this.removeBody(event.bodyId);
      return;
    }
    if (event.kind !== "set-body-state") throw new Error(`Unsupported physics event: ${event.kind}`);
    this.setBodyState(event.bodyId, event.state);
  }
}
