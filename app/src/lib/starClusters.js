/**
 * Places inside our own galaxy that a child can travel to and play.
 *
 * Beyond twenty-five light-years the instrument ran out of things to enter.
 * There are no catalogued exoplanets in Andromeda and there is no honest way
 * to invent some, so for a long time the outer skies were four or five lights
 * you could touch for a note and nothing you could go inside. That is the
 * cliff this file removes, and it removes it without inventing anything.
 *
 * A star cluster is already a system in exactly the sense this instrument
 * means: a central mass, with things going round it at measured radii, each
 * keeping a period that follows from the mass inside its own orbit. So a
 * cluster is built into the same shape a planetary system has, and everything
 * already written works on it — entering it, touching one member to hear its
 * year, hearing the whole thing as a chord, adding a world of your own, the
 * touch targets, the fact under its name.
 *
 * The one thing it changes is the scale of time. A planet's year is days; a
 * star's orbit around the centre of a globular cluster is millions of years.
 * The instrument's law does the rest without being told: the bigger and slower
 * a thing is, the deeper it sounds, so a globular cluster is the deepest voice
 * there is.
 *
 * SOURCES. Distances, masses, ages and sizes are the standard published values
 * — Gaia DR3 parallaxes for the nearby open clusters (Lodieu et al. 2019 for
 * the Pleiades, Gaia Collaboration 2017 for the Hyades), Baumgardt & Hilker
 * (2018) N-body fits for the globular cluster masses and radii, and Kuhn et
 * al. (2019) for Orion. Each cluster carries its source in `source`.
 */

/** Astronomical units in one parsec. */
export const AU_PER_PARSEC = 206_264.806;
/** Light-years in one parsec. */
export const LIGHT_YEARS_PER_PARSEC = 3.261_564;

/**
 * The mass inside radius `r` of a Plummer sphere of total mass `total` and
 * scale radius `scale`. Plummer (1911) is the standard closed-form cluster
 * model: it has a flat core and falls off outside, which is what a real
 * cluster does, and unlike a point mass it says the truth about the inside —
 * a star near the centre feels only the handful of stars inside it.
 */
export function plummerEnclosedMass({ total, scale, radius }) {
  if (!Number.isFinite(total) || total <= 0) throw new Error("A cluster needs a positive total mass");
  if (!Number.isFinite(scale) || scale <= 0) throw new Error("A cluster needs a positive scale radius");
  if (!Number.isFinite(radius) || radius < 0) throw new Error("An enclosed mass needs a radius");
  return total * radius ** 3 / (radius ** 2 + scale ** 2) ** 1.5;
}

/**
 * The circular period, in days, of a star at `radiusParsecs` from the centre of
 * a cluster of `massSuns` with scale radius `scaleParsecs`.
 *
 * Kepler's third law in solar units — P in years is the square root of a cubed
 * over the enclosed mass, with a in astronomical units — which is the same law
 * every planet in this instrument already obeys. Nothing new is assumed.
 */
export function clusterOrbitPeriodDays({ massSuns, scaleParsecs, radiusParsecs }) {
  const enclosed = plummerEnclosedMass({
    total: massSuns,
    scale: scaleParsecs,
    radius: radiusParsecs,
  });
  if (enclosed <= 0) throw new Error("A star at the exact centre has no orbit");
  const semiMajorAu = radiusParsecs * AU_PER_PARSEC;
  return 365.25 * Math.sqrt(semiMajorAu ** 3 / enclosed);
}

/**
 * Where the representative members of a cluster are placed.
 *
 * Not one star per catalogued member — a globular holds a million of them, and
 * a sky stops being readable somewhere around seven or eight named lights. So
 * a cluster is read at seven radii spread logarithmically from its core to its
 * outskirts, each standing for the population at that depth. The compression
 * is stated, and the ordering and the ratios are exact.
 */
export const CLUSTER_SHELL_FRACTIONS = Object.freeze([0.18, 0.34, 0.62, 1, 1.7, 2.9, 4.8]);

const CLUSTER_SHELL_NAMES = Object.freeze([
  "CORE", "INNER", "MID", "HALF-LIGHT", "OUTER", "HALO", "EDGE",
]);

/**
 * Turn measured cluster values into the same shape a planetary system has, so
 * every gesture the instrument already knows works inside one.
 */
export function buildCluster(cluster) {
  const bodies = CLUSTER_SHELL_FRACTIONS.map((fraction, index) => {
    const radiusParsecs = cluster.halfLightParsecs * fraction;
    const periodDays = clusterOrbitPeriodDays({
      massSuns: cluster.massSuns,
      scaleParsecs: cluster.halfLightParsecs,
      radiusParsecs,
    });
    return Object.freeze({
      id: `${cluster.id}-${CLUSTER_SHELL_NAMES[index].toLowerCase()}`,
      name: `${cluster.name} ${CLUSTER_SHELL_NAMES[index]}`,
      kind: "planet",
      periodDays,
      orbitAu: radiusParsecs * AU_PER_PARSEC,
      // Stars, not planets. The drawn size says how far out the shell sits, so
      // the eye reads a cluster as a cluster rather than as a solar system.
      radiusEarth: 6 + index * 2.4,
      eccentricity: 0,
      shell: CLUSTER_SHELL_NAMES[index],
      radiusParsecs,
    });
  });

  const slowest = bodies[bodies.length - 1].periodDays;
  return Object.freeze({
    ...cluster,
    distanceLy: cluster.distanceParsecs * LIGHT_YEARS_PER_PARSEC,
    label: `${cluster.members} · ${(slowest / 365.25 / 1e6).toFixed(1)} MILLION YEARS AT THE EDGE`,
    star: Object.freeze({
      name: cluster.name,
      spectralType: "CLUSTER",
      temperature: cluster.coreTemperature,
      radiusSolar: 1.4,
      luminositySuns: 1,
    }),
    bodies: Object.freeze(bodies),
  });
}

