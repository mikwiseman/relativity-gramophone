import test from "node:test";
import assert from "node:assert/strict";

import {
  blackbodyColor,
  compressedOrbitRadius,
  habitableZone,
  logSpiralRadius,
  planetAppearance,
  radiusFromMass,
  expandedOrbitAu,
  OUTER_REACH,
  OUTER_REACH_AU,
  periodFromReference,
  systemVoiceFrequencies,
  systemWorldVoice,
} from "./cosmicAtlas.js";
import { STAR_SYSTEMS } from "./starSystems.js";

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

test("slower is always deeper — in every system in the catalogue, without exception", () => {
  // The law the instrument states about itself. Folding each voice back into
  // the register one octave at a time broke it in the most recognisable place
  // there is: in THE SUN, Earth came out above Venus.
  const solarPeriods = [87.969, 224.701, 365.256, 686.98, 4332.82, 10_755.699, 30_687.153, 60_190.03];
  const check = (name, periods) => {
    const voices = systemVoiceFrequencies(periods);
    for (const frequency of voices) {
      assert.ok(frequency >= 55 && frequency <= 1760, `${name}: no world escapes the audible span`);
    }
    for (let index = 1; index < voices.length; index += 1) {
      assert.ok(
        voices[index] < voices[index - 1],
        `${name}: world ${index} is slower than world ${index - 1} and must sound lower`,
      );
    }
  };

  check("THE SUN", solarPeriods);
  for (const system of STAR_SYSTEMS) {
    check(system.name, system.bodies.map((body) => body.periodDays));
  }

  // A system that fits the register keeps its intervals exactly, because it is
  // only ever moved by whole octaves.
  const trappist = [1.510826, 2.421937, 4.049219, 6.101013, 9.20754, 12.352446, 18.772866];
  const chain = systemVoiceFrequencies(trappist);
  assert.ok(Math.abs(chain[0] / chain[1] - trappist[1] / trappist[0]) < 1e-9);

  // A system too wide to fit is compressed, and the compression is one shared
  // logarithmic factor rather than eight arbitrary wraps: every interval is
  // reduced by the same power, so their ORDER and relative sizes survive.
  const solar = systemVoiceFrequencies(solarPeriods);
  const power = (a, b) => Math.log2(solar[a] / solar[b])
    / Math.log2(solarPeriods[b] / solarPeriods[a]);
  assert.ok(Math.abs(power(0, 2) - power(4, 7)) < 1e-9, "one shared compression, not many");
});

test("system voices refuse impossible periods", () => {
  assert.throws(() => systemVoiceFrequencies([]), /at least one period/i);
  assert.throws(() => systemVoiceFrequencies([0]), /positive period/i);
  assert.throws(() => systemVoiceFrequencies([Number.NaN]), /positive period/i);
});

