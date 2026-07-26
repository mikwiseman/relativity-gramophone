import test from "node:test";
import assert from "node:assert/strict";

import {
  blackbodyColor,
  compressedOrbitRadius,
  habitableZone,
  logSpiralRadius,
  planetAppearance,
  systemVoiceFrequencies,
  systemWorldVoice,
} from "./cosmicAtlas.js";

function channels(hex) {
  return {
    red: (hex >> 16) & 0xff,
    green: (hex >> 8) & 0xff,
    blue: hex & 0xff,
  };
}

test("star colour follows the Planckian locus, so a cool dwarf really is orange", () => {
  const trappist = channels(blackbodyColor(2566));
  assert.ok(trappist.red > trappist.green, "an M8 dwarf is red-dominant");
  assert.ok(trappist.green > trappist.blue, "and its blue channel is the weakest");
  assert.equal(trappist.red, 255, "the brightest channel is normalised to full");

  const sun = channels(blackbodyColor(5772));
  assert.ok(sun.red - sun.blue < 70, "the Sun is close to white, only slightly warm");
  assert.ok(sun.blue > trappist.blue + 60, "and far bluer than an M dwarf");

  const sirius = channels(blackbodyColor(9940));
  assert.ok(sirius.blue >= sirius.red, "an A1V star reads blue-white");
  assert.ok(sirius.blue > sun.blue, "hotter than the Sun means bluer than the Sun");

  const rigel = channels(blackbodyColor(12100));
  assert.ok(rigel.blue > sirius.blue || rigel.red < sirius.red, "hotter still keeps bluing");
});

test("blackbody colour refuses temperatures no star has", () => {
  assert.throws(() => blackbodyColor(0), /positive temperature/i);
  assert.throws(() => blackbodyColor(Number.NaN), /positive temperature/i);
});

test("the habitable zone follows the star's luminosity", () => {
  const sun = habitableZone(1);
  assert.ok(sun.inner > 0.9 && sun.inner < 1, "Earth sits just outside the runaway-greenhouse edge");
  assert.ok(sun.outer > 1.3 && sun.outer < 1.5, "and Mars sits near the outer edge");

  const dwarf = habitableZone(0.000553);
  assert.ok(dwarf.outer < 0.05, "a TRAPPIST-1-class dwarf keeps its habitable zone very tight");
  assert.ok(dwarf.inner < dwarf.outer);

  assert.throws(() => habitableZone(0), /positive luminosity/i);
});

test("planet appearance comes from real radius and real starlight", () => {
  const earth = planetAppearance({ radiusEarth: 1, orbitAu: 1, luminositySuns: 1 });
  assert.equal(earth.id, "temperate-rocky");

  const lava = planetAppearance({ radiusEarth: 1.1, orbitAu: 0.0115, luminositySuns: 0.000553 });
  assert.equal(lava.id, "warm-rocky", "TRAPPIST-1 b is warm, not molten");

  const mercuryLike = planetAppearance({ radiusEarth: 1, orbitAu: 0.02, luminositySuns: 1 });
  assert.equal(mercuryLike.id, "lava");

  const jupiter = planetAppearance({ radiusEarth: 11.21, orbitAu: 5.2, luminositySuns: 1 });
  assert.equal(jupiter.id, "gas-giant");

  const neptune = planetAppearance({ radiusEarth: 3.88, orbitAu: 30.07, luminositySuns: 1 });
  assert.equal(neptune.id, "ice-giant");

  for (const appearance of [earth, lava, jupiter, neptune]) {
    assert.ok(Number.isInteger(appearance.color) && appearance.color >= 0 && appearance.color <= 0xffffff);
    assert.ok(appearance.label.length > 0);
  }

  assert.throws(
    () => planetAppearance({ radiusEarth: -1, orbitAu: 1, luminositySuns: 1 }),
    /positive planet radius/i,
  );
});

test("orbit radii are compressed on a log scale that keeps their real order", () => {
  const auValues = [0.01154, 0.0158, 0.02227, 0.02925, 0.03849, 0.04683, 0.06189];
  const radii = auValues.map((au) => compressedOrbitRadius(au, {
    minimumAu: auValues[0],
    maximumAu: auValues.at(-1),
    innerRadius: 1,
    outerRadius: 4,
  }));

  assert.equal(radii[0], 1);
  assert.equal(radii.at(-1), 4);
  for (let index = 1; index < radii.length; index += 1) {
    assert.ok(radii[index] > radii[index - 1], "the real ordering survives compression");
  }

  const single = compressedOrbitRadius(1, {
    minimumAu: 1,
    maximumAu: 1,
    innerRadius: 1,
    outerRadius: 4,
  });
  assert.equal(single, 2.5, "a lone world sits in the middle of the band");

  assert.throws(
    () => compressedOrbitRadius(0, { minimumAu: 1, maximumAu: 2, innerRadius: 1, outerRadius: 4 }),
    /positive semi-major axis/i,
  );
});