const MEASURED_CLUSTERS = Object.freeze([
  Object.freeze({
    id: "pleiades",
    name: "THE PLEIADES",
    kind: "open",
    distanceParsecs: 136.2,
    massSuns: 740,
    halfLightParsecs: 3.66,
    ageMillionYears: 112,
    members: "ABOUT 1,000 STARS",
    coreTemperature: 12_000,
    voice: "ondes",
    lesson: "SIX OR SEVEN OF THESE ARE VISIBLE TO THE NAKED EYE",
    source: "Lodieu, Pérez-Garrido, Smart & Silvotti 2019 (Gaia DR2 parallax)",
  }),
  Object.freeze({
    id: "hyades",
    name: "THE HYADES",
    kind: "open",
    distanceParsecs: 47.03,
    massSuns: 275,
    halfLightParsecs: 4.1,
    ageMillionYears: 625,
    members: "ABOUT 700 STARS",
    coreTemperature: 7_000,
    voice: "theremin",
    lesson: "THE NEAREST CLUSTER OF STARS THERE IS",
    source: "Gaia Collaboration, Babusiaux et al. 2018",
  }),
  Object.freeze({
    id: "omega-centauri",
    name: "OMEGA CENTAURI",
    kind: "globular",
    distanceParsecs: 5_430,
    massSuns: 3_550_000,
    halfLightParsecs: 6.44,
    ageMillionYears: 11_500,
    members: "ABOUT 10 MILLION STARS",
    coreTemperature: 4_800,
    voice: "trautonium",
    lesson: "THE BIGGEST BALL OF STARS OUR GALAXY HAS",
    source: "Baumgardt & Hilker 2018 N-body fit",
  }),
  Object.freeze({
    id: "messier-13",
    name: "THE HERCULES CLUSTER",
    kind: "globular",
    distanceParsecs: 7_100,
    massSuns: 545_000,
    halfLightParsecs: 3.65,
    ageMillionYears: 11_650,
    members: "ABOUT 500,000 STARS",
    coreTemperature: 5_100,
    voice: "trautonium",
    lesson: "WE ONCE SENT IT A RADIO MESSAGE — IT ARRIVES IN 25,000 YEARS",
    source: "Baumgardt & Hilker 2018 N-body fit",
  }),
  Object.freeze({
    id: "messier-4",
    name: "MESSIER 4",
    kind: "globular",
    distanceParsecs: 1_850,
    massSuns: 96_000,
    halfLightParsecs: 2.65,
    ageMillionYears: 12_200,
    members: "ABOUT 100,000 STARS",
    coreTemperature: 5_000,
    voice: "ondes",
    lesson: "THE CLOSEST BALL OF ANCIENT STARS TO US",
    source: "Baumgardt & Hilker 2018 N-body fit",
  }),
  Object.freeze({
    id: "messier-22",
    name: "MESSIER 22",
    kind: "globular",
    distanceParsecs: 3_300,
    massSuns: 410_000,
    halfLightParsecs: 3.6,
    ageMillionYears: 12_000,
    members: "ABOUT 300,000 STARS",
    coreTemperature: 5_000,
    voice: "trautonium",
    lesson: "ONE OF THE FIRST EVER FOUND, IN 1665",
    source: "Baumgardt & Hilker 2018 N-body fit",
  }),
  Object.freeze({
    id: "47-tucanae",
    name: "47 TUCANAE",
    kind: "globular",
    distanceParsecs: 4_450,
    massSuns: 779_000,
    halfLightParsecs: 4.15,
    ageMillionYears: 11_800,
    members: "ABOUT 1 MILLION STARS",
    coreTemperature: 4_900,
    voice: "ondes",
    lesson: "THE SECOND BRIGHTEST, AND ONLY THE SOUTH CAN SEE IT",
    source: "Baumgardt & Hilker 2018 N-body fit",
  }),
  Object.freeze({
    id: "messier-5",
    name: "MESSIER 5",
    kind: "globular",
    distanceParsecs: 7_500,
    massSuns: 390_000,
    halfLightParsecs: 3.9,
    ageMillionYears: 12_700,
    members: "ABOUT 500,000 STARS",
    coreTemperature: 5_200,
    voice: "theremin",
    lesson: "OLDER THAN ALMOST ANYTHING ELSE WE CAN SEE",
    source: "Baumgardt & Hilker 2018 N-body fit",
  }),
  Object.freeze({
    id: "messier-15",
    name: "MESSIER 15",
    kind: "globular",
    distanceParsecs: 10_400,
    massSuns: 560_000,
    halfLightParsecs: 3.0,
    ageMillionYears: 12_000,
    members: "ABOUT 100,000 STARS",
    coreTemperature: 5_300,
    voice: "trautonium",
    lesson: "ITS HEART HAS COLLAPSED INTO THE DENSEST PLACE WE KNOW",
    source: "Baumgardt & Hilker 2018 N-body fit",
  }),
]);

export const STAR_CLUSTERS = Object.freeze(MEASURED_CLUSTERS.map(buildCluster));
export const STAR_CLUSTERS_BY_ID = Object.freeze(
  new Map(STAR_CLUSTERS.map((cluster) => [cluster.id, cluster])),
);
