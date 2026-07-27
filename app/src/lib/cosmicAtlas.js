// Physical helpers shared by every cosmic scale.
//
// Nothing here is decorative: a star's colour comes from its temperature, a
// planet's look comes from its radius and the starlight it receives, an arm of a
// galaxy opens at its measured pitch angle, and a system's chord is its real
// orbital periods moved by whole octaves. Where a value is compressed to fit a
// screen, the compression is logarithmic and order-preserving, and the surface
// says so.

const DEGREES = Math.PI / 180;

function assertPositive(value, message) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(message);
  return value;
}

// Kim et al. (2002) cubic approximation of the Planckian locus in CIE 1931 xy,
// then the standard sRGB (D65) matrix. Source: CIE 15:2004 and
// https://en.wikipedia.org/wiki/Planckian_locus#Approximation
function planckianChromaticity(temperature) {
  const kelvin = Math.min(25_000, Math.max(1667, temperature));
  const inverse = 1 / kelvin;
  const x = kelvin < 4000
    ? -0.2661239e9 * inverse ** 3 - 0.2343589e6 * inverse ** 2 + 0.8776956e3 * inverse + 0.179910
    : -3.0258469e9 * inverse ** 3 + 2.1070379e6 * inverse ** 2 + 0.2226347e3 * inverse + 0.240390;

  const y = kelvin < 2222
    ? -1.1063814 * x ** 3 - 1.34811020 * x ** 2 + 2.18555832 * x - 0.20219683
    : kelvin < 4000
      ? -0.9549476 * x ** 3 - 1.37418593 * x ** 2 + 2.09137015 * x - 0.16748867
      : 3.0817580 * x ** 3 - 5.87338670 * x ** 2 + 3.75112997 * x - 0.37001483;

  return { x, y };
}

function encodeSrgbChannel(linear) {
  const clamped = Math.min(1, Math.max(0, linear));
  const encoded = clamped <= 0.0031308
    ? clamped * 12.92
    : 1.055 * clamped ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, encoded)) * 255);
}

/**
 * The sRGB colour of a blackbody at `temperature` kelvin, normalised so the
 * brightest channel is full. A 2566 K dwarf comes out orange, the 5772 K Sun
 * comes out barely-warm white, a 9940 K A-star comes out blue-white.
 */
export function blackbodyColor(temperature) {
  assertPositive(temperature, "Blackbody colour requires a positive temperature in kelvin");
  const { x, y } = planckianChromaticity(temperature);
  const bigX = x / y;
  const bigZ = (1 - x - y) / y;

  const red = 3.2406 * bigX - 1.5372 - 0.4986 * bigZ;
  const green = -0.9689 * bigX + 1.8758 + 0.0415 * bigZ;
  const blue = 0.0557 * bigX - 0.2040 + 1.0570 * bigZ;

  const brightest = Math.max(red, green, blue, 1e-6);
  return (encodeSrgbChannel(red / brightest) << 16)
    + (encodeSrgbChannel(green / brightest) << 8)
    + encodeSrgbChannel(blue / brightest);
}

/**
 * Equilibrium temperature in kelvin for a world at `orbitAu` around a star of
 * `luminositySuns`, assuming a Bond albedo of 0.3. Earth lands on 255 K.
 */
export function equilibriumTemperature({ orbitAu, luminositySuns, albedo = 0.3 }) {
  assertPositive(orbitAu, "Equilibrium temperature requires a positive semi-major axis in AU");
  assertPositive(luminositySuns, "Equilibrium temperature requires a positive luminosity");
  if (!Number.isFinite(albedo) || albedo < 0 || albedo >= 1) {
    throw new Error("Bond albedo must sit between 0 and 1");
  }
  return 278.5 * (1 - albedo) ** 0.25 * luminositySuns ** 0.25 / Math.sqrt(orbitAu);
}

/**
 * The conservative habitable zone in AU (Kasting, Whitmire & Reynolds 1993:
 * runaway greenhouse at S = 1.1, maximum greenhouse at S = 0.53). For the Sun
 * this is 0.95–1.37 AU; for TRAPPIST-1 it is 0.022–0.032 AU, which is exactly
 * where TRAPPIST-1 e sits.
 */
export function habitableZone(luminositySuns) {
  assertPositive(luminositySuns, "The habitable zone requires a positive luminosity");
  return {
    inner: Math.sqrt(luminositySuns / 1.1),
    outer: Math.sqrt(luminositySuns / 0.53),
  };
}