test("a world added to a real system obeys that system's own Kepler constant", () => {
  const earth = { orbitAu: 1, periodDays: 365.256 };
  // Mars: 1.5237 AU should come back as 686.9 days from Earth alone.
  assert.ok(Math.abs(periodFromReference(1.52371034, earth) - 686.98) < 1.5);
  // Jupiter, five astronomical units out and two orders of magnitude slower.
  assert.ok(Math.abs(periodFromReference(5.202887, earth) - 4332.82) < 12);
  // Doubling the axis multiplies the period by exactly 2^1.5, whatever the star.
  const dwarf = { orbitAu: 0.02, periodDays: 4 };
  assert.ok(Math.abs(periodFromReference(0.04, dwarf) - 4 * 2 ** 1.5) < 1e-9);
  assert.throws(() => periodFromReference(0, earth), /positive semi-major axis/i);
  assert.throws(() => periodFromReference(1, { orbitAu: 1 }), /positive period/i);

  // A finger on the screen has to land in astronomical units.
  const band = { minimumAu: 0.01, maximumAu: 30, innerRadius: 1.1, outerRadius: 4.2 };
  for (const au of [0.01, 0.4, 3.2, 30]) {
    const drawn = compressedOrbitRadius(au, band);
    assert.ok(Math.abs(expandedOrbitAu(drawn, band) - au) < au * 1e-9, `${au} AU round-trips`);
  }
  assert.throws(
    () => expandedOrbitAu(2, { ...band, outerRadius: 0 }),
    /finite drawable band/i,
  );
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

test("one law across the whole catalogue: a slower system sounds deeper", () => {
  // Inside a system this was already true and tested. Between systems it was
  // inverted: every system was re-centred on the same anchor, which deletes
  // the only thing that says how slow the system is. Measured before this
  // test existed, the rank correlation between a system's mean period and its
  // chord's centre was +0.44 — HR 8799, whose worlds take 150 years, sang
  // higher than Kepler-80, whose worlds take four days.
  const rows = STAR_SYSTEMS.map((system) => {
    const periods = system.bodies.map((body) => body.periodDays);
    const voices = systemVoiceFrequencies(periods);
    const geometric = (values) => Math.exp(
      values.reduce((sum, value) => sum + Math.log(value), 0) / values.length,
    );
    return { name: system.name, period: geometric(periods), centre: geometric(voices) };
  });

  const rank = (values) => {
    const order = values.map((value, index) => [value, index]).sort((a, b) => a[0] - b[0]);
    const ranks = new Array(values.length);
    order.forEach(([, index], position) => { ranks[index] = position + 1; });
    return ranks;
  };
  const n = rows.length;
  const byPeriod = rank(rows.map((row) => row.period));
  const byCentre = rank(rows.map((row) => row.centre));
  const squares = byPeriod.reduce((sum, value, index) => sum + (value - byCentre[index]) ** 2, 0);
  const spearman = 1 - (6 * squares) / (n * (n * n - 1));
  assert.ok(spearman <= -0.9, `slower must sound deeper across the catalogue; correlation was ${spearman.toFixed(3)}`);
});

test("no two systems are given the same chord to sing", () => {
  // Ten of them were: any system too wide for the register was stretched to
  // fill it exactly, so THE SUN, Kepler-62, Gliese 876 and seven others all
  // ran from 56.94 to 1700.05 Hz and were indistinguishable in extent.
  const extremes = new Map();
  for (const system of STAR_SYSTEMS) {
    const voices = systemVoiceFrequencies(system.bodies.map((body) => body.periodDays));
    const key = `${Math.min(...voices).toFixed(2)}-${Math.max(...voices).toFixed(2)}`;
    extremes.set(key, [...(extremes.get(key) ?? []), system.name]);
  }
  const shared = [...extremes.values()].filter((names) => names.length > 1);
  assert.deepEqual(shared, [], `systems sharing a chord: ${JSON.stringify(shared)}`);
});

test("every catalogue voice stays inside the singing register", () => {
  for (const system of STAR_SYSTEMS) {
    const voices = systemVoiceFrequencies(system.bodies.map((body) => body.periodDays));
    for (const voice of voices) {
      assert.ok(voice >= 54.9 && voice <= 1760.1, `${system.name} sang ${voice} Hz`);
    }
  }
});

test("a system that fits keeps its measured intervals exactly", () => {
  // TRAPPIST-1's published resonance chain has to arrive as a real chord: a
  // shift is a transposition and preserves every ratio, whether or not it
  // lands on a whole octave.
  const trappist = STAR_SYSTEMS.find((system) => system.name === "TRAPPIST-1");
  const periods = trappist.bodies.map((body) => body.periodDays);
  const voices = systemVoiceFrequencies(periods);
  for (let index = 1; index < periods.length; index += 1) {
    const periodRatio = periods[index - 1] / periods[index];
    const voiceRatio = voices[index] / voices[index - 1];
    assert.ok(
      Math.abs(voiceRatio / periodRatio - 1) < 1e-9,
      `TRAPPIST-1 interval ${index} drifted: ${voiceRatio} vs ${periodRatio}`,
    );
  }
});

test("a forecast radius stops growing where a real planet stops growing", () => {
  // Chen & Kipping (2017), ApJ 834, 17. The break near 132 Earth masses is the
  // whole point: above it a world is squeezed by its own gravity, so the
  // exponent turns negative and ten Jupiter masses is barely wider than one.
  assert.ok(Math.abs(radiusFromMass(1) - 1.008) < 0.01, "one Earth mass is one Earth radius");
  assert.ok(radiusFromMass(17.15) > 3.8 && radiusFromMass(17.15) < 4.8, "Neptune lands near four");
  // Continuous across the Jovian break rather than jumping.
  const below = radiusFromMass(131.5);
  const above = radiusFromMass(131.7);
  assert.ok(Math.abs(below - above) < 0.02, `the break is a corner, not a cliff: ${below} vs ${above}`);
  // And past it, growing mass makes a *smaller* world.
  assert.ok(radiusFromMass(3000) < radiusFromMass(300), "a ten-Jupiter world is not ten Jupiters wide");
  assert.ok(radiusFromMass(3000) > 10 && radiusFromMass(3000) < 14);
  assert.throws(() => radiusFromMass(0), /positive mass/);
});

test("no world in the catalogue is drawn wider than physics allows", () => {
  // HD 10180 c, d and g were carrying 85, 95 and 97 Earth radii — against a
  // star 121 Earth radii across. The Neptunian branch of the mass-radius
  // relation had been applied twenty times past its own validity bound.
  for (const system of STAR_SYSTEMS) {
    const starRadiusEarth = system.star.radiusSolar * 109.076;
    for (const body of system.bodies) {
      assert.ok(
        body.radiusEarth <= 25,
        `${body.name} is ${body.radiusEarth} Earth radii; the widest planets known are about 22`,
      );
      // A giant around an M-dwarf really is a large fraction of its star —
      // Gliese 876 b and c sit at about 42% and are not wrong. Seventy per
      // cent is not a system, it is an arithmetic error.
      assert.ok(
        body.radiusEarth < starRadiusEarth * 0.6,
        `${body.name} is ${(body.radiusEarth / starRadiusEarth * 100).toFixed(0)}% as wide as its own star`,
      );
    }
  }
});

test("reaching past the outermost orbit is even, and goes properly far", () => {
  // Inside the measured system the map is logarithmic, because that is what
  // makes nine octaves of orbit fit one screen. Outside it there is nothing
  // left to compress and the same map runs away: in the Solar System, twenty
  // eight per cent past Neptune's ring landed a world at 157 AU — five times
  // further out for a quarter more finger travel — and then stopped dead.
  const band = { minimumAu: 0.387, maximumAu: 30.07, innerRadius: 1.1, outerRadius: 4.2 };
  const at = (fraction) => expandedOrbitAu(band.outerRadius * fraction, band);

  assert.ok(Math.abs(at(1) - 30.07) < 1e-6, "the outermost ring is still the outermost orbit");
  // Half way along the tail is half way out in astronomical units, not five times.
  const half = at(1 + (OUTER_REACH - 1) / 2);
  assert.ok(Math.abs(half - (30.07 + 30.07 * (OUTER_REACH_AU - 1) / 2)) < 1e-6, `half the tail gave ${half}`);
  assert.ok(Math.abs(at(OUTER_REACH) - 30.07 * OUTER_REACH_AU) < 1e-6, "the far edge is four times the outermost orbit");
  assert.ok(at(OUTER_REACH) > 100, "a world can be put properly far away");
});

test("drawing and placing an orbit are exact inverses, inside the system and beyond it", () => {
  const band = { minimumAu: 0.387, maximumAu: 30.07, innerRadius: 1.1, outerRadius: 4.2 };
  for (const au of [0.387, 1, 5.2, 30.07, 45, 80, 120.28]) {
    const radius = compressedOrbitRadius(au, band);
    const back = expandedOrbitAu(radius, band);
    assert.ok(Math.abs(back / au - 1) < 1e-9, `${au} AU drew at ${radius} and came back as ${back}`);
  }
});
