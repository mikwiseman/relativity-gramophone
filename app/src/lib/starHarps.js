import { GRAVITATIONAL_CONSTANT, PHYSICS_MODEL, createInitialPhysicsState } from "./physicsEngine.js";
import { SONIFICATION_MODEL, keplerPitch } from "./sonification.js";
import { createDefaultComposition } from "./composition.js";

const TAU = Math.PI * 2;

export function semiMajorForPeriod(period) {
  return Math.cbrt((GRAVITATIONAL_CONSTANT * period * period) / (TAU * TAU));
}

const CORE_IDS = ["io", "europa", "callisto"];

export const HARPS = Object.freeze({
  quinta: Object.freeze({
    id: "quinta",
    name: "QUINTA",
    motto: "THREE STRINGS IN FIFTHS · THE FIRST DANCE",
    strings: [
      { id: "io", period: 10.8, eccentricity: 0.13 },
      { id: "europa", period: 16.2, eccentricity: 0.08 },
      { id: "callisto", period: 24.3, eccentricity: 0.17 },
    ],
  }),
  octava: Object.freeze({
    id: "octava",
    name: "OCTAVA",
    motto: "OCTAVE LADDER · ONE NOTE, THREE HEIGHTS",
    strings: [
      { id: "io", sprite: 1, period: 6.8, eccentricity: 0.04, phase: 0.6, inclination: -0.02, mass: 0.66, voice: "light", pan: -0.4 },
      { id: "europa", sprite: 2, period: 13.6, eccentricity: 0.05, phase: 2.7, inclination: 0.02, mass: 0.74, voice: "earth", pan: 0.35 },
      { id: "callisto", sprite: 3, period: 27.2, eccentricity: 0.06, phase: 4.9, inclination: -0.015, mass: 0.9, voice: "alpha-centauri", pan: 0.05 },
    ],
  }),
  penta: Object.freeze({
    id: "penta",
    name: "PENTA",
    motto: "FIVE STRINGS · FIFTHS OVER FOURTHS",
    strings: [
      { id: "io", sprite: 1, period: 6.81, eccentricity: 0.05, phase: 0.2, inclination: -0.02, mass: 0.52, voice: "earth", pan: -0.5 },
      { id: "europa", sprite: 2, period: 10.215, eccentricity: 0.07, phase: 1.5, inclination: 0.02, mass: 0.6, voice: "moon", pan: 0.42 },
      { id: "callisto", sprite: 3, period: 13.62, eccentricity: 0.06, phase: 2.8, inclination: -0.015, mass: 0.68, voice: "light", pan: -0.1 },
      { id: "nova-1", sprite: 1, period: 20.43, eccentricity: 0.09, phase: 4.1, inclination: 0.018, mass: 0.78, voice: "alpha-centauri", pan: 0.28, created: true },
      { id: "nova-2", sprite: 2, period: 27.24, eccentricity: 0.08, phase: 5.4, inclination: -0.022, mass: 0.9, voice: "earth", pan: -0.3, created: true },
    ],
  }),
  cometa: Object.freeze({
    id: "cometa",
    name: "COMETA",
    motto: "ECCENTRIC STRINGS · BREATHING DOPPLER",
    strings: [
      { id: "io", sprite: 1, period: 8, eccentricity: 0.5, phase: 0.9, inclination: -0.025, mass: 0.58, voice: "light", pan: -0.45 },
      { id: "europa", sprite: 2, period: 12, eccentricity: 0.45, phase: 3, inclination: 0.02, mass: 0.72, voice: "earth", pan: 0.4 },
      { id: "callisto", sprite: 3, period: 18, eccentricity: 0.4, phase: 5.1, inclination: -0.018, mass: 0.88, voice: "moon", pan: 0.1 },
    ],
  }),
});

export const HARP_ORDER = ["quinta", "octava", "penta", "cometa"];

function fullStringSpec(string) {
  return {
    id: string.id,
    sprite: string.sprite,
    semiMajor: semiMajorForPeriod(string.period),
    eccentricity: string.eccentricity,
    phase: string.phase,
    period: string.period,
    inclination: string.inclination,
    mass: string.mass,
    frequency: keplerPitch(string.period),
    pan: string.pan,
    voice: string.voice,
    ...(string.created ? { created: true } : {}),
  };
}

function rosterSpec(string) {
  const full = fullStringSpec(string);
  if (!full.created) return full;
  return {
    id: full.id,
    created: true,
    sprite: full.sprite,
    voice: full.voice,
    mass: full.mass,
    frequency: full.frequency,
    pan: full.pan,
  };
}

export function createHarpComposition(harpId) {
  const harp = HARPS[harpId];
  if (!harp) throw new Error(`Unknown star harp: ${harpId}`);
  if (harpId === "quinta") return createDefaultComposition();

  const fullSpecs = harp.strings.map(fullStringSpec);
  const initialState = createInitialPhysicsState(fullSpecs);

  return {
    format: "tau-record/6",
    physics: PHYSICS_MODEL,
    sonification: SONIFICATION_MODEL,
    seed: `harp-${harp.id}`,
    createdAt: null,
    duration: 64,
    preferredTheme: "lacquer",
    message: "",
    bodies: harp.strings.map(rosterSpec),
    initialState,
    lineage: { parent: null, generation: 0 },
    resonances: [],
    events: [],
  };
}

export function harpForComposition(composition) {
  if (typeof composition?.seed !== "string") return null;
  const harpId = composition.seed === "tau-1905" ? "quinta" : composition.seed.startsWith("harp-") ? composition.seed.slice("harp-".length) : null;
  if (!harpId || !HARPS[harpId]) return null;
  return CORE_IDS.every((id) => composition.bodies.some((body) => body.id === id)) ? harpId : null;
}
