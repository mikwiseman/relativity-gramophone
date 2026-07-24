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
// Sources: NASA Solar System Exploration, NASA Exoplanets, ESA Gaia.
const COSMIC_LANDMARKS = Object.freeze({
  neighborhood: Object.freeze([
    Object.freeze({
      id: "proxima-centauri",
      scale: "neighborhood",
      name: "PROXIMA CENTAURI",
      detail: "4.24 LIGHT-YEARS · PROXIMA b",
      voice: "alpha-centauri",
      frequency: 220,
      color: 0xff8f74,
      position: Object.freeze([-1, -0.5, -1.4]),
      system: Object.freeze({
        kind: "planetary",
        worlds: 1,
        label: "PROXIMA b · 11.2 DAY YEAR",
      }),
    }),
    Object.freeze({
      id: "sirius",
      scale: "neighborhood",
      name: "SIRIUS",
      detail: "8.6 LIGHT-YEARS · BINARY",
      voice: "light",
      frequency: 293.66,
      color: 0xbcecff,
      position: Object.freeze([-2.8, -1.5, 2.9]),
      system: Object.freeze({
        kind: "binary",
        worlds: 1,
        label: "SIRIUS A + B · 50 YEAR ORBIT",
      }),
    }),
    Object.freeze({
      id: "trappist-1",
      scale: "neighborhood",
      name: "TRAPPIST-1",
      detail: "ABOUT 40 LIGHT-YEARS · 7 WORLDS",
      voice: "theremin",
      frequency: 174.61,
      color: 0xd98bff,
      position: Object.freeze([4.3, 0.8, -4.2]),
      system: Object.freeze({
        kind: "planetary",
        worlds: 7,
        label: "7 ROCKY WORLDS · 1.5–19 DAY YEARS",
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
    }),
    Object.freeze({
      id: "andromeda",
      scale: "localGroup",
      name: "ANDROMEDA",
      detail: "2.5 MILLION LIGHT-YEARS",
      voice: "ondes",
      frequency: 130.81,
      color: 0x8edfff,
      position: Object.freeze([-9.2, 2.2, -7.4]),
    }),
    Object.freeze({
      id: "triangulum",
      scale: "localGroup",
      name: "TRIANGULUM",
      detail: "ABOUT 3 MILLION LIGHT-YEARS",
      voice: "light",
      frequency: 164.81,
      color: 0xf0c97d,
      position: Object.freeze([8.2, -2, -6.2]),
    }),
    Object.freeze({
      id: "magellanic-clouds",
      scale: "localGroup",
      name: "MAGELLANIC CLOUDS",
      detail: "SATELLITES OF THE MILKY WAY",
      voice: "theremin",
      frequency: 207.65,
      color: 0xd9a2ff,
      position: Object.freeze([4.8, -4.2, 3.6]),
    }),
  ]),
  universe: Object.freeze([
    Object.freeze({
      id: "virgo-cluster",
      scale: "universe",
      name: "VIRGO CLUSTER",
      detail: "ABOUT 54 MILLION LIGHT-YEARS",
      voice: "earth",
      frequency: 82.41,
      color: 0xffc978,
      position: Object.freeze([-11.5, 4.2, -11.8]),
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
    }),
    Object.freeze({
      id: "cosmic-web",
      scale: "universe",
      name: "COSMIC WEB",
      detail: "GALAXIES SHAPED BY GRAVITY",
      voice: "ondes",
      frequency: 146.83,
      color: 0xf4d79a,
      position: Object.freeze([-2.8, -6.2, -14.8]),
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
