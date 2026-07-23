import test from "node:test";
import assert from "node:assert/strict";

import { HARPS, HARP_ORDER, createHarpComposition, semiMajorForPeriod } from "./starHarps.js";
import { createDefaultComposition, encodeComposition, decodeComposition } from "./composition.js";
import { PhysicsEngine, createInitialPhysicsState, GRAVITATIONAL_CONSTANT } from "./physicsEngine.js";
import { keplerPitch } from "./sonification.js";

const TAU = Math.PI * 2;

function engineForHarp(harpId) {
  const composition = createHarpComposition(harpId);
  const initialState = composition.initialState ?? createInitialPhysicsState(composition.bodies);
  return new PhysicsEngine(initialState);
}

test("Kepler consistency: a semi-major axis derived from a period orbits at that period", () => {
  const period = 13.62;
  const semiMajor = semiMajorForPeriod(period);
  const derived = TAU * Math.sqrt((semiMajor ** 3) / (GRAVITATIONAL_CONSTANT * 1));

  assert.ok(Math.abs(derived - period) / period < 1e-9);
});

test("every harp is a valid, shareable score in the current format", () => {
  for (const harpId of HARP_ORDER) {
    const composition = createHarpComposition(harpId);
    const decoded = decodeComposition(encodeComposition(composition));
    assert.equal(decoded.format, "tau-record/6", harpId);
    assert.deepEqual(decoded, composition, harpId);
  }
});

test("the quinta harp is the original default dance", () => {
  assert.deepEqual(createHarpComposition("quinta"), createDefaultComposition());
});

test("every harp string actually orbits at its authored period", () => {
  for (const harpId of HARP_ORDER) {
    const engine = engineForHarp(harpId);
    const authored = new Map(
      HARPS[harpId].strings.map((string) => [string.id, string.period]),
    );
    for (const body of engine.state.bodies) {
      if (body.kind !== "planet") continue;
      const expected = authored.get(body.id);
      const error = Math.abs(body.period - expected) / expected;
      assert.ok(error < 0.03, `${harpId}/${body.id}: authored ${expected}, live ${body.period.toFixed(3)}`);
    }
  }
});

test("penta carries five strings, two of them authored novas that the engine marks as created", () => {
  const composition = createHarpComposition("penta");
  const engine = engineForHarp("penta");
  const novas = composition.bodies.filter((body) => body.created === true);

  assert.equal(composition.bodies.length, 5);
  assert.equal(novas.length, 2);
  assert.equal(engine.state.bodies.filter((body) => body.kind === "planet").length, 5);
  for (const nova of novas) {
    assert.equal(engine.getBody(nova.id)?.created, true);
  }
});

test("each harp sings a distinct pitch ladder ordered by orbit size", () => {
  for (const harpId of HARP_ORDER) {
    const strings = HARPS[harpId].strings;
    const pitches = strings.map((string) => keplerPitch(string.period));
    for (let index = 1; index < pitches.length; index += 1) {
      assert.ok(pitches[index] < pitches[index - 1], `${harpId} ladder must descend outward`);
    }
  }
  assert.ok(Math.abs(keplerPitch(HARPS.octava.strings[0].period) / keplerPitch(HARPS.octava.strings[1].period) - 2) < 1e-9);
});

test("every harp stays on stage: aphelion never leaves the visible field", () => {
  for (const harpId of HARP_ORDER) {
    for (const string of HARPS[harpId].strings) {
      const aphelion = semiMajorForPeriod(string.period) * (1 + string.eccentricity);
      assert.ok(aphelion <= 0.58, `${harpId}/${string.id} aphelion ${aphelion.toFixed(3)}`);
    }
  }
});
