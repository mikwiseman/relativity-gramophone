import { MAX_WORLDS, PHYSICS_MODEL } from "./physicsEngine.js";
import { assertResonanceSeals } from "./gameProgress.js";
import { defaultVoiceForBody, isCosmicVoice, SONIFICATION_MODEL } from "./sonification.js";

const FORMAT = "tau-record/6";
const FIFTH_FORMAT = "tau-record/5";
const FOURTH_FORMAT = "tau-record/4";
const THIRD_FORMAT = "tau-record/3";
const PREVIOUS_FORMAT = "tau-record/2";
const LEGACY_FORMAT = "tau-record/1";
export const MAX_SCORE_EVENTS = 1024;
const VALID_THEMES = new Set(["lacquer", "white", "sumi"]);
const VALID_BODY_IDS = new Set(["io", "europa", "callisto"]);
const NOVA_ID_PATTERN = /^nova-\d{1,2}$/u;
const MOON_ID_PATTERN = /^moon-[a-z0-9-]{1,32}-[12]$/u;

const DEFAULT_BODIES = [
  {
    id: "io",
    sprite: 1,
    semiMajor: 0.27,
    eccentricity: 0.13,
    phase: 3.9,
    period: 10.8,
    inclination: -0.03,
    mass: 0.72,
    frequency: 293.66,
    pan: -0.55,
    voice: "earth",
  },
  {
    id: "europa",
    sprite: 2,
    semiMajor: 0.3538000882,
    eccentricity: 0.08,
    phase: 0.24,
    period: 16.2,
    inclination: 0.025,
    mass: 0.56,
    frequency: 440,
    pan: 0.5,
    voice: "moon",
  },
  {
    id: "callisto",
    sprite: 3,
    semiMajor: 0.4636092682,
    eccentricity: 0.17,
    phase: 1.56,
    period: 24.3,
    inclination: -0.018,
    mass: 0.92,
    frequency: 196,
    pan: 0.12,
    voice: "light",
  },
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function toBase64Url(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function fromBase64Url(value) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function isFiniteNumber(value, minimum = -Infinity, maximum = Infinity) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function assertCreatedSpec(body, { withState }) {
  const isMoon = body?.kind === "moon";
  const validId = isMoon ? MOON_ID_PATTERN.test(body?.id ?? "") : NOVA_ID_PATTERN.test(body?.id ?? "");
  if (typeof body?.id !== "string" || !validId) throw new Error(`Invalid score body: ${body?.id ?? "missing"}`);
  if (body.created !== true) throw new Error(`Invalid created flag for ${body.id}`);
  if (isMoon && (typeof body.parentId !== "string" || !body.parentId)) throw new Error(`Invalid moon parent for ${body.id}`);
  if (!isMoon && body.kind !== undefined && body.kind !== "planet") throw new Error(`Invalid score body kind for ${body.id}`);
  if (!Number.isInteger(body.sprite) || body.sprite < 1 || body.sprite > 3) throw new Error(`Invalid sprite for ${body.id}`);
  if (!isCosmicVoice(body.voice)) throw new Error(`Invalid cosmic voice for ${body.id}`);
  if (!isFiniteNumber(body.mass, 0.01, 10)) throw new Error(`Invalid mass for ${body.id}`);
  if (!isFiniteNumber(body.frequency, 40, 1_800)) throw new Error(`Invalid frequency for ${body.id}`);
  if (!isFiniteNumber(body.pan, -1, 1)) throw new Error(`Invalid pan for ${body.id}`);
  for (const key of ["x", "y", "vx", "vy"]) {
    if (withState && !isFiniteNumber(body[key], -10, 10)) throw new Error(`Invalid ${key} for ${body.id}`);
    if (!withState && body[key] !== undefined) throw new Error(`Unexpected ${key} for ${body.id}`);
  }
}

function assertBodies(bodies) {
  if (!Array.isArray(bodies) || bodies.length < 3 || bodies.length > MAX_WORLDS) throw new Error("Invalid score bodies");
  const seen = new Set();
  for (const body of bodies) {
    if (seen.has(body?.id)) throw new Error(`Invalid score body: ${body?.id ?? "missing"}`);
    if (VALID_BODY_IDS.has(body?.id)) {
      if (!Number.isInteger(body.sprite) || body.sprite < 1 || body.sprite > 3) throw new Error(`Invalid sprite for ${body.id}`);
      for (const key of ["semiMajor", "eccentricity", "phase", "period", "inclination", "mass", "frequency", "pan"]) {
        if (!isFiniteNumber(body[key], -10_000, 10_000)) throw new Error(`Invalid ${key} for ${body.id}`);
      }
      if (!isCosmicVoice(body.voice)) throw new Error(`Invalid cosmic voice for ${body.id}`);
    } else {
      assertCreatedSpec(body, { withState: false });
    }
    seen.add(body.id);
  }
  for (const id of VALID_BODY_IDS) {
    if (!seen.has(id)) throw new Error(`Missing core body: ${id}`);
  }
}

function assertPhysicalState(initialState, bodies) {
  if (initialState === null) return;
  if (initialState?.model !== PHYSICS_MODEL || initialState.time !== 0 || !Array.isArray(initialState.bodies)) {
    throw new Error("Invalid initial physical state");
  }
  if (initialState.bodies.length !== bodies.length + 1) throw new Error("Invalid initial physical bodies");
  const ids = new Set(initialState.bodies.map((body) => body?.id));
  if (!ids.has("star") || bodies.some((body) => !ids.has(body.id))) throw new Error("Invalid initial physical bodies");
  for (const body of initialState.bodies) {
    for (const key of ["mass", "x", "y", "vx", "vy", "properTime", "properRate", "potential", "doppler"]) {
      if (!isFiniteNumber(body[key], -10_000, 10_000)) throw new Error(`Invalid initial ${key} for ${body.id}`);
    }
    if (body.kind === "planet" && !isCosmicVoice(body.voice)) throw new Error(`Invalid initial cosmic voice for ${body.id}`);
    if (body.kind === "moon") {
      if (!isCosmicVoice(body.voice) || typeof body.parentId !== "string" || !ids.has(body.parentId)) {
        throw new Error(`Invalid initial moon for ${body.id}`);
      }
    }
  }
}

function assertEvent(event, previousTime, aliveIds, kindsById, parentById) {
  if (!event || !isFiniteNumber(event.at, 0, 3_600) || event.at < previousTime) throw new Error("Invalid score event");

  if (event.kind === "add-body") {
    assertCreatedSpec(event.body, { withState: true });
    if (aliveIds.has(event.body.id)) throw new Error(`Score birth for a world already alive: ${event.body.id}`);
    if (aliveIds.size >= MAX_WORLDS) throw new Error("Too many worlds in the score");
    if (event.body.kind === "moon") {
      if (!aliveIds.has(event.body.parentId) || kindsById.get(event.body.parentId) !== "planet") {
        throw new Error(`Score moon has no live planet parent: ${event.body.id}`);
      }
      parentById.set(event.body.id, event.body.parentId);
    }
    aliveIds.add(event.body.id);
    kindsById.set(event.body.id, event.body.kind === "moon" ? "moon" : "planet");
    return;
  }

  if (event.kind === "remove-body") {
    if (typeof event.bodyId !== "string" || (!NOVA_ID_PATTERN.test(event.bodyId) && !MOON_ID_PATTERN.test(event.bodyId))) {
      throw new Error("Invalid score event");
    }
    if (!aliveIds.has(event.bodyId)) throw new Error(`Score event touches a world that is not alive: ${event.bodyId}`);
    aliveIds.delete(event.bodyId);
    kindsById.delete(event.bodyId);
    parentById.delete(event.bodyId);
    for (const [childId, parentId] of parentById) {
      if (parentId !== event.bodyId) continue;
      aliveIds.delete(childId);
      kindsById.delete(childId);
      parentById.delete(childId);
    }
    return;
  }

  if (event.kind === "set-body-state") {
    if (!aliveIds.has(event.bodyId)) throw new Error(`Score event touches a world that is not alive: ${event.bodyId ?? "missing"}`);
    if (!event.state) throw new Error("Invalid physical event state");
    for (const key of ["x", "y", "vx", "vy"]) {
      if (!isFiniteNumber(event.state[key], -10, 10)) throw new Error(`Invalid event ${key}`);
    }
    return;
  }

  if (event.kind === "pluck") {
    if (!aliveIds.has(event.bodyId)) throw new Error(`Score event touches a world that is not alive: ${event.bodyId ?? "missing"}`);
    if (!isFiniteNumber(event.offset, 0, 1)) throw new Error("Invalid pluck offset");
    if (!isFiniteNumber(event.strength, 0, 1)) throw new Error("Invalid pluck strength");
    return;
  }

  if (event.kind === "legacy-orbit") {
    if (!VALID_BODY_IDS.has(event.bodyId)) throw new Error("Invalid score event");
    for (const key of ["semiMajor", "phase"]) {
      if (!isFiniteNumber(event[key], -10, 10)) throw new Error(`Invalid legacy event ${key}`);
    }
    if (event.period !== undefined && !isFiniteNumber(event.period, 0.01, 10_000)) throw new Error("Invalid legacy event period");
    return;
  }

  throw new Error(`Unsupported score event: ${event.kind ?? "missing"}`);
}

function assertComposition(value) {
  if (!value || value.format !== FORMAT) throw new Error(`Unsupported score format: ${value?.format ?? "missing"}`);
  if (value.physics !== PHYSICS_MODEL) throw new Error(`Unsupported physics model: ${value.physics ?? "missing"}`);
  if (value.sonification !== SONIFICATION_MODEL) throw new Error(`Unsupported sonification model: ${value.sonification ?? "missing"}`);
  if (!VALID_THEMES.has(value.preferredTheme)) throw new Error(`Unsupported theme: ${value.preferredTheme}`);
  if (!isFiniteNumber(value.duration, 1, 3_600)) throw new Error("Invalid score duration");
  if (typeof value.message !== "string" || value.message.length > 120) throw new Error("Invalid score message");
  if (typeof value.seed !== "string" || value.seed.length > 80) throw new Error("Invalid score seed");
  if (value.createdAt !== null && (typeof value.createdAt !== "string" || value.createdAt.length > 64)) throw new Error("Invalid score date");
  if (!Array.isArray(value.events)) throw new Error("Invalid score events");
  if (value.events.length > MAX_SCORE_EVENTS) throw new Error("Too many score events");
  assertResonanceSeals(value.resonances);
  assertBodies(value.bodies);
  assertPhysicalState(value.initialState, value.bodies);
  if (!value.lineage || !Number.isInteger(value.lineage.generation) || value.lineage.generation < 0 || value.lineage.generation > 32) {
    throw new Error("Invalid score lineage");
  }
  if (value.lineage.parent !== null && (typeof value.lineage.parent !== "string" || value.lineage.parent.length > 32)) {
    throw new Error("Invalid score parent");
  }
  const aliveIds = new Set(value.bodies.map((body) => body.id));
  const kindsById = new Map(value.bodies.map((body) => [body.id, body.kind === "moon" ? "moon" : "planet"]));
  const parentById = new Map(value.bodies
    .filter((body) => body.kind === "moon")
    .map((body) => [body.id, body.parentId]));
  let previousTime = -Infinity;
  for (const event of value.events) {
    assertEvent(event, previousTime, aliveIds, kindsById, parentById);
    previousTime = event.at;
  }
}

function addDefaultResonanceSeals(value) {
  const normalized = clone(value);
  if (normalized.resonances === undefined) normalized.resonances = [];
  return normalized;
}

function addDefaultVoices(value) {
  const migrated = clone(value);
  migrated.bodies = migrated.bodies.map((body) => ({ ...body, voice: defaultVoiceForBody(body.id) }));
  if (migrated.initialState?.bodies) {
    migrated.initialState.bodies = migrated.initialState.bodies.map((body) => (
      body.kind === "planet" ? { ...body, voice: defaultVoiceForBody(body.id) } : body
    ));
  }
  return migrated;
}

function migrateFourthComposition(value) {
  if (!Array.isArray(value?.bodies) || !Array.isArray(value?.events)) throw new Error("Invalid score payload");
  const migrated = { ...clone(value), format: FORMAT };
  assertComposition(migrated);
  return migrated;
}

function migrateFifthComposition(value) {
  if (!Array.isArray(value?.bodies) || !Array.isArray(value?.events)) throw new Error("Invalid score payload");
  const migrated = { ...clone(value), format: FORMAT };
  assertComposition(migrated);
  return migrated;
}

function migrateThirdComposition(value) {
  if (!Array.isArray(value?.bodies) || !Array.isArray(value?.events)) throw new Error("Invalid score payload");
  const migrated = {
    ...addDefaultResonanceSeals(clone(value)),
    format: FORMAT,
    sonification: SONIFICATION_MODEL,
  };
  assertComposition(migrated);
  return migrated;
}

function migratePreviousComposition(value) {
  if (!Array.isArray(value?.bodies) || !Array.isArray(value?.events)) throw new Error("Invalid score payload");
  const migrated = {
    ...addDefaultResonanceSeals(addDefaultVoices(value)),
    format: FORMAT,
    sonification: SONIFICATION_MODEL,
  };
  assertComposition(migrated);
  return migrated;
}

function migrateLegacyComposition(value) {
  if (!Array.isArray(value?.bodies) || !Array.isArray(value?.events)) throw new Error("Invalid score payload");
  const migrated = {
    ...addDefaultResonanceSeals(addDefaultVoices(value)),
    format: FORMAT,
    physics: PHYSICS_MODEL,
    sonification: SONIFICATION_MODEL,
    initialState: null,
    lineage: { parent: null, generation: 0 },
    events: value.events
      .map((event) => ({ ...clone(event), kind: "legacy-orbit" }))
      .sort((first, second) => first.at - second.at),
  };
  assertComposition(migrated);
  return migrated;
}

export function createDefaultComposition() {
  return {
    format: FORMAT,
    physics: PHYSICS_MODEL,
    sonification: SONIFICATION_MODEL,
    seed: "tau-1905",
    createdAt: null,
    duration: 64,
    preferredTheme: "lacquer",
    message: "",
    bodies: clone(DEFAULT_BODIES),
    initialState: null,
    lineage: { parent: null, generation: 0 },
    resonances: [],
    events: [],
  };
}

export function fingerprintComposition(composition) {
  const source = JSON.stringify(composition);
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

export function createReplyComposition(parent, frame, preferredTheme) {
  if (!frame?.star || !Array.isArray(frame.bodies) || frame.bodies.length < 3 || frame.bodies.length > MAX_WORLDS) {
    throw new Error("The received orbit has no physical state to reply from");
  }
  const coreBodies = parent.bodies.filter((body) => VALID_BODY_IDS.has(body.id));
  const novaBodies = frame.bodies
    .filter((body) => !VALID_BODY_IDS.has(body.id))
    .map((body) => ({
      id: body.id,
      ...(body.kind === "moon" ? { kind: "moon", parentId: body.parentId } : {}),
      created: true,
      sprite: body.sprite,
      voice: body.voice,
      mass: body.displayMass ?? body.mass,
      frequency: body.frequency,
      pan: body.pan,
    }));
  const next = {
    ...clone(parent),
    format: FORMAT,
    physics: PHYSICS_MODEL,
    sonification: SONIFICATION_MODEL,
    createdAt: null,
    preferredTheme,
    message: "",
    resonances: [],
    bodies: [...clone(coreBodies), ...novaBodies],
    initialState: {
      model: PHYSICS_MODEL,
      time: 0,
      bodies: [frame.star, ...frame.bodies].map((body) => ({ ...clone(body), properTime: 0 })),
    },
    lineage: {
      parent: fingerprintComposition(parent),
      generation: (parent.lineage?.generation ?? 0) + 1,
    },
    events: [],
  };
  assertComposition(next);
  return next;
}

export function encodeComposition(composition) {
  assertComposition(composition);
  return toBase64Url(JSON.stringify(composition));
}

export function decodeComposition(encoded) {
  let value;
  try {
    value = JSON.parse(fromBase64Url(encoded));
  } catch (error) {
    throw new Error("Invalid score payload", { cause: error });
  }
  if (value?.format === LEGACY_FORMAT) return migrateLegacyComposition(value);
  if (value?.format === PREVIOUS_FORMAT) return migratePreviousComposition(value);
  if (value?.format === THIRD_FORMAT) return migrateThirdComposition(value);
  if (value?.format === FOURTH_FORMAT) return migrateFourthComposition(value);
  if (value?.format === FIFTH_FORMAT) return migrateFifthComposition(value);
  const normalized = addDefaultResonanceSeals(value);
  assertComposition(normalized);
  return normalized;
}

export function getPresentationTheme(composition, localOverride) {
  if (localOverride !== null && localOverride !== undefined) {
    if (!VALID_THEMES.has(localOverride)) throw new Error(`Unsupported theme: ${localOverride}`);
    return localOverride;
  }
  return composition.preferredTheme;
}

export function readCompositionFromHash(hash = window.location.hash) {
  const params = new URLSearchParams(hash.replace(/^#/u, ""));
  const encoded = params.get("score");
  return encoded ? decodeComposition(encoded) : null;
}

export function createShareUrl(composition, location = window.location) {
  const url = new URL(location.href);
  url.hash = `score=${encodeComposition(composition)}`;
  return url.toString();
}

export function cloneBodies(bodies) {
  return clone(bodies);
}
