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
import { PhysicsEngine, createInitialPhysicsState, PHYSICS_MODEL } from "./physicsEngine.js";
import { birthBodyFromGesture } from "./starBirth.js";

function novaBirthEvent(at, overrides = {}) {
  const body = birthBodyFromGesture({
    press: { x: 0.33, y: -0.14 },
    aim: { x: 0.06, y: 0.11 },
    holdSeconds: 0.8,
    star: { id: "star", kind: "star", mass: 1, x: 0, y: 0, vx: 0, vy: 0 },
    existingIds: ["io", "europa", "callisto"],
    birthIndex: 0,
    ...overrides,
  });
  return { kind: "add-body", at, body };
}

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

test("the default score speaks the harp-capable format and Kepler sonification", () => {
  const composition = createDefaultComposition();

  assert.equal(composition.format, "tau-record/5");
  assert.equal(composition.sonification, "cosmic-voices/2");
});

test("plucked strings are recorded, replayed, and validated against the living roster", () => {
  const composition = createDefaultComposition();
  const birth = novaBirthEvent(1);
  composition.events.push(
    { kind: "pluck", at: 0.5, bodyId: "io", offset: 0.25, strength: 0.8 },
    birth,
    { kind: "pluck", at: 2, bodyId: birth.body.id, offset: 0.9, strength: 0.4 },
  );

  const decoded = decodeComposition(encodeComposition(composition));
  assert.deepEqual(decoded, composition);

  const orphanPluck = createDefaultComposition();
  orphanPluck.events.push({ kind: "pluck", at: 1, bodyId: "nova-4", offset: 0.5, strength: 1 });
  assert.throws(() => encodeComposition(orphanPluck), /not alive/i);

  const badOffset = createDefaultComposition();
  badOffset.events.push({ kind: "pluck", at: 1, bodyId: "io", offset: 1.4, strength: 1 });
  assert.throws(() => encodeComposition(badOffset), /Invalid pluck/i);
});

test("an existing tau-record/4 link migrates into the harp format unchanged", () => {
  const previous = createDefaultComposition();
  previous.format = "tau-record/4";
  previous.events.push(novaBirthEvent(2.5));
  const encoded = Buffer.from(JSON.stringify(previous), "utf8").toString("base64url");

  const migrated = decodeComposition(encoded);

  assert.equal(migrated.format, "tau-record/5");
  assert.equal(migrated.sonification, "cosmic-voices/2");
  assert.equal(migrated.events.length, 1);
  assert.equal(migrated.events[0].kind, "add-body");
});

test("an existing tau-record/3 link migrates and keeps its voices and seals", () => {
  const existing = createDefaultComposition();
  existing.format = "tau-record/3";
  existing.sonification = "cosmic-voices/1";
  existing.resonances = ["3:2"];
  const encoded = Buffer.from(JSON.stringify(existing), "utf8").toString("base64url");

  const decoded = decodeComposition(encoded);

  assert.equal(decoded.format, "tau-record/5");
  assert.equal(decoded.sonification, "cosmic-voices/2");
  assert.deepEqual(decoded.resonances, ["3:2"]);
  assert.deepEqual(decoded.bodies.map((body) => body.voice), ["earth", "moon", "light"]);
});

test("birth, orbit change, and consumption of a nova survive the URL round trip", () => {
  const composition = createDefaultComposition();
  const birth = novaBirthEvent(2.5);
  composition.events.push(
    birth,
    { kind: "set-body-state", at: 4.75, bodyId: birth.body.id, state: { x: 0.22, y: -0.1, vx: 0.05, vy: 0.11 } },
    { kind: "remove-body", at: 9.25, bodyId: birth.body.id },
    novaBirthEvent(11.5, { birthIndex: 1 }),
  );

  const decoded = decodeComposition(encodeComposition(composition));

  assert.deepEqual(decoded, composition);
});

test("a recorded birth replays through the physics engine deterministically", () => {
  const composition = createDefaultComposition();
  const birth = novaBirthEvent(0);
  composition.events.push(birth);

  const engine = new PhysicsEngine(createInitialPhysicsState(composition.bodies));
  engine.applyEvent(decodeComposition(encodeComposition(composition)).events[0]);

  assert.ok(engine.getBody(birth.body.id));
});

test("events touching worlds that are not alive at that moment are rejected", () => {
  const orphanState = createDefaultComposition();
  orphanState.events.push({ kind: "set-body-state", at: 1, bodyId: "nova-1", state: { x: 0.2, y: 0, vx: 0, vy: 0.1 } });
  assert.throws(() => encodeComposition(orphanState), /not alive|Invalid score event/i);

  const orphanRemove = createDefaultComposition();
  orphanRemove.events.push({ kind: "remove-body", at: 1, bodyId: "nova-1" });
  assert.throws(() => encodeComposition(orphanRemove), /not alive|Invalid score event/i);

  const doubleBirth = createDefaultComposition();
  doubleBirth.events.push(novaBirthEvent(1), novaBirthEvent(2));
  assert.throws(() => encodeComposition(doubleBirth), /already alive|Invalid score event/i);

  const coreRemoval = createDefaultComposition();
  coreRemoval.events.push({ kind: "remove-body", at: 1, bodyId: "io" });
  assert.throws(() => encodeComposition(coreRemoval), /Invalid score event/i);
});

test("a reply carries created worlds forward as part of the roster", () => {
  const parent = createDefaultComposition();
  const engine = new PhysicsEngine(createInitialPhysicsState(parent.bodies));
  const birth = engine.addBody(novaBirthEvent(0).body);
  for (let index = 0; index < 240; index += 1) engine.step();
  const snapshot = engine.snapshot();
  const frame = {
    time: snapshot.time,
    star: snapshot.bodies.find((body) => body.kind === "star"),
    bodies: snapshot.bodies.filter((body) => body.kind === "planet"),
  };

  const reply = createReplyComposition(parent, frame, "white");
  const decoded = decodeComposition(encodeComposition(reply));

  assert.equal(decoded.bodies.length, 4);
  const novaRoster = decoded.bodies.find((body) => body.id === birth.body.id);
  assert.equal(novaRoster.created, true);
  assert.equal(novaRoster.voice, birth.body.voice);
  assert.ok(decoded.initialState.bodies.some((body) => body.id === birth.body.id));
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

  assert.equal(migrated.format, "tau-record/5");
  assert.equal(migrated.sonification, "cosmic-voices/2");
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

  assert.equal(migrated.format, "tau-record/5");
  assert.equal(migrated.physics, PHYSICS_MODEL);
  assert.equal(migrated.sonification, "cosmic-voices/2");
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