/**
 * The radius a world of a given mass is expected to have, when nobody has
 * measured its radius.
 *
 * Chen & Kipping (2017), "Probabilistic Forecasting of the Masses and Radii of
 * Other Worlds", ApJ 834, 17 — the mean relation, in Earth units. It is a
 * broken power law and the breaks are the whole point: above about 132 Earth
 * masses a planet stops growing and starts to be squeezed by its own gravity,
 * so the exponent turns negative and a ten-Jupiter-mass world is barely wider
 * than Jupiter.
 *
 * Applying the Neptunian branch past that break is how HD 10180 c, d and g —
 * three radial-velocity worlds of nine to eleven Jupiter masses, none of which
 * has a measured radius — were handed radii of 85, 95 and 97 Earth radii. Their
 * own star is 121 Earth radii across. They were drawn as three worlds each
 * nearly as wide as the sun they orbit.
 */
export function radiusFromMass(massEarth) {
  assertPositive(massEarth, "A forecast radius requires a positive mass in Earth masses");
  if (massEarth < 2.04) return 1.008 * massEarth ** 0.279;
  if (massEarth < 131.6) return 0.808 * massEarth ** 0.589;
  if (massEarth < 26_600) return 17.74 * massEarth ** -0.044;
  return 0.00143 * massEarth ** 0.881;
}

const PLANET_CLASSES = Object.freeze({
  lava: Object.freeze({ id: "lava", label: "MOLTEN ROCK", color: 0xff7a3c }),
  "warm-rocky": Object.freeze({ id: "warm-rocky", label: "WARM ROCK", color: 0xc9855c }),
  "temperate-rocky": Object.freeze({ id: "temperate-rocky", label: "TEMPERATE ROCK", color: 0x7fa8c4 }),
  "frozen-rocky": Object.freeze({ id: "frozen-rocky", label: "FROZEN ROCK", color: 0xdbe8f2 }),
  "mini-neptune": Object.freeze({ id: "mini-neptune", label: "HAZY MINI-NEPTUNE", color: 0x9dc3d6 }),
  "ice-giant": Object.freeze({ id: "ice-giant", label: "ICE GIANT", color: 0x74bcc6 }),
  "gas-giant": Object.freeze({ id: "gas-giant", label: "GAS GIANT", color: 0xd9b489 }),
});

/**
 * What a world looks like, from its measured radius and the starlight it
 * actually receives. Size decides giant vs rocky; temperature decides the rest.
 */
export function planetAppearance({ radiusEarth, orbitAu, luminositySuns }) {
  assertPositive(radiusEarth, "Planet appearance requires a positive planet radius in Earth radii");
  const temperature = equilibriumTemperature({ orbitAu, luminositySuns });

  if (radiusEarth >= 6) return { ...PLANET_CLASSES["gas-giant"], temperature };
  if (radiusEarth >= 3.5) return { ...PLANET_CLASSES["ice-giant"], temperature };
  if (radiusEarth >= 2) return { ...PLANET_CLASSES["mini-neptune"], temperature };
  if (temperature >= 700) return { ...PLANET_CLASSES.lava, temperature };
  if (temperature >= 320) return { ...PLANET_CLASSES["warm-rocky"], temperature };
  if (temperature >= 200) return { ...PLANET_CLASSES["temperate-rocky"], temperature };
  return { ...PLANET_CLASSES["frozen-rocky"], temperature };
}

/**
 * Map a real semi-major axis onto a drawable radius. Logarithmic, so a system
 * spanning 0.01 AU to 30 AU still reads on one screen and the real ordering and
 * relative spacing survive. The surface must say that spacing is compressed.
 */
export function compressedOrbitRadius(au, { minimumAu, maximumAu, innerRadius, outerRadius }) {
  assertPositive(au, "Orbit compression requires a positive semi-major axis in AU");
  assertPositive(minimumAu, "Orbit compression requires a positive minimum semi-major axis");
  assertPositive(maximumAu, "Orbit compression requires a positive maximum semi-major axis");
  if (!Number.isFinite(innerRadius) || !Number.isFinite(outerRadius) || outerRadius <= innerRadius) {
    throw new Error("Orbit compression requires an outward drawable band");
  }
  const progress = maximumAu === minimumAu
    ? 0.5
    : (Math.log(au) - Math.log(minimumAu)) / (Math.log(maximumAu) - Math.log(minimumAu));
  return innerRadius + progress * (outerRadius - innerRadius);
}

/**
 * Turn a drawn radius back into a real semi-major axis, inverting
 * `compressedOrbitRadius`. A finger lands on the screen; the world it makes has
 * to land in astronomical units.
 */
