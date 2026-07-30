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

/**
 * The mass a world of a given radius is expected to have, when nobody has
 * weighed it.
 *
 * The inverse of `radiusFromMass`, and only where that relation is actually
 * invertible. Chen & Kipping's mean radius rises to about 14.3 Earth radii at
 * the Jovian break and then *falls*, so a radius above that break names no
 * single mass at all — an inflated hot Jupiter and a brown dwarf sit on the
 * same line. Rather than pick one and call it knowledge, anything that wide is
 * given the mass at the break and the surface records the answer as inferred.
 */
export const JOVIAN_BREAK_MASS = 131.6;
export const JOVIAN_BREAK_RADIUS = 14.31;

export function massFromRadius(radiusEarth) {
  assertPositive(radiusEarth, "A forecast mass requires a positive radius in Earth radii");
  if (radiusEarth < 1.232) return (radiusEarth / 1.008) ** (1 / 0.279);
  if (radiusEarth < JOVIAN_BREAK_RADIUS) return (radiusEarth / 0.808) ** (1 / 0.589);
  return JOVIAN_BREAK_MASS;
}

/**
 * The Hill radius of a world in astronomical units — the distance out to which
 * its own gravity, not its star's, decides what orbits it. Everything a moon
 * can be is inside this, and about a third of it in practice, because orbits
 * near the edge are not stable over the long run.
 */
export function hillRadiusAu({ orbitAu, massEarth, starMassSuns, eccentricity = 0 }) {
  assertPositive(orbitAu, "A Hill radius requires a positive semi-major axis in AU");
  assertPositive(massEarth, "A Hill radius requires a positive planet mass in Earth masses");
  assertPositive(starMassSuns, "A Hill radius requires a positive stellar mass in solar masses");
  if (!Number.isFinite(eccentricity) || eccentricity < 0 || eccentricity >= 1) {
    throw new Error("Eccentricity must sit between 0 and 1");
  }
  const massRatio = (massEarth / 332_946) / (3 * starMassSuns);
  return orbitAu * (1 - eccentricity) * Math.cbrt(massRatio);
}

/** Earth radii in one astronomical unit. */
export const EARTH_RADII_PER_AU = 23_481.4;

/**
 * The band a moon can actually live in, around one world.
 *
 * Bounded below by the world itself — an orbit inside the surface is not an
 * orbit — and above by a third of the Hill radius, past which the star pulls a
 * moon away over time. Some worlds have no band at all: 55 Cancri e orbits its
 * star in eighteen hours, and its Hill sphere is barely wider than the planet,
 * so nothing can go round it. That is a fact about that world, and the gesture
 * says so rather than inventing a moon inside a planet.
 */
export function moonBand({ hillAu, radiusEarth }) {
  assertPositive(hillAu, "A moon band needs a positive Hill radius");
  assertPositive(radiusEarth, "A moon band needs the world's radius");
  const surfaceAu = radiusEarth / EARTH_RADII_PER_AU;
  const inner = Math.max(surfaceAu * 1.6, hillAu * 0.1);
  const outer = hillAu * 0.35;
  return { inner, outer, possible: outer > inner };
}

/**
 * The period, in days, of a moon at `moonAu` from a world of `massEarth`.
 * Kepler's third law again, about the world instead of about the star.
 */
