/**
 * A galaxy you can travel into and play.
 *
 * The Local Group was four lights you could touch for a note. You cannot enter
 * Andromeda the way you enter TRAPPIST-1 — nobody has catalogued a planet
 * there and inventing one is out of the question — but you do not have to.
 * A galaxy is already a thing that turns, and how fast it turns at each radius
 * has been measured for a century. That is a year, and a year is a pitch, and
 * that is the whole instrument.
 *
 * The physics is not Kepler's, and that is the point. Inside a planetary
 * system almost all the mass is the star, so a wider orbit is a much slower
 * one. A galaxy's rotation curve is flat: beyond the bulge, stars all move at
 * roughly the same speed however far out they are, which is the single
 * observation that told us dark matter is there. So the period is simply the
 * circumference divided by that speed —
 *
 *     P = 2 pi R / v
 *
 * — and a galaxy's chord is an arithmetic ladder rather than Kepler's. It
 * sounds different from a planetary system because it *is* different, and the
 * instrument's one law still carries it: the Sun takes 228 million years to go
 * round once, so a galaxy is the deepest voice there is.
 *
 * SOURCES. Rotation speeds and optical radii are the standard published
 * values: Eilers et al. (2019) for the Milky Way's circular velocity and
 * GRAVITY Collaboration (2019) for the Sun's distance from the centre; Carignan
 * et al. (2006) for M31; Corbelli & Salucci (2000) for M33; van der Marel &
 * Kallivayalil (2014) for the LMC. Each galaxy carries its own source.
 */

/** Years taken to go once round at `radiusKpc` moving at `speedKmS`. */
export const GALACTIC_YEAR_CONSTANT = 6.143_6e9;

export function rotationPeriodYears({ radiusKpc, speedKmS }) {
  if (!Number.isFinite(radiusKpc) || radiusKpc <= 0) {
    throw new Error("A galactic orbit needs a positive radius in kiloparsecs");
  }
  if (!Number.isFinite(speedKmS) || speedKmS <= 0) {
    throw new Error("A galactic orbit needs a positive rotation speed");
  }
  return (GALACTIC_YEAR_CONSTANT * radiusKpc) / speedKmS;
}

/**
 * Where a galaxy is read. Seven rings from the bulge out past the visible edge,
 * as fractions of the optical radius — the compression is stated, the ordering
 * and the ratios are exact.
 */
export const GALAXY_RING_FRACTIONS = Object.freeze([0.12, 0.24, 0.42, 0.64, 0.9, 1.24, 1.7]);

const GALAXY_RING_NAMES = Object.freeze([
  "BULGE", "INNER DISC", "MID DISC", "HALF-LIGHT", "OUTER DISC", "RIM", "HALO",
]);

const PARSECS_PER_KPC_IN_AU = 206_264_806;

/**
 * A galaxy in the same shape a planetary system has, so every gesture the
 * instrument already knows works inside one.
 */
export function buildGalaxy(galaxy) {
  const bodies = GALAXY_RING_FRACTIONS.map((fraction, index) => {
    const radiusKpc = galaxy.opticalRadiusKpc * fraction;
    const years = rotationPeriodYears({ radiusKpc, speedKmS: galaxy.rotationKmS });
    return Object.freeze({
      id: `${galaxy.id}-${GALAXY_RING_NAMES[index].toLowerCase().replace(/\s+/gu, "-")}`,
      name: `${galaxy.name} ${GALAXY_RING_NAMES[index]}`,
      kind: "planet",
      periodDays: years * 365.25,
      orbitAu: radiusKpc * PARSECS_PER_KPC_IN_AU,
      radiusEarth: 7 + index * 2.2,
      eccentricity: 0,
      shell: GALAXY_RING_NAMES[index],
      radiusKpc,
    });
  });

  const sunRing = galaxy.sunRadiusKpc
    ? rotationPeriodYears({ radiusKpc: galaxy.sunRadiusKpc, speedKmS: galaxy.rotationKmS })
    : null;

  return Object.freeze({
    ...galaxy,
    label: sunRing
      ? `${galaxy.rotationKmS} KM/S · OUR OWN LAP TAKES ${Math.round(sunRing / 1e6)} MILLION YEARS`
      : `${galaxy.rotationKmS} KM/S · ${Math.round(
        rotationPeriodYears({ radiusKpc: galaxy.opticalRadiusKpc, speedKmS: galaxy.rotationKmS }) / 1e6,
      )} MILLION YEARS AT THE RIM`,
    star: Object.freeze({
      name: galaxy.name,
      spectralType: "GALAXY",
      temperature: galaxy.coreTemperature,
      radiusSolar: 1.6,
      luminositySuns: 1,
    }),
    bodies: Object.freeze(bodies),
  });
}

const MEASURED_GALAXIES = Object.freeze([
  Object.freeze({
    id: "milky-way",
    name: "MILKY WAY",
    kind: "galaxy",
    distanceLy: 0,
    // Eilers et al. 2019 measure 229 km/s at the Sun; GRAVITY 2019 puts the Sun
    // 8.178 kpc from the centre. Between them they say our lap is 228 Myr.
    rotationKmS: 229,
    opticalRadiusKpc: 15,
    sunRadiusKpc: 8.178,
    coreTemperature: 4_600,
    voice: "trautonium",
    lesson: "WE LIVE INSIDE IT, SO NOBODY CAN PHOTOGRAPH IT FROM OUTSIDE",
    source: "Eilers et al. 2019; GRAVITY Collaboration 2019",
  }),
  Object.freeze({
    id: "andromeda",
    name: "ANDROMEDA",
    kind: "galaxy",
    distanceLy: 2_537_000,
    rotationKmS: 250,
    opticalRadiusKpc: 20,
    coreTemperature: 4_400,
    voice: "ondes",
    lesson: "IN YOUR SKY IT IS SIX TIMES WIDER THAN THE FULL MOON",
    source: "Carignan, Chemin, Huchtmeier & Lockman 2006 (HI rotation curve)",
  }),
  Object.freeze({
    id: "triangulum",
    name: "TRIANGULUM",
    kind: "galaxy",
    distanceLy: 2_723_000,
    rotationKmS: 110,
    opticalRadiusKpc: 9,
    coreTemperature: 5_400,
    voice: "theremin",
    lesson: "THE FARTHEST THING A HUMAN EYE CAN SEE WITHOUT A TELESCOPE",
    source: "Corbelli & Salucci 2000 (rotation curve to 16 kpc)",
  }),
  Object.freeze({
    id: "magellanic-clouds",
    name: "THE MAGELLANIC CLOUDS",
    kind: "galaxy",
    distanceLy: 163_000,
    // van der Marel & Kallivayalil 2014, from HST proper motions of the LMC.
    rotationKmS: 92,
    opticalRadiusKpc: 4.2,
    coreTemperature: 6_200,
    voice: "earth",
    lesson: "A BOUND PAIR FALLING TOGETHER, TRAILING A RIBBON OF GAS",
    source: "van der Marel & Kallivayalil 2014 (HST proper motions)",
  }),
]);

export const GALAXIES = Object.freeze(MEASURED_GALAXIES.map(buildGalaxy));
export const GALAXIES_BY_ID = Object.freeze(new Map(GALAXIES.map((galaxy) => [galaxy.id, galaxy])));