export function expandedOrbitAu(radius, { minimumAu, maximumAu, innerRadius, outerRadius }) {
  assertPositive(minimumAu, "Orbit expansion requires a positive minimum semi-major axis");
  assertPositive(maximumAu, "Orbit expansion requires a positive maximum semi-major axis");
  if (!Number.isFinite(radius) || !Number.isFinite(innerRadius)
    || !Number.isFinite(outerRadius) || outerRadius <= innerRadius) {
    throw new Error("Orbit expansion requires a finite drawable band");
  }
  if (minimumAu === maximumAu) return minimumAu;
  const progress = (radius - innerRadius) / (outerRadius - innerRadius);
  return Math.exp(Math.log(minimumAu) + progress * (Math.log(maximumAu) - Math.log(minimumAu)));
}

/**
 * The period a new world would keep at `orbitAu` around a star we know only
 * through one of its own worlds.
 *
 * Kepler's third law says P² is proportional to a³ over the star's mass, so a
 * system that already carries a measured world carries its own constant with
 * it: no stellar mass is needed, and the answer is exact rather than modelled.
 */
export function periodFromReference(orbitAu, reference) {
  assertPositive(orbitAu, "A period needs a positive semi-major axis in AU");
  assertPositive(reference?.orbitAu, "A reference world needs a positive semi-major axis");
  assertPositive(reference?.periodDays, "A reference world needs a positive period");
  return reference.periodDays * (orbitAu / reference.orbitAu) ** 1.5;
}

/**
 * A logarithmic spiral arm: r = r0 · e^(θ · tan i), where i is the measured
 * pitch angle. The Milky Way's arms sit near i = 12°.
 */
export function logSpiralRadius({ innerRadius, pitchAngle, theta }) {
  assertPositive(innerRadius, "A spiral arm requires a positive inner radius");
  if (!Number.isFinite(pitchAngle) || pitchAngle <= 0 || pitchAngle >= 90) {
    throw new Error("A spiral arm requires a pitch angle between 0 and 90 degrees");
  }
  if (!Number.isFinite(theta)) throw new Error("A spiral arm requires a finite angle");
  return innerRadius * Math.exp(theta * Math.tan(pitchAngle * DEGREES));
}

// The Milky Way as measured, normalised to a stellar-disc radius of 1.
// Classification SB(rs)bc; stellar disc about 100,000 light-years across; bar
// half-length about 5 kpc lying some 25-30 degrees off the Sun-centre line;
// disc scale length about 2.6 kpc; arms opening near a 12 degree pitch angle;
// the Sun 26,700 light-years out, in the Orion Spur between Sagittarius-Carina
// and Perseus. Sources: NASA/JPL Milky Way overview, ESA Gaia DR3, Reid et al.
// (2019) VLBI parallax survey of high-mass star-forming regions.
export const MILKY_WAY = Object.freeze({
  id: "milky-way",
  name: "MILKY WAY",
  classification: "SB(rs)bc",
  discRadiusLightYears: 50_000,
  form: "barred-spiral",
  armCount: 4,
  pitchAngle: 12,
  barLength: 0.326,
  barAngle: 0.47,
  bulgeFraction: 0.17,
  bulgeRadius: 0.228,
  scaleLength: 0.17,
  diskThickness: 0.02,
  hiiRate: 0.05,
  haloFraction: 0.035,
  coreColor: 0xffc27a,
  coreStrength: 0.62,
  sunRadius: 0.534,
  sunAngle: 1.05,
  arms: Object.freeze([
    Object.freeze({ id: "perseus", name: "PERSEUS ARM", index: 0 }),
    Object.freeze({ id: "scutum-centaurus", name: "SCUTUM–CENTAURUS ARM", index: 1 }),
    Object.freeze({ id: "sagittarius-carina", name: "SAGITTARIUS–CARINA ARM", index: 2 }),
    Object.freeze({ id: "norma", name: "NORMA ARM", index: 3 }),
  ]),
});

const VOICE_LOWEST = 55;
const VOICE_HIGHEST = 1760;

// The ladder every system is hung on. Two octaves around A3, leaving a full
// octave and a half of register above and below for each system's own span to
// open out into. A system's mean period decides where on this ladder its whole
// chord sits: half a day at the top, two hundred years at the bottom. Those
// bounds are stated rather than taken from the catalogue, so adding a system
// never retunes the ones already there.
const LADDER_LOWEST = 110;
const LADDER_HIGHEST = 440;
const LADDER_FASTEST_SECONDS = 0.5 * 86_400;
const LADDER_SLOWEST_SECONDS = 200 * 365.25 * 86_400;

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

