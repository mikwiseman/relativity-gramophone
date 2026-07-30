// Stars that sing by themselves: objects whose voice is born from their own
// measured oscillation, not from an orbit. A lone pulsar's tick is a literal
// rotation frequency — the one place the instrument multiplies by exactly
// one. (Pulsars and cepheids that HAVE orbiting company are full planetary
// systems in starSystems.js instead — the orbit gives the pitch, the
// oscillation gives the breath.)

/** A pulsar's beam is drawn divided by this factor, and the caption says so. */
export const PULSAR_BEAM_DIVISION = 64;

export const VARIABLE_STARS = Object.freeze([
  Object.freeze({
    id: "psr-j0437",
    name: "PSR J0437−4715",
    distanceLy: 512,
    kind: "pulsar",
    lesson: "THE NEAREST MILLISECOND PULSAR — A LIGHTHOUSE 173.7 TIMES A SECOND",
    voice: "pulsar",
    label: "A LONE PULSAR · TICKS AT 173.7 HZ · MULTIPLIER ×1",
    oscillation: Object.freeze({
      kind: "pulsar",
      frequencyHz: 173.688,
      note: "ROTATION PERIOD 5.7574 MS FROM PULSAR TIMING",
      source: "NICER / Parkes timing, 2024",
    }),
  }),
  Object.freeze({
    id: "vela-pulsar",
    name: "VELA PULSAR",
    distanceLy: 936,
    kind: "pulsar",
    lesson: "THE PULSAR THAT TOLD US NEUTRON STARS ARE BORN IN SUPERNOVAE",
    voice: "pulsar",
    label: "A LONE PULSAR · TICKS AT 11.2 HZ · MULTIPLIER ×1",
    oscillation: Object.freeze({
      kind: "pulsar",
      frequencyHz: 11.19,
      note: "ROTATION PERIOD 89.3 MS — THE OPTICAL PULSAR OF THE VELA SUPERNOVA REMNANT",
      source: "ATNF pulsar catalogue",
    }),
  }),
  Object.freeze({
    id: "delta-cephei",
    name: "DELTA CEPHEI",
    distanceLy: 887,
    kind: "cepheid",
    lesson: "THE PROTOTYPE OF THE LADDER HUMANITY MEASURED THE UNIVERSE WITH",
    voice: "cepheid",
    label: "THE FIRST CEPHEID · BREATHES EVERY 5.37 DAYS",
    oscillation: Object.freeze({
      kind: "cepheid",
      periodDays: 5.3663,
      curve: Object.freeze([[0, 0.08], [0.16, 1], [0.48, 0.44], [0.78, 0.2], [1, 0.08]]),
      amplitude: 0.5,
      note: "PHOTOMETRIC LIGHT CURVE, TIME COMPRESSED ×8640 AND SAID SO",
      source: "Gaia DR3 / AAVSO photometry",
    }),
  }),
  Object.freeze({
    id: "rr-lyrae",
    name: "RR LYRAE",
    distanceLy: 855,
    kind: "cepheid",
    lesson: "THE STANDARD CANDLE OF THE OLD STARS, BEATING TWICE A DAY",
    voice: "cepheid",
    label: "THE FIRST RR LYRAE · BREATHES EVERY 13.6 HOURS",
    oscillation: Object.freeze({
      kind: "cepheid",
      periodDays: 0.5668,
      curve: Object.freeze([[0, 0.1], [0.1, 1], [0.45, 0.5], [0.8, 0.22], [1, 0.1]]),
      amplitude: 0.5,
      note: "PHOTOMETRIC LIGHT CURVE, TIME COMPRESSED ×8640 AND SAID SO",
      source: "Gaia DR3 / AAVSO photometry",
    }),
  }),
]);

export const VARIABLE_STARS_BY_ID = Object.freeze(new Map(
  VARIABLE_STARS.map((star) => [star.id, star]),
));
