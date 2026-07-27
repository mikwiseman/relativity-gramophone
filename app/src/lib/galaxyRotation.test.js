import test from "node:test";
import assert from "node:assert/strict";

import {
  GALAXIES,
  GALAXIES_BY_ID,
  GALAXY_RING_FRACTIONS,
  rotationPeriodYears,
} from "./galaxyRotation.js";
import { systemVoiceFrequencies } from "./cosmicAtlas.js";
import { STAR_CLUSTERS } from "./starClusters.js";

test("the Sun's lap of the galaxy comes out at the value everybody quotes", () => {
  // 8.178 kpc from the centre at 229 km/s. The galactic year is about 228
  // million years, and if this number is wrong every galaxy here is wrong.
  const years = rotationPeriodYears({ radiusKpc: 8.178, speedKmS: 229 });
  assert.ok(Math.abs(years - 2.19e8) < 6e6, `got ${years.toExponential(3)} years`);
});

test("a galaxy's rotation is flat, so its chord is arithmetic and not Kepler's", () => {
  // Inside a planetary system nearly all the mass is the star, so a doubled
  // orbit is 2.83 times slower. In a galaxy the speed barely changes with
  // radius — the observation that told us dark matter is there — so a doubled
  // orbit is exactly twice as slow.
  const inner = rotationPeriodYears({ radiusKpc: 5, speedKmS: 220 });
  const outer = rotationPeriodYears({ radiusKpc: 10, speedKmS: 220 });
  assert.ok(Math.abs(outer / inner - 2) < 1e-9, "flat rotation means period is proportional to radius");
  assert.throws(() => rotationPeriodYears({ radiusKpc: 0, speedKmS: 220 }), /positive radius/);
  assert.throws(() => rotationPeriodYears({ radiusKpc: 8, speedKmS: 0 }), /positive rotation speed/);
});

test("every galaxy is the same shape as a planetary system, so every gesture works in one", () => {
  for (const galaxy of GALAXIES) {
    assert.equal(galaxy.bodies.length, GALAXY_RING_FRACTIONS.length);
    assert.ok(galaxy.lesson.length > 0, `${galaxy.name} needs its fact`);
    assert.ok(galaxy.source.length > 0, `${galaxy.name} needs its source`);
    assert.ok(galaxy.star.temperature > 0 && galaxy.star.radiusSolar > 0);
    for (let index = 1; index < galaxy.bodies.length; index += 1) {
      assert.ok(galaxy.bodies[index].periodDays > galaxy.bodies[index - 1].periodDays);
      assert.ok(galaxy.bodies[index].orbitAu > galaxy.bodies[index - 1].orbitAu);
    }
  }
});

test("inside a galaxy, slower is deeper — the same law as everywhere else", () => {
  for (const galaxy of GALAXIES) {
    const voices = systemVoiceFrequencies(galaxy.bodies.map((body) => body.periodDays));
    for (let index = 1; index < voices.length; index += 1) {
      assert.ok(voices[index] < voices[index - 1], `${galaxy.name}: a wider ring must be deeper`);
    }
    for (const voice of voices) {
      assert.ok(voice >= 54.9 && voice <= 1760.1, `${galaxy.name} sang ${voice} Hz`);
    }
  }
});

test("a galaxy is the deepest voice the instrument has", () => {
  const centre = (bodies) => {
    const voices = systemVoiceFrequencies(bodies.map((body) => body.periodDays));
    return Math.exp(voices.reduce((sum, value) => sum + Math.log(value), 0) / voices.length);
  };
  const shallowestGalaxy = Math.max(...GALAXIES.map((galaxy) => centre(galaxy.bodies)));
  const deepestCluster = Math.min(...STAR_CLUSTERS.map((cluster) => centre(cluster.bodies)));
  assert.ok(
    shallowestGalaxy <= deepestCluster,
    `every galaxy must sing below every cluster: ${shallowestGalaxy.toFixed(1)} vs ${deepestCluster.toFixed(1)} Hz`,
  );
});

test("the Milky Way says how long our own lap takes, and the others where their rim is", () => {
  assert.match(GALAXIES_BY_ID.get("milky-way").label, /OUR OWN LAP TAKES 2[12]\d MILLION YEARS/);
  assert.match(GALAXIES_BY_ID.get("andromeda").label, /MILLION YEARS AT THE RIM/);
});

test("Andromeda turns faster than Triangulum, and still takes as long to go round", () => {
  const andromeda = GALAXIES_BY_ID.get("andromeda");
  const triangulum = GALAXIES_BY_ID.get("triangulum");
  assert.ok(andromeda.rotationKmS > triangulum.rotationKmS, "M31 spins faster");
  assert.ok(andromeda.opticalRadiusKpc > triangulum.opticalRadiusKpc, "and is more than twice as wide");
  // Both effects nearly cancel: a lap of either takes about three hundred
  // million years. That is a fact about them, not a rounding.
  const lap = (galaxy) => galaxy.bodies[3].periodDays / 365.25 / 1e6;
  assert.ok(Math.abs(lap(andromeda) - lap(triangulum)) < 40, `${lap(andromeda)} vs ${lap(triangulum)} Myr`);
});