test("a logarithmic spiral arm opens at the galaxy's real pitch angle", () => {
  const innerRadius = 1;
  const pitchAngle = 12;
  const quarter = logSpiralRadius({ innerRadius, pitchAngle, theta: Math.PI / 2 });
  const half = logSpiralRadius({ innerRadius, pitchAngle, theta: Math.PI });

  assert.ok(quarter > innerRadius, "the arm winds outward");
  assert.ok(half > quarter);
  // r = r0 * exp(theta * tan(pitch)) is the definition of a logarithmic spiral.
  assert.ok(
    Math.abs(half - innerRadius * Math.exp(Math.PI * Math.tan((pitchAngle * Math.PI) / 180))) < 1e-9,
  );

  const tight = logSpiralRadius({ innerRadius, pitchAngle: 6, theta: Math.PI });
  assert.ok(tight < half, "a smaller pitch angle winds more tightly");

  assert.throws(
    () => logSpiralRadius({ innerRadius, pitchAngle: 0, theta: 1 }),
    /pitch angle/i,
  );
});

test("a whole system is transposed by one shared octave shift, so slower really is deeper", () => {
  const trappistPeriods = [1.510826, 2.421937, 4.049219, 6.101013, 9.20754, 12.352446, 18.772866];
  const voices = systemVoiceFrequencies(trappistPeriods);

  assert.equal(voices.length, trappistPeriods.length);
  for (let index = 1; index < voices.length; index += 1) {
    assert.ok(voices[index] < voices[index - 1], "every slower world sounds lower than the last");
  }
  for (const frequency of voices) {
    assert.ok(frequency >= 55 && frequency <= 1760, "the chain lands inside one audible span");
  }

  // The published TRAPPIST-1 resonance is heard as a real interval, not an approximation.
  const measuredRatio = voices[0] / voices[1];
  assert.ok(
    Math.abs(measuredRatio - trappistPeriods[1] / trappistPeriods[0]) < 1e-9,
    "the pitch ratio equals the orbital period ratio exactly",
  );
});

test("a system too wide for one register folds only its extremes, by whole octaves", () => {
  const solarPeriods = [87.969, 224.701, 365.256, 686.98, 4332.59, 10_759.22, 30_685.4, 60_189];
  const voices = systemVoiceFrequencies(solarPeriods);

  for (const frequency of voices) {
    assert.ok(frequency >= 55 && frequency <= 1760, "no planet escapes the audible span");
  }
  const foldedRatio = voices[0] / voices[2];
  const trueRatio = solarPeriods[2] / solarPeriods[0];
  const octaves = Math.log2(trueRatio / foldedRatio);
  assert.ok(
    Math.abs(octaves - Math.round(octaves)) < 1e-9,
    "any correction is a whole number of octaves, so the interval survives",
  );
});

test("system voices refuse impossible periods", () => {
  assert.throws(() => systemVoiceFrequencies([]), /at least one period/i);
  assert.throws(() => systemVoiceFrequencies([0]), /positive period/i);
  assert.throws(() => systemVoiceFrequencies([Number.NaN]), /positive period/i);
});

test("a single world can be sounded out of its own system, at its own place in the chord", () => {
  const system = {
    star: { name: "TRAPPIST-1", temperature: 2566, radiusSolar: 0.1192, luminositySuns: 0.000553 },
    bodies: [
      { id: "trappist-1-b", name: "TRAPPIST-1 b", periodDays: 1.510826, orbitAu: 0.01154, radiusEarth: 1.116 },
      { id: "trappist-1-e", name: "TRAPPIST-1 e", periodDays: 6.101013, orbitAu: 0.02925, radiusEarth: 0.92 },
      { id: "trappist-1-h", name: "TRAPPIST-1 h", periodDays: 18.772866, orbitAu: 0.06189, radiusEarth: 0.755 },
    ],
  };
  const chord = systemVoiceFrequencies(system.bodies.map((body) => body.periodDays));

  const inner = systemWorldVoice({ system, planetId: "trappist-1-b" });
  const outer = systemWorldVoice({ system, planetId: "trappist-1-h" });

  // A world heard alone is the same pitch it contributes to the chord: one law,
  // whether you touch one world or the whole system.
  assert.equal(inner.frequency, chord[0]);
  assert.equal(outer.frequency, chord[2]);
  assert.equal(inner.index, 0);
  assert.equal(outer.index, 2);
  assert.ok(outer.frequency < inner.frequency, "the slower world is the deeper voice");
  assert.equal(outer.planet.name, "TRAPPIST-1 h");
  // 363 K at 0.0115 AU from a 0.00055-solar-luminosity dwarf: warm, not molten.
  assert.equal(inner.appearance.label, "WARM ROCK");

  assert.throws(
    () => systemWorldVoice({ system, planetId: "nowhere" }),
    /not a world of this system/i,
  );
});
