import test from "node:test";
import assert from "node:assert/strict";

import {
  AU_PER_PARSEC,
  CLUSTER_SHELL_FRACTIONS,
  STAR_CLUSTERS,
  STAR_CLUSTERS_BY_ID,
  buildCluster,
  clusterOrbitPeriodDays,
  plummerEnclosedMass,
} from "./starClusters.js";
import { systemVoiceFrequencies } from "./cosmicAtlas.js";
import { STAR_SYSTEMS } from "./starSystems.js";

test("a Plummer sphere holds almost nothing at its centre and everything far out", () => {
  const total = 1_000_000;
  const scale = 4;
  assert.equal(plummerEnclosedMass({ total, scale, radius: 0 }), 0);
  // Half the mass sits inside 1.305 scale radii — the Plummer half-mass radius.
  const half = plummerEnclosedMass({ total, scale, radius: 1.305 * scale });
  assert.ok(Math.abs(half / total - 0.5) < 0.01, `half-mass radius gave ${half / total}`);
  // And it approaches the total, never exceeding it.
  const far = plummerEnclosedMass({ total, scale, radius: 400 * scale });
  assert.ok(far < total && far > total * 0.999);
  assert.throws(() => plummerEnclosedMass({ total: 0, scale, radius: 1 }), /positive total mass/);
});

test("a star further out in a cluster takes longer to go round", () => {
  const cluster = { massSuns: 545_000, scaleParsecs: 3.65 };
  let previous = 0;
  for (const fraction of CLUSTER_SHELL_FRACTIONS) {
    const period = clusterOrbitPeriodDays({ ...cluster, radiusParsecs: 3.65 * fraction });
    assert.ok(period > previous, `${fraction} scale radii must be slower than the shell inside it`);
    previous = period;
  }
  assert.throws(
    () => clusterOrbitPeriodDays({ ...cluster, radiusParsecs: 0 }),
    /no orbit/,
  );
});

test("a globular cluster keeps time in millions of years, as it should", () => {
  const hercules = STAR_CLUSTERS_BY_ID.get("messier-13");
  const years = hercules.bodies.map((body) => body.periodDays / 365.25);
  // The literature crossing time for a massive globular is of order a million
  // years. Anything in thousands or in billions would be an arithmetic error.
  assert.ok(years[0] > 1e5 && years[0] < 1e7, `core shell was ${years[0].toExponential(2)} years`);
  assert.ok(
    years[years.length - 1] > years[0] * 10,
    "the edge takes far longer than the core",
  );
});

test("an open cluster is faster than a globular, because it is far lighter", () => {
  const pleiades = STAR_CLUSTERS_BY_ID.get("pleiades");
  const omega = STAR_CLUSTERS_BY_ID.get("omega-centauri");
  const mean = (cluster) => (
    cluster.bodies.reduce((sum, body) => sum + Math.log(body.periodDays), 0) / cluster.bodies.length
  );
  assert.ok(mean(pleiades) > mean(omega), "740 solar masses orbits more slowly than 3.5 million");
});

test("a cluster is the same shape as a planetary system, so every gesture works in one", () => {
  for (const cluster of STAR_CLUSTERS) {
    assert.ok(typeof cluster.name === "string" && cluster.name.length > 0);
    assert.ok(typeof cluster.lesson === "string" && cluster.lesson.length > 0, `${cluster.name} needs its fact`);
    assert.ok(typeof cluster.source === "string" && cluster.source.length > 0, `${cluster.name} needs its source`);
    assert.ok(cluster.star && cluster.star.temperature > 0 && cluster.star.radiusSolar > 0);
    assert.equal(cluster.bodies.length, CLUSTER_SHELL_FRACTIONS.length);
    for (const body of cluster.bodies) {
      assert.equal(body.kind, "planet");
      assert.ok(body.periodDays > 0 && Number.isFinite(body.periodDays));
      assert.ok(body.orbitAu > 0 && Number.isFinite(body.orbitAu));
      assert.ok(body.radiusEarth > 0);
    }
    // Ordered outward, so the chord falls as the orbits widen.
    for (let index = 1; index < cluster.bodies.length; index += 1) {
      assert.ok(cluster.bodies[index].orbitAu > cluster.bodies[index - 1].orbitAu);
      assert.ok(cluster.bodies[index].periodDays > cluster.bodies[index - 1].periodDays);
    }
  }
});

test("inside a cluster, slower is deeper — the same law as everywhere else", () => {
  for (const cluster of STAR_CLUSTERS) {
    const voices = systemVoiceFrequencies(cluster.bodies.map((body) => body.periodDays));
    for (let index = 1; index < voices.length; index += 1) {
      assert.ok(
        voices[index] < voices[index - 1],
        `${cluster.name}: a wider orbit must be a deeper voice`,
      );
    }
    for (const voice of voices) {
      assert.ok(voice >= 54.9 && voice <= 1760.1, `${cluster.name} sang ${voice} Hz`);
    }
  }
});

test("a cluster is deeper than every planetary system, because it is slower", () => {
  const centre = (periods) => {
    const voices = systemVoiceFrequencies(periods);
    return Math.exp(voices.reduce((sum, value) => sum + Math.log(value), 0) / voices.length);
  };
  const deepestSystem = Math.min(
    ...STAR_SYSTEMS.map((system) => centre(system.bodies.map((body) => body.periodDays))),
  );
  for (const cluster of STAR_CLUSTERS) {
    const clusterCentre = centre(cluster.bodies.map((body) => body.periodDays));
    assert.ok(
      clusterCentre <= deepestSystem,
      `${cluster.name} sang at ${clusterCentre.toFixed(0)} Hz, above the deepest system at ${deepestSystem.toFixed(0)}`,
    );
  }
});

test("distances are stated in light-years from the measured parsec distance", () => {
  const pleiades = STAR_CLUSTERS_BY_ID.get("pleiades");
  // 136.2 pc is 444 light-years, the value everybody quotes for the Pleiades.
  assert.ok(Math.abs(pleiades.distanceLy - 444) < 2, `got ${pleiades.distanceLy}`);
  const hyades = STAR_CLUSTERS_BY_ID.get("hyades");
  assert.ok(Math.abs(hyades.distanceLy - 153) < 2, `got ${hyades.distanceLy}`);
});

test("one parsec really is 206,265 astronomical units", () => {
  assert.ok(Math.abs(AU_PER_PARSEC - 206_265) < 1);
  const cluster = buildCluster({
    id: "probe",
    name: "PROBE",
    kind: "open",
    distanceParsecs: 100,
    massSuns: 1000,
    halfLightParsecs: 2,
    ageMillionYears: 10,
    members: "SOME STARS",
    coreTemperature: 6000,
    voice: "ondes",
    lesson: "A TEST",
    source: "constructed",
  });
  assert.ok(Math.abs(cluster.bodies[3].orbitAu - 2 * AU_PER_PARSEC) < 1e-6);
});
