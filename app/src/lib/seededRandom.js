// Deterministic noise, so the same galaxy is drawn the same way every session
// and a shared score never renders a different sky for the recipient.

export function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

export function stringSeed(value) {
  let seed = 2166136261;
  for (const character of value) {
    seed ^= character.codePointAt(0);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

/** Box–Muller, for the Gaussian scatter that gives spiral arms their real width. */
export function gaussianFrom(random) {
  const first = Math.max(1e-9, random());
  const second = random();
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}
