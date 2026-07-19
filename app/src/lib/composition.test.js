import test from "node:test";
import assert from "node:assert/strict";

import {
  createReplyComposition,
  createDefaultComposition,
  decodeComposition,
  encodeComposition,
  fingerprintComposition,
  getPresentationTheme,
} from "./composition.js";
import { createInitialPhysicsState, PHYSICS_MODEL } from "./physicsEngine.js";

test("a composition survives a URL-safe round trip including unicode", () => {
  const composition = createDefaultComposition();
  composition.message = "До встречи среди звёзд";
  composition.resonances = ["3:2", "2:1"];
  composition.events.push({
    kind: "set-body-state",
    at: 1.25,
    bodyId: "io",
    state: { x: 0.12, y: -0.22, vx: 0.14, vy: 0.06 },
  });

  const decoded = decodeComposition(encodeComposition(composition));

  assert.deepEqual(decoded, composition);
});

test("an existing tau-record/3 link without resonance seals stays playable", () => {
  const existing = createDefaultComposition();
  delete existing.resonances;
  const encoded = Buffer.from(JSON.stringify(existing), "utf8").toString("base64url");

  const decoded = decodeComposition(encoded);

  assert.deepEqual(decoded.resonances, []);
});

test("a recipient theme override never mutates the recorded preferred theme", () => {
  const composition = createDefaultComposition();
  composition.preferredTheme = "lacquer";

  assert.equal(getPresentationTheme(composition, "sumi"), "sumi");
  assert.equal(composition.preferredTheme, "lacquer");
});

test("invalid score formats surface an error", () => {
  const composition = createDefaultComposition();
  composition.format = "unknown/99";

  assert.throws(() => encodeComposition(composition), /Unsupported score format/);
});

test("a tau-record/2 link gains deterministic cosmic voice imprints", () => {
  const previous = createDefaultComposition();
  previous.format = "tau-record/2";
  delete previous.sonification;
  for (const body of previous.bodies) delete body.voice;
  const encoded = Buffer.from(JSON.stringify(previous), "utf8").toString("base64url");

  const migrated = decodeComposition(encoded);

  assert.equal(migrated.format, "tau-record/3");
  assert.equal(migrated.sonification, "cosmic-voices/1");
  assert.deepEqual(migrated.bodies.map((body) => body.voice), ["earth", "moon", "light"]);
  assert.deepEqual(migrated.resonances, []);
});

test("a tau-record/1 link migrates into the deterministic N-body format", () => {
  const legacy = createDefaultComposition();
  legacy.format = "tau-record/1";
  legacy.physics = "kepler-proper-time/1";
  delete legacy.initialState;
  delete legacy.lineage;
  legacy.events = [{ at: 2.2, bodyId: "europa", semiMajor: 0.4, eccentricity: 0.1, phase: 1.4 }];
  const encoded = Buffer.from(JSON.stringify(legacy), "utf8").toString("base64url");

  const migrated = decodeComposition(encoded);

  assert.equal(migrated.format, "tau-record/3");
  assert.equal(migrated.physics, PHYSICS_MODEL);
  assert.equal(migrated.sonification, "cosmic-voices/1");
  assert.deepEqual(migrated.bodies.map((body) => body.voice), ["earth", "moon", "light"]);
  assert.deepEqual(migrated.resonances, []);
  assert.equal(migrated.events[0].kind, "legacy-orbit");
  assert.equal(migrated.events[0].semiMajor, 0.4);
});

test("reply orbit starts from the received physical state and preserves compact lineage", () => {
  const parent = createDefaultComposition();
  parent.message = "Listen from the other side";
  const state = createInitialPhysicsState(parent.bodies);
  const star = state.bodies.find((body) => body.kind === "star");
  const bodies = state.bodies.filter((body) => body.kind === "planet");
  bodies[0].x += 0.031;

  const reply = createReplyComposition(parent, { time: 8.4, star, bodies }, "sumi");

  assert.equal(reply.preferredTheme, "sumi");
  assert.equal(reply.events.length, 0);
  assert.equal(reply.message, "");
  assert.deepEqual(reply.resonances, []);
  assert.equal(reply.initialState.bodies.find((body) => body.id === "io").x, bodies[0].x);
  assert.equal(reply.initialState.bodies.find((body) => body.id === "io").properTime, 0);
  assert.deepEqual(reply.lineage, { parent: fingerprintComposition(parent), generation: 1 });
  assert.ok(encodeComposition(reply).length < 12_000);
});

test("unknown or duplicate resonance seals are rejected", () => {
  const composition = createDefaultComposition();
  composition.resonances = ["3:2", "3:2"];
  assert.throws(() => encodeComposition(composition), /resonance seals/i);

  composition.resonances = ["4:1"];
  assert.throws(() => encodeComposition(composition), /resonance seals/i);
});

test("malformed or oversized physical event payloads are rejected", () => {
  const composition = createDefaultComposition();
  composition.events = Array.from({ length: 1025 }, (_, index) => ({
    kind: "set-body-state",
    at: index / 60,
    bodyId: "io",
    state: { x: 0.2, y: 0, vx: 0, vy: 0.18 },
  }));

  assert.throws(() => encodeComposition(composition), /Too many score events/);
});
