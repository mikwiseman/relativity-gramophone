import { blackbodyColor } from "./cosmicAtlas.js";
import { STAR_SYSTEMS_BY_ID } from "./starSystems.js";
import { STAR_CLUSTERS_BY_ID } from "./starClusters.js";
import { GALAXIES_BY_ID } from "./galaxyRotation.js";
import { GALAXY_CLUSTERS_BY_ID } from "./galaxyClusters.js";

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothstep(minimum, maximum, value) {
  if (minimum === maximum) return value < minimum ? 0 : 1;
  const normalized = clamp((value - minimum) / (maximum - minimum), 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
}

const SCALE_COPY = Object.freeze({
  orbit: Object.freeze({
    label: "INNER ORBIT",
    detail: "Each body is a voice",
    measure: "INSIDE 1 AU",
  }),
  system: Object.freeze({
    label: "STAR SYSTEM",
    detail: "The system becomes a chord",
    measure: "1 AU TO 50 AU",
  }),
  neighborhood: Object.freeze({
    label: "NEARBY STARS",
    detail: "Our nearest stellar neighbors become an ensemble",
    measure: "WITHIN 50 LIGHT-YEARS",
  }),
  galaxy: Object.freeze({
    label: "MILKY WAY",
    detail: "Our Sun rests in the Orion Spur",
    measure: "ABOUT 100,000 LIGHT-YEARS",
  }),
  localGroup: Object.freeze({
    label: "LOCAL GROUP",
    detail: "Our galaxy joins its closest family",
    measure: "ABOUT 10 MILLION LIGHT-YEARS",
  }),
  universe: Object.freeze({
    label: "DEEP UNIVERSE",
    detail: "Galaxies breathe as one choir",
    measure: "THE COSMIC WEB",
  }),
});

/**
 * Where a scale's named landmarks actually land on the screen in front of you.
 *
 * Each arrangement is authored once, in unit slots: at the nearby stars our own
 * Sun sits above, Sirius below, two systems out to each side. What cannot be
 * authored once is how far apart they sit, because a 16:10 laptop and a
 * portrait phone see completely different frames from the same camera. So the
 * slots are stretched onto the frame the camera really has, and the real
 * objects fill the sky on both instead of huddling into a knot in the middle
 * of one.
 *
 * The camera looks nearly straight down +z at every scale that uses this, so a
 * slot's `u` is world x and its `v` is world y; z is only the small authored
 * depth that keeps the field from reading as flat card art.
 */
export function landmarkPlacement({ slot, aspect, fovDegrees, distance, fill = 0.62 }) {
  if (!Array.isArray(slot) || slot.length !== 2 || !slot.every(Number.isFinite)) {
    throw new Error("A landmark slot needs a finite [u, v] pair");
  }
  if (![aspect, fovDegrees, distance, fill].every(Number.isFinite)
    || aspect <= 0 || fovDegrees <= 0 || distance <= 0) {
    throw new Error("A landmark placement needs a real camera");
  }
  const halfHeight = Math.tan((fovDegrees * Math.PI) / 360) * distance;
  const halfWidth = halfHeight * aspect;
  // A portrait phone spends a third of its height on the title and the
  // instruction above the sky, so the field has to start lower there or the
  // first object sits inside the words. Names hang below their own object, so
  // the sky always keeps more room underneath than above.
  const portrait = aspect < 0.9;
  return {
    x: slot[0] * halfWidth * fill,
    y: slot[1] * halfHeight * fill * (portrait ? 0.78 : 0.82)
      - halfHeight * (portrait ? 0.14 : 0.075),
  };
}

export const COSMIC_DESTINATIONS = Object.freeze({
  system: Object.freeze({
    id: "system",
    ...SCALE_COPY.system,
    distance: 12,
    action: "RETURN TO MY STAR",
    guidance: "DRAG FROM THE STAR TO MAKE A PLANET",
    guidanceDetail: "HOLD THE STAR · PULL OUTWARD · RELEASE",
  }),
  neighborhood: Object.freeze({
    id: "neighborhood",
    ...SCALE_COPY.neighborhood,
    distance: 27,
    action: "FLY TO NEARBY STARS",
    guidance: "TOUCH A STAR TO PLAY ITS WORLDS",
    guidanceDetail: "SIX REAL SYSTEMS · YOURS IS IN THE MIDDLE",
  }),
  galaxy: Object.freeze({
    id: "galaxy",
    ...SCALE_COPY.galaxy,
    distance: 50,
    action: "SEE THE MILKY WAY",
    guidance: "PLAY THE MILKY WAY",
    guidanceDetail: "TOUCH A LUMINOUS REGION · OUR SUN STAYS MARKED",
  }),
  localGroup: Object.freeze({
    id: "localGroup",
    ...SCALE_COPY.localGroup,
    distance: 63,
    action: "MEET THE LOCAL GROUP",
    guidance: "PLAY OUR GALACTIC FAMILY",
    guidanceDetail: "TOUCH A GALAXY · EACH ONE HAS A DIFFERENT VOICE",
  }),
  universe: Object.freeze({
    id: "universe",
    ...SCALE_COPY.universe,
    distance: 72,
    action: "HEAR THE DEEP UNIVERSE",
    guidance: "PLAY THE CHOIR OF GALAXIES",
    guidanceDetail: "TOUCH A CLUSTER · LISTEN TO THE COSMIC WEB",
  }),
});

const COSMIC_JOURNEYS = Object.freeze({
  orbit: Object.freeze({ outward: "neighborhood", home: null }),
  system: Object.freeze({ outward: "neighborhood", home: null }),
  neighborhood: Object.freeze({ outward: "galaxy", home: "system" }),
  galaxy: Object.freeze({ outward: "localGroup", home: "system" }),
  localGroup: Object.freeze({ outward: "universe", home: "system" }),
  universe: Object.freeze({ outward: null, home: "system" }),
});

/**
 * The nearby sky, in four shells of increasing distance.
 *
 * A single sky can hold six or seven named systems before it stops being
 * readable, and the catalogue holds far more than that. Rather than a map or a
 * free camera — both of which this instrument refuses — the shells are strung
 * on the same one-button ladder as everything else: FLY steps one shell further
 * from home, and every step is literally "further away". A child can read the
 * whole sequence as one straight line outward from their own star.
 *
 * Membership is by measured distance alone. Slots are the authored arrangement
 * on screen, stretched onto the real frame by `landmarkPlacement`.
 */
export const NEIGHBOURHOOD_SHELLS = Object.freeze([
  Object.freeze({
    id: "nearby",
    label: "NEARBY STARS",
    measure: "WITHIN 25 LIGHT-YEARS",
    guidance: "TOUCH A STAR TO PLAY ITS WORLDS",
    guidanceDetail: "OUR CLOSEST SUNS · YOUR OWN STAR IS IN THE MIDDLE",
    members: Object.freeze([
      Object.freeze(["solar-system", [0, 1]]),
      Object.freeze(["teegardens-star", [0.83, 0.6]]),
      Object.freeze(["gj-1002", [1, -0.22]]),
      Object.freeze(["gj-667-c", [0.5, -0.95]]),
      Object.freeze(["hd-219134", [-0.5, -0.95]]),
      Object.freeze(["gj-876", [-1, -0.22]]),
      Object.freeze(["proxima-centauri", [-0.83, 0.6]]),
    ]),
  }),
  Object.freeze({
    id: "local-suns",
    label: "THE LOCAL SUNS",
    measure: "25 TO 110 LIGHT-YEARS",
    guidance: "TOUCH A STAR TO PLAY ITS WORLDS",
    guidanceDetail: "EIGHT REAL SYSTEMS A LITTLE FURTHER OUT",
    members: Object.freeze([
      Object.freeze(["trappist-1", [0, 1]]),
      Object.freeze(["55-cnc", [0.78, 0.66]]),
      Object.freeze(["gj-3293", [1, -0.05]]),
      Object.freeze(["lp-890-9", [0.72, -0.82]]),
      Object.freeze(["hd-110067", [0, -1.02]]),
      Object.freeze(["toi-700", [-0.72, -0.82]]),
      Object.freeze(["ups-and", [-1, -0.05]]),
      Object.freeze(["l-98-59", [-0.78, 0.66]]),
    ]),
  }),
  Object.freeze({
    id: "orion-spur",
    label: "THE ORION SPUR",
    measure: "110 TO 400 LIGHT-YEARS",
    guidance: "TOUCH A STAR TO PLAY ITS WORLDS",
    guidanceDetail: "OUR OWN ARM OF THE MILKY WAY",
    members: Object.freeze([
      Object.freeze(["hr-8799", [0, 1]]),
      Object.freeze(["hyades", [0.83, 0.6]]),
      Object.freeze(["hd-191939", [1, -0.22]]),
      Object.freeze(["toi-1136", [0.5, -0.95]]),
      Object.freeze(["v1298-tau", [-0.5, -0.95]]),
      Object.freeze(["toi-178", [-1, -0.22]]),
      Object.freeze(["hd-10180", [-0.83, 0.6]]),
    ]),
  }),
  Object.freeze({
    id: "kepler-field",
    label: "THE KEPLER FIELD",
    measure: "400 TO 3,000 LIGHT-YEARS",
    guidance: "TOUCH A STAR TO PLAY ITS WORLDS",
    guidanceDetail: "THE CROWDED SUNS ONE TELESCOPE STARED AT FOR FOUR YEARS",
    members: Object.freeze([
      Object.freeze(["pleiades", [0, 1]]),
      Object.freeze(["k2-138", [0.78, 0.66]]),
      Object.freeze(["kepler-20", [1, -0.05]]),
      Object.freeze(["kepler-80", [0.72, -0.82]]),
      Object.freeze(["kepler-90", [0, -1.02]]),
      Object.freeze(["kepler-11", [-0.72, -0.82]]),
      Object.freeze(["kepler-62", [-1, -0.05]]),
      Object.freeze(["kepler-186", [-0.78, 0.66]]),
    ]),
  }),
  // The fifth sky, and the first that is not made of planets. A globular
  // cluster is a system in exactly the sense this instrument means — a central
  // mass with things going round it at measured radii — so travelling into one
  // needs no new gesture and no new screen. What it changes is the scale of
  // time: a planet's year is days, and a star's orbit around the centre of one
  // of these is millions of years. The law does the rest without being told,
  // and a globular cluster becomes the deepest voice the instrument has.
  Object.freeze({
    id: "globular-clusters",
    label: "THE OLD CLUSTERS",
    measure: "6,000 TO 34,000 LIGHT-YEARS",
    guidance: "TOUCH A CLUSTER TO PLAY ITS STARS",
    guidanceDetail: "BALLS OF ANCIENT STARS ORBITING OUR GALAXY",
    members: Object.freeze([
      Object.freeze(["messier-4", [0, 1]]),
      Object.freeze(["messier-22", [0.83, 0.6]]),
      Object.freeze(["47-tucanae", [1, -0.22]]),
      Object.freeze(["omega-centauri", [0.5, -0.95]]),
      Object.freeze(["messier-13", [-0.5, -0.95]]),
      Object.freeze(["messier-5", [-1, -0.22]]),
      Object.freeze(["messier-15", [-0.83, 0.6]]),
    ]),
  }),
]);

export const NEIGHBOURHOOD_SHELL_IDS = Object.freeze(
  NEIGHBOURHOOD_SHELLS.map((shell) => shell.id),
);

export function neighbourhoodShell(index) {
  const shell = NEIGHBOURHOOD_SHELLS[index];
  if (!shell) throw new Error(`Unknown neighbourhood shell: ${index}`);
  return shell;
}

const SOLAR_SYSTEM_LANDMARK = Object.freeze({

      id: "solar-system",
      scale: "neighborhood",
      name: "THE SUN",
      detail: "OUR OWN STAR · 8 PLANETS",
      voice: "earth",
      frequency: 261.63,
      color: 0xfff4ea,
      position: Object.freeze([0, 4.4, 0.4]),
      slot: Object.freeze([0, 1]),
      lesson: "EVERY YEAR YOU HAVE EVER HAD IS ONE LAP OF THE THIRD ORBIT",
      system: Object.freeze({
        kind: "planetary",
        worlds: 8,
        label: "8 PLANETS · 88 DAY TO 165 YEAR ORBITS",
        star: Object.freeze({
          name: "SUN",
          spectralType: "G2V",
          temperature: 5772,
          radiusSolar: 1,
          luminositySuns: 1,
        }),
        bodies: Object.freeze([
          Object.freeze({ id: "mercury", name: "MERCURY", kind: "planet", periodDays: 87.969, orbitAu: 0.38709927, radiusEarth: 0.3826, eccentricity: 0.20563593, color: 0xdcc7ae }),
          Object.freeze({ id: "venus", name: "VENUS", kind: "planet", periodDays: 224.701, orbitAu: 0.72333566, radiusEarth: 0.9488, eccentricity: 0.00677672, color: 0xdcd9d2 }),
          Object.freeze({ id: "earth", name: "EARTH", kind: "planet", periodDays: 365.256, orbitAu: 1, radiusEarth: 1, eccentricity: 0.01671123, color: 0xc6ccdc }),
          Object.freeze({ id: "mars", name: "MARS", kind: "planet", periodDays: 686.98, orbitAu: 1.52371034, radiusEarth: 0.5325, eccentricity: 0.0933941, color: 0xdcae80 }),
          Object.freeze({ id: "jupiter", name: "JUPITER", kind: "planet", periodDays: 4332.82, orbitAu: 5.202887, radiusEarth: 11.2089, eccentricity: 0.04838624, color: 0xdadccb }),
          Object.freeze({ id: "saturn", name: "SATURN", kind: "planet", periodDays: 10_755.699, orbitAu: 9.53667594, radiusEarth: 9.4492, eccentricity: 0.05386179, color: 0xdcccac, rings: true }),
          Object.freeze({ id: "uranus", name: "URANUS", kind: "planet", periodDays: 30_687.153, orbitAu: 19.18916464, radiusEarth: 4.0073, eccentricity: 0.04725744, color: 0x9acfdc }),
          // Neptune's true colour was corrected in 2024: a pale greenish blue,
          // barely deeper than Uranus. The famous deep blue was contrast-stretched.
          Object.freeze({ id: "neptune", name: "NEPTUNE", kind: "planet", periodDays: 60_190.03, orbitAu: 30.06992276, radiusEarth: 3.8826, eccentricity: 0.00859048, color: 0x90c6dc }),
        ]),
      }),
    });

/** One system or cluster of the catalogue, as a landmark of its shell. */
function catalogueLandmark(system, shellIndex, slot, order) {
  // A cluster is a system in every sense this instrument means — a central
  // mass with things going round it at measured radii — so it becomes a
  // landmark by exactly the same route, and every gesture already written
  // works inside one. Only the line under its name differs: a cluster is
  // counted in stars, not in worlds.
  const isCluster = system.kind === "open" || system.kind === "globular";
  return Object.freeze({
    id: system.id,
    scale: "neighborhood",
    shell: shellIndex,
    name: system.name,
    detail: `${system.distanceLy < 100
      ? system.distanceLy.toFixed(1)
      : Math.round(system.distanceLy).toLocaleString("en-US")} LIGHT-YEARS · ${isCluster
      ? system.members
      : `${system.bodies.length} WORLDS`}`,
    voice: system.voice,
    // The landmark's own note is the deepest voice of its own system, so a
    // light in the sky already sounds like the chord behind it.
    frequency: orbitalSonificationFrequency(
      Math.max(...system.bodies.map((body) => body.periodDays)),
    ),
    color: blackbodyColor(system.star.temperature),
    position: Object.freeze([slot[0] * 2.4, slot[1] * 2.4, ((order % 3) - 1) * 0.7]),
    slot: Object.freeze([...slot]),
    lesson: system.lesson,
    system: Object.freeze({
      kind: isCluster ? system.kind : "planetary",
      worlds: system.bodies.length,
      label: system.label,
      star: system.star,
      bodies: system.bodies,
    }),
  });
}

const NEIGHBOURHOOD_LANDMARKS = Object.freeze(
  NEIGHBOURHOOD_SHELLS.flatMap((shell, shellIndex) => shell.members.map(([id, slot], order) => {
    if (id === "solar-system") {
      return Object.freeze({ ...SOLAR_SYSTEM_LANDMARK, shell: shellIndex, slot: Object.freeze([...slot]) });
    }
    const system = STAR_SYSTEMS_BY_ID.get(id) ?? STAR_CLUSTERS_BY_ID.get(id);
    if (!system) throw new Error(`Unknown catalogue system in a shell: ${id}`);
    return catalogueLandmark(system, shellIndex, slot, order);
  })),
);

// Positions are deliberately schematic. Distances and relationships are real,
// while each semantic scale is re-authored so a child can read it on one screen.
// Sources: NASA Exoplanet Archive pscomppars (2026-07-25), NASA Hubble, ESA Gaia.
/**
 * A Local Group galaxy, made enterable.
 *
 * You cannot enter Andromeda the way you enter TRAPPIST-1 — nobody has
 * catalogued a planet there — but you do not have to. A galaxy is a thing that
 * turns, and how fast it turns at each radius has been measured for a century.
 * That is a year, and a year is a pitch. So each of these four lights carries
 * the same `system` field a star does, built from its measured rotation curve,
 * and every gesture already written works inside one.
 */
function withRotation(landmark) {
  const galaxy = GALAXIES_BY_ID.get(landmark.id);
  if (!galaxy) return landmark;
  return Object.freeze({
    ...landmark,
    system: Object.freeze({
      kind: "galaxy",
      worlds: galaxy.bodies.length,
      label: galaxy.label,
      star: galaxy.star,
      bodies: galaxy.bodies,
    }),
  });
}

/**
 * A galaxy cluster, made enterable — and named for what actually happens in it.
 *
 * A cluster is bound but it does not turn: its galaxies are on long plunging
 * orbits in every direction, and what has been measured is the spread of their
 * speeds. So the duration here is the crossing time rather than a year, the
 * surface says so, and the cosmic web — which is not bound at all — stays a
 * light you can touch and nothing more.
 */
function withCrossing(landmark) {
  const cluster = GALAXY_CLUSTERS_BY_ID.get(landmark.id);
  if (!cluster) return landmark;
  return Object.freeze({
    ...landmark,
    system: Object.freeze({
      kind: "galaxy-cluster",
      worlds: cluster.bodies.length,
      label: cluster.label,
      star: cluster.star,
      bodies: cluster.bodies,
    }),
  });
}

const COSMIC_LANDMARKS = Object.freeze({
  neighborhood: NEIGHBOURHOOD_LANDMARKS,
  galaxy: Object.freeze([
    Object.freeze({
      id: "orion-spur",
      scale: "galaxy",
      name: "ORION SPUR",
      detail: "OUR SUN · YOU ARE HERE",
      voice: "earth",
      frequency: 246.94,
      color: 0x72edff,
      position: Object.freeze([0.7, 0.35, 0.2]),
    }),
    Object.freeze({
      id: "galactic-centre",
      scale: "galaxy",
      name: "GALACTIC CENTRE",
      detail: "26,600 LIGHT-YEARS FROM US",
      voice: "trautonium",
      frequency: 55,
      color: 0xffb45f,
      position: Object.freeze([-5.2, 0, 0]),
    }),
    Object.freeze({
      id: "perseus-arm",
      scale: "galaxy",
      name: "PERSEUS ARM",
      detail: "A MAJOR SPIRAL ARM",
      voice: "ondes",
      frequency: 196,
      color: 0x9ee8ff,
      position: Object.freeze([-8.4, 0.25, -4.1]),
    }),
  ]),
  localGroup: Object.freeze([
    Object.freeze({
      id: "milky-way",
      scale: "localGroup",
      name: "MILKY WAY",
      detail: "OUR GALAXY · YOU ARE HERE",
      voice: "earth",
      frequency: 98,
      color: 0x72edff,
      position: Object.freeze([-5.2, 0.2, 0]),
      slot: Object.freeze([-0.25, -0.55]),
      discRadius: 1.97,
      usesLivingGalaxy: true,
      lesson: "WE LIVE INSIDE IT, SO NOBODY CAN PHOTOGRAPH IT FROM OUTSIDE",
    }),
    Object.freeze({
      id: "andromeda",
      scale: "localGroup",
      name: "ANDROMEDA · M31",
      detail: "2.5 MILLION LIGHT-YEARS · SA(s)b",
      voice: "ondes",
      frequency: 130.81,
      color: 0x8edfff,
      position: Object.freeze([-9.2, 2.2, -7.4]),
      slot: Object.freeze([-0.95, 0.6]),
      discRadius: 2.6,
      lesson: "IN YOUR SKY IT IS SIX TIMES WIDER THAN THE FULL MOON",
      // A large unbarred Sb spiral, seen at an inclination near 77 degrees.
      galaxy: Object.freeze({
        form: "spiral",
        armCount: 2,
        pitchAngle: 8,
        bulgeFraction: 0.3,
        bulgeRadius: 0.27,
        scaleLength: 0.22,
        diskThickness: 0.024,
        hiiRate: 0.025,
        haloFraction: 0.04,
        tilt: 77,
        roll: 24,
        coreColor: 0xf7e1b5,
        coreStrength: 0.4,
      }),
    }),
    Object.freeze({
      id: "triangulum",
      scale: "localGroup",
      name: "TRIANGULUM · M33",
      detail: "2.7 MILLION LIGHT-YEARS · SA(s)cd",
      voice: "light",
      frequency: 164.81,
      color: 0xf0c97d,
      position: Object.freeze([8.2, -2, -6.2]),
      slot: Object.freeze([0.88, 0.42]),
      discRadius: 1.65,
      lesson: "THE FARTHEST THING A HUMAN EYE CAN SEE WITHOUT A TELESCOPE",
      // Scd: almost no bulge, loosely wound, and famously full of star birth.
      galaxy: Object.freeze({
        form: "spiral",
        armCount: 2,
        pitchAngle: 21,
        bulgeFraction: 0.05,
        bulgeRadius: 0.1,
        scaleLength: 0.3,
        diskThickness: 0.03,
        hiiRate: 0.11,
        haloFraction: 0.03,
        tilt: 54,
        roll: -35,
        coreColor: 0xe8e4d8,
        coreStrength: 0.22,
      }),
    }),
    Object.freeze({
      id: "magellanic-clouds",
      scale: "localGroup",
      name: "MAGELLANIC CLOUDS",
      detail: "162,000 & 204,000 LIGHT-YEARS · SB(s)m",
      voice: "theremin",
      frequency: 207.65,
      color: 0xd9a2ff,
      position: Object.freeze([4.8, -4.2, 3.6]),
      slot: Object.freeze([0.5, -0.9]),
      discRadius: 1.2,
      lesson: "A BOUND PAIR FALLING TOGETHER, TRAILING A RIBBON OF GAS",
      galaxy: Object.freeze({
        form: "irregular",
        clumpCount: 3,
        armCount: 1,
        pitchAngle: 20,
        bulgeFraction: 0,
        bulgeRadius: 0.12,
        scaleLength: 0.3,
        diskThickness: 0.06,
        haloFraction: 0.02,
        tilt: 38,
        roll: 12,
        coreColor: 0xb8ccff,
        coreStrength: 0.24,
      }),
    }),
  ].map(withRotation)),
  universe: Object.freeze([
    Object.freeze({
      id: "virgo-cluster",
      scale: "universe",
      name: "VIRGO CLUSTER",
      detail: "54 MILLION LIGHT-YEARS · 1,300+ GALAXIES",
      voice: "earth",
      frequency: 82.41,
      color: 0xffc978,
      position: Object.freeze([-11.5, 4.2, -11.8]),
      slot: Object.freeze([-0.94, 0.55]),
      lesson: "NOBODY HAS FINISHED COUNTING ITS GALAXIES",
      galaxy: Object.freeze({
        form: "cluster",
        memberCount: 30,
        coreColor: 0xf5e3c0,
        coreStrength: 0.3,
      }),
    }),
    Object.freeze({
      id: "fornax-cluster",
      scale: "universe",
      name: "FORNAX CLUSTER",
      detail: "ABOUT 62 MILLION LIGHT-YEARS",
      voice: "alpha-centauri",
      frequency: 110,
      color: 0x8ce7ff,
      position: Object.freeze([11.8, -4.7, -10.2]),
      slot: Object.freeze([0.94, -0.34]),
      lesson: "A SMALL, TIDY CLUSTER — EASY TO STUDY WHOLE",
      galaxy: Object.freeze({
        form: "cluster",
        memberCount: 18,
        coreColor: 0xe8e4d8,
        coreStrength: 0.24,
      }),
    }),
    Object.freeze({
      id: "coma-cluster",
      scale: "universe",
      name: "COMA CLUSTER",
      detail: "ABOUT 320 MILLION LIGHT-YEARS",
      voice: "trautonium",
      frequency: 65.41,
      color: 0xd28cff,
      position: Object.freeze([2.6, 6.8, -16.4]),
      slot: Object.freeze([0.2, 0.86]),
      lesson: "HERE ZWICKY FIRST NOTICED DARK MATTER, IN 1933",
      galaxy: Object.freeze({
        form: "cluster",
        memberCount: 36,
        coreColor: 0xf5e3c0,
        coreStrength: 0.32,
      }),
    }),
    Object.freeze({
      id: "cosmic-web",
      scale: "universe",
      name: "COSMIC WEB",
      detail: "FILAMENTS, WALLS AND VOIDS",
      voice: "ondes",
      frequency: 146.83,
      color: 0xf4d79a,
      position: Object.freeze([-2.8, -6.2, -14.8]),
      slot: Object.freeze([-0.4, -0.78]),
      lesson: "GRAVITY SPUN EVERY GALAXY INTO THREADS AROUND EMPTY BUBBLES",
      galaxy: Object.freeze({
        form: "cluster",
        memberCount: 22,
        coreColor: 0xe8e4d8,
        coreStrength: 0.18,
      }),
    }),
  ].map(withCrossing)),

});

export function cosmicDestination(id) {
  const destination = COSMIC_DESTINATIONS[id];
  if (!destination) throw new Error(`Unknown cosmic destination: ${id}`);
  return destination;
}

export function cosmicJourneyForScale(scaleId) {
  const journey = COSMIC_JOURNEYS[scaleId];
  if (!journey) throw new Error(`Unknown cosmic scale: ${scaleId}`);
  return {
    outward: journey.outward ? cosmicDestination(journey.outward) : null,
    home: journey.home ? cosmicDestination(journey.home) : null,
  };
}

export function cosmicLandmarksForScale(scaleId) {
  const landmarks = COSMIC_LANDMARKS[scaleId];
  if (!landmarks) throw new Error(`${scaleId} does not have cosmic landmarks`);
  return landmarks;
}

export function cosmicLandmarkById(landmarkId) {
  for (const landmarks of Object.values(COSMIC_LANDMARKS)) {
    const landmark = landmarks.find((candidate) => candidate.id === landmarkId);
    if (landmark) return landmark;
  }
  throw new Error(`Unknown cosmic landmark: ${landmarkId}`);
}

export function orbitalSonificationFrequency(periodDays) {
  if (!Number.isFinite(periodDays) || periodDays <= 0) {
    throw new Error("Orbital sonification requires a positive period in days");
  }
  const rawFrequency = 1 / (periodDays * 86_400);
  const octaveShift = Math.ceil(Math.log2(110 / rawFrequency));
  const frequency = rawFrequency * (2 ** octaveShift);
  return frequency >= 440 ? frequency / 2 : frequency;
}

export function cosmicScaleForDistance(distance) {
  if (!Number.isFinite(distance) || distance <= 0) {
    throw new Error("Cosmic scale requires a positive camera distance");
  }

  const id = distance < 6.2
    ? "orbit"
    : distance < 21
      ? "system"
      : distance < 38
        ? "neighborhood"
        : distance < 59
        ? "galaxy"
          : distance < 69
            ? "localGroup"
            : "universe";
  const neighborhoodArrival = smoothstep(14, 27, distance);
  const galaxyArrival = smoothstep(30, 50, distance);
  const localGroupArrival = smoothstep(52, 63, distance);
  const universeArrival = smoothstep(65, 72, distance);

  return {
    id,
    ...SCALE_COPY[id],
    systemMix: clamp(1 - smoothstep(16, 29, distance) * 0.88, 0.12, 1),
    neighborhoodMix: clamp(
      neighborhoodArrival * (1 - smoothstep(29, 42, distance) * 0.92),
      0,
      1,
    ),
    galaxyMix: clamp(
      galaxyArrival * (1 - localGroupArrival * 0.75),
      0,
      1,
    ),
    localGroupMix: clamp(
      localGroupArrival * (1 - universeArrival * 0.6),
      0,
      1,
    ),
    universeMix: universeArrival,
  };
}

export function cosmicScaleForView(distance, authoredScaleId = null) {
  const measuredScale = cosmicScaleForDistance(distance);
  if (authoredScaleId === null) return measuredScale;
  const destination = COSMIC_DESTINATIONS[authoredScaleId];
  if (!destination) {
    throw new Error(`Unknown authored cosmic destination: ${authoredScaleId}`);
  }
  return authoredScaleId === "system"
    ? cosmicScaleForDistance(destination.distance)
    : measuredScale;
}

export function thereminParameters({ x, y, width, height }) {
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new Error("Theremin mapping requires finite pointer and viewport geometry");
  }
  const horizontal = clamp(x / width, 0, 1);
  const vertical = 1 - clamp(y / height, 0, 1);
  return {
    frequency: 110 * (2 ** (horizontal * 3)),
    gain: 0.004 + vertical * 0.058,
    pan: horizontal * 2 - 1,
    cutoff: 700 + vertical * vertical * 6500,
    vibratoDepth: 7 + (1 - Math.abs(horizontal - 0.5) * 2) * 11,
  };
}

