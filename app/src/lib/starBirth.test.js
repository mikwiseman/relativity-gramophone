import test from "node:test";
import assert from "node:assert/strict";

import {
  BIRTH_MAX_MASS,
  BIRTH_MIN_MASS,
  BIRTH_MIN_RADIUS,
  STAR_CORE_RADIUS,
  birthBodyFromGesture,
  birthMassFromHold,
  previewOrbit,
} from "./starBirth.js";
import { GRAVITATIONAL_CONSTANT, MAX_WORLDS } from "./physicsEngine.js";
import { COSMIC_VOICE_ORDER } from "./sonification.js";

const STAR = { id: "star", kind: "star", mass: 1, x: 0, y: 0, vx: 0, vy: 0 };

function gesture(overrides = {}) {
  return {
    press: { x: 0.3, y: 0.1 },
    aim: null,
    holdSeconds: 0.4,
    star: STAR,
    existingIds: ["io", "europa", "callisto"],
    birthIndex: 0,
    ...overrides,
  };
}

function specificOrbitalEnergy(spec, star) {
  const dx = spec.x - star.x;
  const dy = spec.y - star.y;
  const dvx = spec.vx - star.vx;
  const dvy = spec.vy - star.vy;
  const radius = Math.hypot(dx, dy);
  const mu = GRAVITATIONAL_CONSTANT * star.mass;
  return (dvx * dvx + dvy * dvy) / 2 - mu / radius;
}

test("a bare tap births the lightest world on a bound prograde orbit at the pressed radius", () => {
  const spec = birthBodyFromGesture(gesture({ holdSeconds: 0, aim: null }));

  assert.equal(spec.id, "nova-1");
  assert.equal(spec.mass, BIRTH_MIN_MASS);
  assert.ok(Math.abs(Math.hypot(spec.x, spec.y) - Math.hypot(0.3, 0.1)) < 1e-9);
  assert.ok(specificOrbitalEnergy(spec, STAR) < 0, "orbit must be bound");
  assert.ok(spec.x * spec.vy - spec.y * spec.vx > 0, "default spin must be prograde");
});

test("holding the void grows mass monotonically up to the clamp", () => {
  assert.equal(birthMassFromHold(0), BIRTH_MIN_MASS);
  assert.ok(birthMassFromHold(0.8) > birthMassFromHold(0.2));
  assert.equal(birthMassFromHold(30), BIRTH_MAX_MASS);
});

test("an aim vector throws the world while a violent throw stays gravitationally bound", () => {
  const thrownUp = birthBodyFromGesture(gesture({ aim: { x: 0, y: 0.2 } }));
  const thrownDown = birthBodyFromGesture(gesture({ aim: { x: 0, y: -0.2 } }));
  const hurled = birthBodyFromGesture(gesture({ aim: { x: 9, y: 9 } }));

  assert.ok(thrownUp.vy > 0);
  assert.ok(thrownDown.vy < 0);
  assert.ok(thrownUp.x * thrownUp.vy - thrownUp.y * thrownUp.vx > 0);
  assert.ok(thrownDown.x * thrownDown.vy - thrownDown.y * thrownDown.vx < 0, "reverse aim flips spin");
  assert.ok(specificOrbitalEnergy(hurled, STAR) < 0, "even a hurled world must stay bound");
});

test("every throw lands a musical orbit — no plunge below the throw floor, no escape above the cap", () => {
  const radius = Math.hypot(0.3, 0.1);
  const mu = GRAVITATIONAL_CONSTANT * STAR.mass;
  const circularSpeed = Math.sqrt(mu / radius);
  const escapeSpeed = Math.sqrt(2 * mu / radius);
  const gentle = birthBodyFromGesture(gesture({ aim: { x: 0.021, y: 0 } }));
  const violent = birthBodyFromGesture(gesture({ aim: { x: -7, y: 4 } }));

  const gentleSpeed = Math.hypot(gentle.vx, gentle.vy);
  const violentSpeed = Math.hypot(violent.vx, violent.vy);
  assert.ok(gentleSpeed >= circularSpeed * 0.62 - 1e-12, "a gentle throw must not plunge into the star");
  assert.ok(violentSpeed <= escapeSpeed * 0.93 + 1e-12, "a violent throw must stay below escape speed");
});

test("a press against the star is pushed out to the minimum birth radius and the core refuses births", () => {
  const nearCore = birthBodyFromGesture(gesture({ press: { x: STAR_CORE_RADIUS + 0.01, y: 0 } }));

  assert.ok(Math.hypot(nearCore.x, nearCore.y) >= BIRTH_MIN_RADIUS - 1e-9);
  assert.throws(() => birthBodyFromGesture(gesture({ press: { x: 0.01, y: 0.01 } })), /star/i);
});

test("ids stay unique and stable while voices and sprites cycle deterministically", () => {
  const taken = gesture({ existingIds: ["io", "europa", "callisto", "nova-1", "nova-3"] });
  const spec = birthBodyFromGesture(taken);
  const again = birthBodyFromGesture(taken);

  assert.equal(spec.id, "nova-2");
  assert.deepEqual(spec, again, "birth math must be deterministic");

  for (const [index, expectedVoice] of ["earth", "moon", "light", "alpha-centauri", "earth"].entries()) {
    const cycled = birthBodyFromGesture(gesture({ birthIndex: index }));
    assert.equal(cycled.voice, expectedVoice);
    assert.equal(cycled.sprite, 1 + (index % 3));
    assert.equal(COSMIC_VOICE_ORDER.includes(cycled.voice), true);
  }
});

test("a full sky refuses another birth", () => {
  const existingIds = ["io", "europa", "callisto", ...Array.from({ length: MAX_WORLDS - 3 }, (_, i) => `nova-${i + 1}`)];

  assert.throws(() => birthBodyFromGesture(gesture({ existingIds })), /sky is full/i);
});

test("the aim ghost is a closed bound ellipse that brackets the birth radius", () => {
  const spec = birthBodyFromGesture(gesture({ aim: { x: 0.05, y: 0.16 } }));
  const points = previewOrbit(spec, STAR);
  const radii = points.map((point) => Math.hypot(point.x - STAR.x, point.y - STAR.y));
  const birthRadius = Math.hypot(spec.x - STAR.x, spec.y - STAR.y);

  assert.ok(points.length >= 48);
  assert.ok(points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)));
  assert.ok(Math.min(...radii) <= birthRadius + 1e-6);
  assert.ok(Math.max(...radii) >= birthRadius - 1e-6);
  assert.ok(Math.max(...radii) < 3, "a bound ghost never runs to infinity");
});

test("every born world carries the fields the score and the instrument need", () => {
  const spec = birthBodyFromGesture(gesture({ holdSeconds: 1.2, aim: { x: 0.1, y: 0.05 }, birthIndex: 2 }));

  for (const key of ["x", "y", "vx", "vy", "mass", "frequency", "pan"]) {
    assert.ok(Number.isFinite(spec[key]), `${key} must be finite`);
  }
  assert.ok(spec.frequency >= 55 && spec.frequency <= 1760);
  assert.ok(spec.pan >= -1 && spec.pan <= 1);
  assert.ok(Number.isInteger(spec.sprite) && spec.sprite >= 1 && spec.sprite <= 3);
  assert.equal(spec.created, true);
});
