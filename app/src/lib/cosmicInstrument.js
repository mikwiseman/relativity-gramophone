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
    guidance: "TOUCH A STAR TO HEAR ITS SYSTEM",
    guidanceDetail: "THE GOLDEN LIGHT AT THE CENTRE IS OUR SUN",
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

// Positions are deliberately schematic. Distances and relationships are real,
// while each semantic scale is re-authored so a child can read it on one screen.
// Sources: NASA Exoplanet Archive pscomppars (2026-07-25), NASA Hubble, ESA Gaia.
const COSMIC_LANDMARKS = Object.freeze({
  neighborhood: Object.freeze([
    Object.freeze({
      id: "solar-system",
      scale: "neighborhood",
      name: "THE SUN",
      detail: "OUR OWN STAR · 8 PLANETS",
      voice: "earth",
      frequency: 261.63,
      color: 0xfff4ea,
      position: Object.freeze([0, 4.4, 0.4]),
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
    }),
    Object.freeze({
      id: "proxima-centauri",
      scale: "neighborhood",
      name: "PROXIMA CENTAURI",
      detail: "4.25 LIGHT-YEARS · 2 WORLDS",
      voice: "alpha-centauri",
      frequency: 220,
      color: 0xff8f74,
      position: Object.freeze([-2.25, -2.2, 0.6]),
      lesson: "THE NEAREST STAR TO THE SUN, AND FAR TOO FAINT TO SEE",
      system: Object.freeze({
        kind: "planetary",
        worlds: 2,
        label: "2 CONFIRMED WORLDS · 5.1-11.2 DAY YEARS",
        star: Object.freeze({
          name: "PROXIMA CENTAURI",
          spectralType: "M5.5Ve",
          temperature: 2992,
          radiusSolar: 0.141,
          luminositySuns: 0.001567,
        }),
        // Neither world transits, so their radii are estimated from minimum
        // mass, not measured. Periods and separations are the solid numbers.
        bodies: Object.freeze([
          Object.freeze({ id: "proxima-d", name: "PROXIMA d", kind: "planet", periodDays: 5.12338, orbitAu: 0.02881, radiusEarth: 0.692, eccentricity: 0.04 }),
          Object.freeze({ id: "proxima-b", name: "PROXIMA b", kind: "planet", periodDays: 11.18465, orbitAu: 0.04848, radiusEarth: 1.02, eccentricity: 0.02 }),
        ]),
      }),
    }),
    Object.freeze({
      id: "sirius",
      scale: "neighborhood",
      name: "SIRIUS",
      detail: "8.6 LIGHT-YEARS · A BINARY",
      voice: "light",
      frequency: 293.66,
      color: 0xbcecff,
      position: Object.freeze([0, -4.4, -0.5]),
      lesson: "THE BRIGHTEST STAR IN OUR SKY, CIRCLED BY A DEAD ONE",
      system: Object.freeze({
        kind: "binary",
        worlds: 1,
        label: "SIRIUS A + B · 50 YEAR ORBIT · 19.8 AU",
        star: Object.freeze({
          name: "SIRIUS A",
          spectralType: "A1V",
          temperature: 9940,
          radiusSolar: 1.711,
          luminositySuns: 25.4,
        }),
        bodies: Object.freeze([
          Object.freeze({ id: "sirius-b", name: "SIRIUS B", kind: "star", periodDays: 18_309, orbitAu: 19.8, radiusEarth: 0.92, eccentricity: 0.5923, color: 0xdfe9ff }),
        ]),
      }),
    }),
    Object.freeze({
      id: "trappist-1",
      scale: "neighborhood",
      name: "TRAPPIST-1",
      detail: "40.5 LIGHT-YEARS · 7 WORLDS",
      voice: "theremin",
      frequency: 174.61,
      color: 0xd98bff,
      position: Object.freeze([2.25, 2.2, -0.6]),
      lesson: "SEVEN ROCKY WORLDS LOCKED INTO ONE RHYTHM",
      system: Object.freeze({
        kind: "planetary",
        worlds: 7,
        label: "7 ROCKY WORLDS · 1.5-18.8 DAY YEARS",
        resonance: "8:5 · 5:3 · 3:2 · 3:2 · 4:3 · 3:2 — EVERY NEIGHBOURING PAIR",
        star: Object.freeze({
          name: "TRAPPIST-1",
          spectralType: "M8V",
          temperature: 2566,
          radiusSolar: 0.1192,
          luminositySuns: 0.000553,
        }),
        bodies: Object.freeze([
          Object.freeze({ id: "trappist-1-b", name: "TRAPPIST-1 b", kind: "planet", periodDays: 1.510826, orbitAu: 0.01154, radiusEarth: 1.116, eccentricity: 0.0062 }),
          Object.freeze({ id: "trappist-1-c", name: "TRAPPIST-1 c", kind: "planet", periodDays: 2.421937, orbitAu: 0.0158, radiusEarth: 1.097, eccentricity: 0.0065 }),
          Object.freeze({ id: "trappist-1-d", name: "TRAPPIST-1 d", kind: "planet", periodDays: 4.049219, orbitAu: 0.02227, radiusEarth: 0.788, eccentricity: 0.0084 }),
          Object.freeze({ id: "trappist-1-e", name: "TRAPPIST-1 e", kind: "planet", periodDays: 6.101013, orbitAu: 0.02925, radiusEarth: 0.92, eccentricity: 0.0051 }),
          Object.freeze({ id: "trappist-1-f", name: "TRAPPIST-1 f", kind: "planet", periodDays: 9.20754, orbitAu: 0.03849, radiusEarth: 1.045, eccentricity: 0.0101 }),
          Object.freeze({ id: "trappist-1-g", name: "TRAPPIST-1 g", kind: "planet", periodDays: 12.352446, orbitAu: 0.04683, radiusEarth: 1.129, eccentricity: 0.0021 }),
          Object.freeze({ id: "trappist-1-h", name: "TRAPPIST-1 h", kind: "planet", periodDays: 18.772866, orbitAu: 0.06189, radiusEarth: 0.755, eccentricity: 0.0057 }),
        ]),
      }),
    }),
    Object.freeze({
      id: "toi-700",
      scale: "neighborhood",
      name: "TOI-700",
      detail: "101.5 LIGHT-YEARS · 4 WORLDS",
      voice: "ondes",
      frequency: 196,
      color: 0xffb072,
      position: Object.freeze([2.25, -2.2, 0.8]),
      lesson: "TWO OF ITS WORLDS SIT WHERE LIQUID WATER COULD SURVIVE",
      system: Object.freeze({
        kind: "planetary",
        worlds: 4,
        label: "4 WORLDS · TOI-700 d AND e IN THE HABITABLE ZONE",
        star: Object.freeze({
          name: "TOI-700",
          spectralType: "M2.5V",
          temperature: 3459,
          radiusSolar: 0.421,
          luminositySuns: 0.0229,
        }),
        bodies: Object.freeze([
          Object.freeze({ id: "toi-700-b", name: "TOI-700 b", kind: "planet", periodDays: 9.97722, orbitAu: 0.0677, radiusEarth: 0.914, eccentricity: 0.075 }),
          Object.freeze({ id: "toi-700-c", name: "TOI-700 c", kind: "planet", periodDays: 16.05114, orbitAu: 0.0929, radiusEarth: 2.6, eccentricity: 0.068 }),
          Object.freeze({ id: "toi-700-e", name: "TOI-700 e", kind: "planet", periodDays: 27.80978, orbitAu: 0.134, radiusEarth: 0.953, eccentricity: 0.059 }),
          Object.freeze({ id: "toi-700-d", name: "TOI-700 d", kind: "planet", periodDays: 37.42396, orbitAu: 0.1633, radiusEarth: 1.073, eccentricity: 0.042 }),
        ]),
      }),
    }),
    Object.freeze({
      id: "kepler-90",
      scale: "neighborhood",
      name: "KEPLER-90",
      detail: "2,767 LIGHT-YEARS · 8 WORLDS",
      voice: "trautonium",
      frequency: 146.83,
      color: 0xffe6a8,
      position: Object.freeze([-2.25, 2.2, -0.8]),
      lesson: "AS MANY PLANETS AS THE SUN HAS — ONE WAS FOUND BY A MACHINE",
      system: Object.freeze({
        kind: "planetary",
        worlds: 8,
        label: "8 WORLDS · SMALL ONES INSIDE, GIANTS OUTSIDE",
        star: Object.freeze({
          name: "KEPLER-90",
          spectralType: "G2 / F9 IV-V",
          temperature: 6015,
          radiusSolar: 1.2,
          luminositySuns: 1.69,
        }),
        bodies: Object.freeze([
          Object.freeze({ id: "kepler-90-b", name: "KEPLER-90 b", kind: "planet", periodDays: 7.00815, orbitAu: 0.074, radiusEarth: 1.31, eccentricity: 0 }),
          Object.freeze({ id: "kepler-90-c", name: "KEPLER-90 c", kind: "planet", periodDays: 8.71938, orbitAu: 0.089, radiusEarth: 1.19, eccentricity: 0 }),
          Object.freeze({ id: "kepler-90-i", name: "KEPLER-90 i", kind: "planet", periodDays: 14.44912, orbitAu: 0.1201, radiusEarth: 1.32, eccentricity: 0 }),
          Object.freeze({ id: "kepler-90-d", name: "KEPLER-90 d", kind: "planet", periodDays: 59.73667, orbitAu: 0.32, radiusEarth: 2.87, eccentricity: 0 }),
          Object.freeze({ id: "kepler-90-e", name: "KEPLER-90 e", kind: "planet", periodDays: 91.93913, orbitAu: 0.42, radiusEarth: 2.66, eccentricity: 0 }),
          Object.freeze({ id: "kepler-90-f", name: "KEPLER-90 f", kind: "planet", periodDays: 124.9144, orbitAu: 0.48, radiusEarth: 2.88, eccentricity: 0.01 }),
          Object.freeze({ id: "kepler-90-g", name: "KEPLER-90 g", kind: "planet", periodDays: 210.73514, orbitAu: 0.717, radiusEarth: 7.718, eccentricity: 0.049 }),
          Object.freeze({ id: "kepler-90-h", name: "KEPLER-90 h", kind: "planet", periodDays: 331.60296, orbitAu: 0.9706, radiusEarth: 11.252, eccentricity: 0.011 }),
        ]),
      }),
    }),
  ]),
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
  ]),
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
      lesson: "GRAVITY SPUN EVERY GALAXY INTO THREADS AROUND EMPTY BUBBLES",
      galaxy: Object.freeze({
        form: "cluster",
        memberCount: 22,
        coreColor: 0xe8e4d8,
        coreStrength: 0.18,
      }),
    }),
  ]),
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