export function cathedralIntensity(resonance, bodyCount) {
  if (!resonance
    || !Array.isArray(resonance.bodyIds)
    || resonance.bodyIds.length !== 2
    || !Number.isFinite(resonance.strength)
    || !Number.isInteger(bodyCount)
    || bodyCount < 2
    || resonance.strength < 0.82) {
    return 0;
  }
  const harmonicLock = smoothstep(0.82, 0.97, resonance.strength);
  const ensemble = clamp((bodyCount - 1) / 3, 0.42, 1);
  return clamp(harmonicLock * ensemble, 0, 1);
}

/**
 * The cathedral answers a resonance being *won*, not a resonance being true.
 *
 * The instrument opens on periods of 10.8, 16.2 and 24.3 days — ratios of
 * exactly 1.5 and 1.5 — so `findClosestResonance` returns a strength of 1.0
 * from the first frame of the first session and never lets go. Seven arches
 * therefore vaulted over the composition permanently, and because the same
 * level dims the starfield, a reward designed to be rare was holding the whole
 * sky about 28 per cent dark. A durable decision already says this plainly:
 * abundance must stay causal, and neither effect may run as ambient
 * decoration.
 *
 * So the level is an envelope. It fires only on the crossing — the moment a
 * lock is acquired — and then falls away over a few seconds. A system that was
 * already locked when the player arrived earned nothing and lights nothing.
 */