export function moonPeriodDays({ moonAu, massEarth }) {
  assertPositive(moonAu, "A moon needs a positive orbit in AU");
  assertPositive(massEarth, "A moon needs a parent with a positive mass");
  return 365.25 * Math.sqrt(moonAu ** 3 / (massEarth / 332_946));
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
/**
 * How far past the outermost measured orbit a player may reach, and how much
 * further out in astronomical units that buys.
 *
 * Outside the measured system the logarithmic map has nothing left to compress
 * and simply runs away with itself: in the Solar System, dragging 28 per cent
 * past Neptune's ring landed a world at 157 AU, five times further out than
 * Neptune for a quarter more finger travel — and then it stopped dead, because
 * the reach was clamped there. So the tail is linear instead: the last stretch
 * of the drag runs evenly from the outermost measured orbit to eight times it,
 * which is predictable to a hand and lets a world be put properly far away.
 */
export const OUTER_REACH = 1.55;
export const OUTER_REACH_AU = 8;

export function compressedOrbitRadius(au, { minimumAu, maximumAu, innerRadius, outerRadius }) {
  assertPositive(au, "Orbit compression requires a positive semi-major axis in AU");
  assertPositive(minimumAu, "Orbit compression requires a positive minimum semi-major axis");
  assertPositive(maximumAu, "Orbit compression requires a positive maximum semi-major axis");
  if (!Number.isFinite(innerRadius) || !Number.isFinite(outerRadius) || outerRadius <= innerRadius) {
    throw new Error("Orbit compression requires an outward drawable band");
  }
  if (au > maximumAu && maximumAu > minimumAu) {
    const beyond = Math.min(1, (au - maximumAu) / (maximumAu * (OUTER_REACH_AU - 1)));
    return outerRadius + beyond * (outerRadius * OUTER_REACH - outerRadius);
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
  if (radius > outerRadius) {
    const beyond = Math.min(1, (radius - outerRadius) / (outerRadius * (OUTER_REACH - 1)));
    return maximumAu + beyond * maximumAu * (OUTER_REACH_AU - 1);
  }
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
// A billion years, because the instrument now holds things that take one. A
// planet's year is days, a star's orbit round a globular cluster is millions
// of years, and the Sun's lap of the Milky Way is 219 million. All of them
// hang on this one ladder, so it has to be long enough to hold all of them —
// stopping it at two hundred years pinned every cluster and every galaxy onto
// the same bottom rung and made them indistinguishable.
const LADDER_SLOWEST_SECONDS = 2e10 * 365.25 * 86_400;

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

/**
 * The measured brightness of a pulsating star at one phase of its cycle.
 * Curves are stored as [phase, luminosity] knots of the real photometry and
 * read by linear interpolation — never smoothed into a sine, because a
 * cepheid's fast rise and slow fall is the whole story.
 */
export function sampleLightCurve(curve, phase) {
  if (!Array.isArray(curve) || curve.length < 2) {
    throw new Error("A light curve needs at least two measured knots");
  }
  const wrapped = ((phase % 1) + 1) % 1;
  for (let index = 1; index < curve.length; index += 1) {
    const [x1, y1] = curve[index - 1];
    const [x2, y2] = curve[index];
    if (wrapped > x2) continue;
    const span = x2 - x1;
    const local = span > 0 ? (wrapped - x1) / span : 0;
    return y1 + (y2 - y1) * local;
  }
  return curve[curve.length - 1][1];
}

/**
 * The one stated time compression every light curve breathes by: one day of
 * the star's life plays as ten seconds of yours. Picked once, shown to the
 * listener, and applied to every cepheid alike.
 */
export const LIGHTCURVE_TIME_COMPRESSION = 8640;

/** Seconds one breath of a pulsating star takes on the listener's clock. */
export function lightCurveBreathSeconds(periodDays) {
  assertPositive(periodDays, "A light-curve breath requires a positive period in days");
  return (periodDays * 86_400) / LIGHTCURVE_TIME_COMPRESSION;
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

/**
 * The fit every voice of one system shares: where on the ladder the system's
 * centre sits, where its own mean is, and how hard its span was squeezed into
 * the register. Worlds are pitched through it, and so are the moons hung on
 * those worlds — one mapping, so a moon and its parents speak the same law.
 */
export function systemVoiceFit(periodsDays) {
  if (!Array.isArray(periodsDays) || periodsDays.length === 0) {
    throw new Error("A system voice needs at least one period");
  }
  return voiceFitFromSeconds(periodsDays.map((period) => {
    assertPositive(period, "A system voice requires a positive period in days");
    return period * 86_400;
  }));
}

export function systemVoiceFrequencies(periodsDays) {
  const fit = systemVoiceFit(periodsDays);
  return periodsDays.map((period) => {
    assertPositive(period, "A system voice requires a positive period in days");
    return 2 ** (fit.target + (Math.log2(1 / (period * 86_400)) - fit.mean) * fit.squeeze);
  });
}

/**
 * The voice of a moon hung on a world of a system you travelled to.
 *
 * At home a moon's pitch is its own orbital period, and the parents do not
 * retune when it arrives — so out here the moon is read through the system's
 * own fit, which is computed from the WORLDS alone and never re-made by the
 * moon. A moon's period is hours where its parents' are days, so it can land
 * above the register; folding it back by whole octaves is the only move that
 * keeps every interval it makes honest.
 */
export function systemMoonFrequency({ systemPeriodsDays, moonPeriodDays }) {
  const fit = systemVoiceFit(systemPeriodsDays);
  assertPositive(moonPeriodDays, "A moon voice requires a positive period in days");
  let frequency = 2 ** (fit.target
    + (Math.log2(1 / (moonPeriodDays * 86_400)) - fit.mean) * fit.squeeze);
  while (frequency > VOICE_HIGHEST) frequency /= 2;
  while (frequency < VOICE_LOWEST) frequency *= 2;
  return frequency;
}

/**
 * The landmark as it actually is once the player has put worlds of their own
 * into it: the measured bodies plus the guest worlds, in period order, so the
 * chord, a world's solo voice and the pitch a drag previews all come from one
 * list. The measured landmark itself is never mutated.
 */
export function withGuestWorlds(landmark, guestWorlds = []) {
  if (!landmark?.system || !Array.isArray(guestWorlds) || guestWorlds.length === 0) {
    return landmark;
  }
  const bodies = [...landmark.system.bodies, ...guestWorlds]
    .sort((first, second) => first.periodDays - second.periodDays);
  return { ...landmark, system: { ...landmark.system, bodies } };
}

function voiceFitFromSeconds(seconds) {

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

  return { target, mean, squeeze };
}