/**
 * Turn a system's real orbital periods into one playable chord.
 *
 * One shared whole-octave transposition moves the whole system into the audible
 * range, so inside a system a slower orbit is always a lower voice and every
 * pitch ratio is exactly the orbital period ratio. Only a system too wide for
 * the register — the Solar System spans nine octaves — has its extremes folded,
 * and folding is always a whole number of octaves, so the interval survives.
 */
/**
 * One world of a system, sounded alone. The pitch is exactly the one that world
 * contributes to its system's chord, so touching seven worlds one at a time and
 * touching the star once are the same music heard two ways.
 */
export function systemWorldVoice({ system, planetId }) {
  const bodies = system?.bodies;
  if (!Array.isArray(bodies) || bodies.length === 0) {
    throw new Error("A system world voice needs a system with bodies");
  }
  const index = bodies.findIndex((body) => body.id === planetId);
  if (index < 0) throw new Error(`${planetId} is not a world of this system`);

  const frequencies = systemVoiceFrequencies(bodies.map((body) => body.periodDays));
  const planet = bodies[index];
  return {
    index,
    planet,
    frequency: frequencies[index],
    appearance: planetAppearance({
      radiusEarth: planet.radiusEarth,
      orbitAu: planet.orbitAu,
      luminositySuns: system.star.luminositySuns,
    }),
  };
}

export function systemVoiceFrequencies(periodsDays) {
  if (!Array.isArray(periodsDays) || periodsDays.length === 0) {
    throw new Error("A system voice needs at least one period");
  }
  const seconds = periodsDays.map((period) => {
    assertPositive(period, "A system voice requires a positive period in days");
    return period * 86_400;
  });

  // One law carries every scale: the bigger and slower a thing is, the deeper
  // it sounds. It has to hold in two directions at once, and for a long time it
  // only held in one.
  //
  // WITHIN a system it holds exactly. The system moves as a block — a uniform
  // shift in log frequency is a transposition, so every ratio survives it, and
  // TRAPPIST-1's published resonance chain arrives as the real chord it is.
  // Folding each voice back into the register one octave at a time is what
  // broke this once: a wrap is not order-preserving, and in THE SUN it put
  // Earth above Venus.
  //
  // BETWEEN systems it did not hold at all. Every system was re-centred on one
  // shared anchor, and re-centring is precisely the operation that deletes the
  // only thing saying how slow the system is. Measured across the catalogue,
  // the rank correlation between a system's mean period and its chord's centre
  // was +0.44 when it should be −1: HR 8799, whose worlds take a hundred and
  // fifty years, sang higher than Kepler-80, whose worlds take four days. And
  // any system too wide for the register was stretched to fill it exactly, so
  // ten of them ran between the identical two notes and were indistinguishable.
  //
  // So the anchor is not a constant. A system's geometric-mean voice is placed
  // on a stated two-octave ladder by its own mean period, and the system is
  // then fitted around that place — keeping its measured intervals whole
  // wherever the register allows, and compressing by one stated logarithmic
  // factor where it cannot. The ladder wins, because the ladder is the law.
  const logs = seconds.map((period) => Math.log2(1 / period));
  const mean = logs.reduce((sum, value) => sum + value, 0) / logs.length;
  const below = mean - Math.min(...logs);
  const above = Math.max(...logs) - mean;

  const meanPeriodLog = seconds.reduce((sum, value) => sum + Math.log2(value), 0) / seconds.length;
  const ladder = clamp01(
    (Math.log2(LADDER_SLOWEST_SECONDS) - meanPeriodLog)
    / (Math.log2(LADDER_SLOWEST_SECONDS) - Math.log2(LADDER_FASTEST_SECONDS)),
  );
  const target = Math.log2(LADDER_LOWEST) + ladder * Math.log2(LADDER_HIGHEST / LADDER_LOWEST);

  const floor = Math.log2(VOICE_LOWEST);
  const ceiling = Math.log2(VOICE_HIGHEST);
  // A hair inside the register rather than exactly on it: a system fitted to
  // the boundary lands its extremes on 55 and 1760 to within floating-point
  // error, and an instrument should not depend on which way that rounds.
  const room = 0.995;
  const squeeze = Math.min(
    1,
    below > 0 ? ((target - floor) * room) / below : 1,
    above > 0 ? ((ceiling - target) * room) / above : 1,
  );

  return logs.map((value) => 2 ** (target + (value - mean) * squeeze));
}