export const CATHEDRAL_LOCK_STRENGTH = 0.82;

export function nextCathedralLevel({
  level = 0,
  strength = null,
  previousStrength = null,
  bodyCount,
  delta,
  decaySeconds = 4,
}) {
  if (!Number.isFinite(level) || level < 0) throw new Error("A cathedral level must be a positive number");
  if (!Number.isFinite(delta) || delta < 0) throw new Error("A cathedral envelope needs an elapsed time");
  if (!Number.isFinite(decaySeconds) || decaySeconds <= 0) throw new Error("A cathedral decay must be positive");
  // A first look is not an acquisition: with no previous strength to compare
  // against there was no moment, and seeding from the current value is what
  // stops an already-locked opening from lighting itself on load.
  const acquired = Number.isFinite(previousStrength)
    && Number.isFinite(strength)
    && previousStrength < CATHEDRAL_LOCK_STRENGTH
    && strength >= CATHEDRAL_LOCK_STRENGTH;
  const decayed = level * Math.exp((-delta * Math.log(100)) / decaySeconds);
  if (!acquired) return decayed < 0.004 ? 0 : decayed;
  const struck = cathedralIntensity({ bodyIds: ["a", "b"], strength }, bodyCount);
  return Math.max(decayed, struck);
}

export function memoryCometEnvelope(progress) {
  if (!Number.isFinite(progress)) throw new Error("Memory comet progress must be finite");
  if (progress < 0 || progress > 1) {
    return {
      visible: false,
      opacity: 0,
      orbitMix: 0,
      galaxyMix: 0,
    };
  }
  return {
    visible: true,
    opacity: smoothstep(0, 0.18, progress) * (1 - smoothstep(0.7, 1, progress)),
    orbitMix: 1 - smoothstep(0.24, 0.7, progress),
    galaxyMix: smoothstep(0.34, 0.92, progress),
  };
}
