/**
 * The last places you can go, and the honest name for what happens in them.
 *
 * A galaxy cluster is bound, but it does not turn. Its galaxies are not on
 * circular orbits about a centre — they are on long plunging ones, in every
 * direction at once, and what has actually been measured is the spread of
 * their speeds along our line of sight: the velocity dispersion. Calling the
 * result a "year" would be a stretch, and this instrument does not stretch.
 *
 * So the quantity here is the **crossing time**: how long a galaxy takes to
 * cross the cluster at the speed the cluster's own gravity gives it,
 *
 *     t = 2 R / sigma
 *
 * which is the standard timescale of any virialised system and is what makes a
 * cluster a cluster — a system younger than its own crossing time has not had
 * time to settle. It is real, it is measured, and it is a duration, so the
 * instrument's one law carries it without any pretending: a few billion years
 * to cross the Coma cluster makes it the deepest voice there is. The surface
 * says "TO CROSS" rather than a year, because that is what it is.
 *
 * The cosmic web is deliberately NOT here. Filaments and voids are not bound,
 * have no virial radius and no crossing time, and inventing one for them would
 * be exactly the kind of thing this file exists to avoid. The web stays a light
 * you can touch, and that is the edge of the instrument.
 *
 * SOURCES. Velocity dispersions and virial radii are the standard published
 * values: Ferrarese et al. (2012) and Binggeli et al. (1987) for Virgo,
 * Drinkwater et al. (2001) for Fornax, Colless & Dunn (1996) for Coma.
 */

/** Years to cross a cluster of `radiusMpc` at `dispersionKmS`, twice the radius over the speed. */
export const CROSSING_TIME_CONSTANT = 1.955_6e12;

export function crossingTimeYears({ radiusMpc, dispersionKmS }) {
  if (!Number.isFinite(radiusMpc) || radiusMpc <= 0) {
    throw new Error("A crossing time needs a positive radius in megaparsecs");
  }
  if (!Number.isFinite(dispersionKmS) || dispersionKmS <= 0) {
    throw new Error("A crossing time needs a positive velocity dispersion");
  }
  return (CROSSING_TIME_CONSTANT * radiusMpc) / dispersionKmS;
}

/** Seven shells from the crowded core out past the virial radius. */
export const CLUSTER_RING_FRACTIONS = Object.freeze([0.14, 0.27, 0.45, 0.66, 0.9, 1.2, 1.6]);

const CLUSTER_RING_NAMES = Object.freeze([
  "CORE", "INNER", "MID", "HALF-MASS", "OUTER", "VIRIAL EDGE", "INFALL",
]);

const MPC_IN_AU = 206_264_806_000;

export function buildGalaxyCluster(cluster) {
  const bodies = CLUSTER_RING_FRACTIONS.map((fraction, index) => {
    const radiusMpc = cluster.virialRadiusMpc * fraction;
    const years = crossingTimeYears({ radiusMpc, dispersionKmS: cluster.dispersionKmS });
    return Object.freeze({
      id: `${cluster.id}-${CLUSTER_RING_NAMES[index].toLowerCase().replace(/\s+/gu, "-")}`,
      name: `${cluster.name} ${CLUSTER_RING_NAMES[index]}`,
      kind: "planet",
      periodDays: years * 365.25,
      orbitAu: radiusMpc * MPC_IN_AU,
      radiusEarth: 8 + index * 2,
      eccentricity: 0,
      shell: CLUSTER_RING_NAMES[index],
      // Not a year. A galaxy here is not going round anything.
      crossing: true,
      radiusMpc,
    });
  });

  const virial = crossingTimeYears({
    radiusMpc: cluster.virialRadiusMpc,
    dispersionKmS: cluster.dispersionKmS,
  });
  return Object.freeze({
    ...cluster,
    label: `${cluster.dispersionKmS} KM/S · ${(virial / 1e9).toFixed(1)} BILLION YEARS TO CROSS`,
    star: Object.freeze({
      name: cluster.name,
      spectralType: "CLUSTER",
      temperature: cluster.coreTemperature,
      radiusSolar: 1.8,
      luminositySuns: 1,
    }),
    bodies: Object.freeze(bodies),
  });
}

const MEASURED_GALAXY_CLUSTERS = Object.freeze([
  Object.freeze({
    id: "virgo-cluster",
    name: "VIRGO CLUSTER",
    kind: "galaxy-cluster",
    dispersionKmS: 700,
    virialRadiusMpc: 1.55,
    coreTemperature: 4_300,
    voice: "trautonium",
    source: "Ferrarese et al. 2012 (ACSVCS); Binggeli, Tammann & Sandage 1987",
  }),
  Object.freeze({
    id: "fornax-cluster",
    name: "FORNAX CLUSTER",
    kind: "galaxy-cluster",
    dispersionKmS: 374,
    virialRadiusMpc: 0.7,
    coreTemperature: 4_700,
    voice: "ondes",
    source: "Drinkwater, Gregg & Colless 2001",
  }),
  Object.freeze({
    id: "coma-cluster",
    name: "COMA CLUSTER",
    kind: "galaxy-cluster",
    dispersionKmS: 1_008,
    virialRadiusMpc: 2,
    coreTemperature: 4_100,
    voice: "theremin",
    source: "Colless & Dunn 1996",
  }),
]);

export const GALAXY_CLUSTERS = Object.freeze(MEASURED_GALAXY_CLUSTERS.map(buildGalaxyCluster));
export const GALAXY_CLUSTERS_BY_ID = Object.freeze(
  new Map(GALAXY_CLUSTERS.map((cluster) => [cluster.id, cluster])),
);
