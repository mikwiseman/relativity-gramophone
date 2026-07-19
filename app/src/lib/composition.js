import { PHYSICS_MODEL } from "./physicsEngine.js";

const FORMAT = "tau-record/2";
const LEGACY_FORMAT = "tau-record/1";
export const MAX_SCORE_EVENTS = 1024;
const VALID_THEMES = new Set(["lacquer", "white", "sumi"]);
const VALID_BODY_IDS = new Set(["io", "europa", "callisto"]);

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

function assertBodies(bodies) {
  if (!Array.isArray(bodies) || bodies.length !== 3) throw new Error("Invalid score bodies");
  const seen = new Set();
  for (const body of bodies) {
    if (!VALID_BODY_IDS.has(body?.id) || seen.has(body.id)) throw new Error(`Invalid score body: ${body?.id ?? "missing"}`);
    seen.add(body.id);
    if (!Number.isInteger(body.sprite) || body.sprite < 1 || body.sprite > 3) throw new Error(`Invalid sprite for ${body.id}`);
    for (const key of ["semiMajor", "eccentricity", "phase", "period", "inclination", "mass", "frequency", "pan"]) {
      if (!isFiniteNumber(body[key], -10_000, 10_000)) throw new Error(`Invalid ${key} for ${body.id}`);
    }
  }
}

function assertPhysicalState(initialState) {
  if (initialState === null) return;
  if (initialState?.model !== PHYSICS_MODEL || initialState.time !== 0 || !Array.isArray(initialState.bodies)) {
    throw new Error("Invalid initial physical state");
  }
  if (initialState.bodies.length !== 4) throw new Error("Invalid initial physical bodies");
  const ids = new Set(initialState.bodies.map((body) => body?.id));
  if (!ids.has("star") || [...VALID_BODY_IDS].some((id) => !ids.has(id))) throw new Error("Invalid initial physical bodies");
  for (const body of initialState.bodies) {
    for (const key of ["mass", "x", "y", "vx", "vy", "properTime", "properRate", "potential", "doppler"]) {
      if (!isFiniteNumber(body[key], -10_000, 10_000)) throw new Error(`Invalid initial ${key} for ${body.id}`);
    }
  }
}

function assertEvent(event, previousTime) {
  if (!event || !isFiniteNumber(event.at, 0, 3_600) || event.at < previousTime || !VALID_BODY_IDS.has(event.bodyId)) {
    throw new Error("Invalid score event");
  }
  if (event.kind === "set-body-state") {
    if (!event.state) throw new Error("Invalid physical event state");
    for (const key of ["x", "y", "vx", "vy"]) {
      if (!isFiniteNumber(event.state[key], -10, 10)) throw new Error(`Invalid event ${key}`);
    }
    return;
  }
  if (event.kind === "legacy-orbit") {
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
  if (!VALID_THEMES.has(value.preferredTheme)) throw new Error(`Unsupported theme: ${value.preferredTheme}`);
  if (!isFiniteNumber(value.duration, 1, 3_600)) throw new Error("Invalid score duration");
  if (typeof value.message !== "string" || value.message.length > 120) throw new Error("Invalid score message");
  if (typeof value.seed !== "string" || value.seed.length > 80) throw new Error("Invalid score seed");
  if (value.createdAt !== null && (typeof value.createdAt !== "string" || value.createdAt.length > 64)) throw new Error("Invalid score date");
  if (!Array.isArray(value.events)) throw new Error("Invalid score events");
  if (value.events.length > MAX_SCORE_EVENTS) throw new Error("Too many score events");
  assertBodies(value.bodies);
  assertPhysicalState(value.initialState);
  if (!value.lineage || !Number.isInteger(value.lineage.generation) || value.lineage.generation < 0 || value.lineage.generation > 32) {
    throw new Error("Invalid score lineage");
  }
  if (value.lineage.parent !== null && (typeof value.lineage.parent !== "string" || value.lineage.parent.length > 32)) {
    throw new Error("Invalid score parent");
  }
  let previousTime = -Infinity;
  for (const event of value.events) {
    assertEvent(event, previousTime);
    previousTime = event.at;
  }
}

function migrateLegacyComposition(value) {
  if (!Array.isArray(value?.bodies) || !Array.isArray(value?.events)) throw new Error("Invalid score payload");
  const migrated = {
    ...clone(value),
    format: FORMAT,
    physics: PHYSICS_MODEL,
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
    seed: "tau-1905",
    createdAt: null,
    duration: 64,
    preferredTheme: "lacquer",
    message: "",
    bodies: clone(DEFAULT_BODIES),
    initialState: null,
    lineage: { parent: null, generation: 0 },
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
  if (!frame?.star || !Array.isArray(frame.bodies) || frame.bodies.length !== 3) {
    throw new Error("The received orbit has no physical state to reply from");
  }
  const next = {
    ...clone(parent),
    format: FORMAT,
    physics: PHYSICS_MODEL,
    createdAt: null,
    preferredTheme,
    message: "",
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
  assertComposition(value);
  return value;
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
