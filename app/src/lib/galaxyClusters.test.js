import test from "node:test";
import assert from "node:assert/strict";

import {
  CLUSTER_RING_FRACTIONS,
  GALAXY_CLUSTERS,
  GALAXY_CLUSTERS_BY_ID,
  crossingTimeYears,
} from "./galaxyClusters.js";
import { systemVoiceFrequencies } from "./cosmicAtlas.js";
import { GALAXIES } from "./galaxyRotation.js";
import { cosmicLandmarksForScale } from "./cosmicInstrument.js";

test("crossing the Coma cluster takes a few billion years, as the literature says", () => {
  // 2 Mpc at 1008 km/s. Anything in millions or in hundreds of billions would
  // be an arithmetic error, and this is the number that makes a cluster a
  // cluster: a system younger than its own crossing time has not settled.
  const years = crossingTimeYears({ radiusMpc: 2, dispersionKmS: 1008 });
  assert.ok(years > 2e9 && years < 6e9, `got ${years.toExponential(3)} years`);
  assert.throws(() => crossingTimeYears({ radiusMpc: 0, dispersionKmS: 900 }), /positive radius/);
  assert.throws(() => crossingTimeYears({ radiusMpc: 2, dispersionKmS: 0 }), /positive velocity dispersion/);
});

test("a bigger, hotter cluster takes longer to cross than a small tidy one", () => {
  const coma = GALAXY_CLUSTERS_BY_ID.get("coma-cluster");
  const fornax = GALAXY_CLUSTERS_BY_ID.get("fornax-cluster");
  const edge = (cluster) => cluster.bodies[cluster.bodies.length - 1].periodDays;
  assert.ok(edge(coma) > edge(fornax), "Coma is both wider and more massive");
});

test("every galaxy cluster is the same shape as a planetary system", () => {
  for (const cluster of GALAXY_CLUSTERS) {
    assert.equal(cluster.bodies.length, CLUSTER_RING_FRACTIONS.length);
    assert.ok(cluster.source.length > 0, `${cluster.name} needs its source`);
    for (const body of cluster.bodies) {
      assert.equal(body.crossing, true, "a galaxy in a cluster is not going round anything");
      assert.ok(body.periodDays > 0 && Number.isFinite(body.periodDays));
    }
    for (let index = 1; index < cluster.bodies.length; index += 1) {
      assert.ok(cluster.bodies[index].periodDays > cluster.bodies[index - 1].periodDays);
    }
  }
});

test("inside a galaxy cluster, further out is deeper — the same law as everywhere else", () => {
  for (const cluster of GALAXY_CLUSTERS) {
    const voices = systemVoiceFrequencies(cluster.bodies.map((body) => body.periodDays));
    for (let index = 1; index < voices.length; index += 1) {
      assert.ok(voices[index] < voices[index - 1], `${cluster.name}: a wider shell must be deeper`);
    }
    for (const voice of voices) {
      assert.ok(voice >= 54.9 && voice <= 1760.1, `${cluster.name} sang ${voice} Hz`);
    }
  }
});

test("a galaxy cluster is the deepest voice there is", () => {
  const centre = (bodies) => {
    const voices = systemVoiceFrequencies(bodies.map((body) => body.periodDays));
    return Math.exp(voices.reduce((sum, value) => sum + Math.log(value), 0) / voices.length);
  };
  const shallowestCluster = Math.max(...GALAXY_CLUSTERS.map((c) => centre(c.bodies)));
  const deepestGalaxy = Math.min(...GALAXIES.map((g) => centre(g.bodies)));
  assert.ok(
    shallowestCluster <= deepestGalaxy,
    `a cluster of galaxies must sing below a galaxy: ${shallowestCluster.toFixed(1)} vs ${deepestGalaxy.toFixed(1)} Hz`,
  );
});

test("the cosmic web stays a light you can touch, and nothing more", () => {
  // Filaments and voids are not bound. They have no virial radius and no
  // crossing time, and inventing one would be exactly the thing this refuses.
  const web = cosmicLandmarksForScale("universe").find((l) => l.id === "cosmic-web");
  assert.ok(web, "the web is still there");
  assert.equal(web.system, undefined, "the web is not a place you can be inside");

  const enterable = cosmicLandmarksForScale("universe").filter((l) => l.system);
  assert.equal(enterable.length, 3, "the three real clusters are enterable");
  for (const landmark of enterable) {
    assert.equal(landmark.system.kind, "galaxy-cluster");
    assert.ok(landmark.lesson.length > 0);
  }
});
