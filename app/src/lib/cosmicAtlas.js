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

const VOICE_ANCHOR = 220;
const VOICE_LOWEST = 55;
const VOICE_HIGHEST = 1760;

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

  const meanLogFrequency = seconds
    .reduce((total, period) => total + Math.log2(1 / period), 0) / seconds.length;
  const sharedShift = Math.round(Math.log2(VOICE_ANCHOR) - meanLogFrequency);

  return seconds.map((period) => {
    let frequency = (1 / period) * 2 ** sharedShift;
    while (frequency > VOICE_HIGHEST) frequency /= 2;
    while (frequency < VOICE_LOWEST) frequency *= 2;
    return frequency;
  });
}
