// Procedural galaxies built from the structure real galaxies actually have:
// an exponential disc, logarithmic-spiral arms opening at a measured pitch
// angle, a boxy bar, a centrally concentrated bulge of old red stars, young
// blue stars crowded onto the arm ridges, pink HII regions where those stars
// are being born, and a sparse old halo.
//
// Coordinates come out normalised to a disc radius of 1, in the XZ plane with Y
// as galactic height, so a caller can scale and tilt them to any real size.

import { gaussianFrom, seededRandom, stringSeed } from "./seededRandom.js";
import { logSpiralRadius } from "./cosmicAtlas.js";

export const GALAXY_FORMS = Object.freeze([
  "spiral",
  "barred-spiral",
  "lenticular",
  "elliptical",
  "irregular",
  "dwarf-spheroidal",
]);

// Populations, in the colours real broadband imagery records.
// Bulge #F7E1B5: old K/M giants, B-V about 0.9-1.0.
// Inter-arm disc #E8E4D8: a mixed-age G/K population.
// Arm ridge #A8C0FF: O/B stars of 10,000-30,000 K that die before they can
//   drift out of the arm, which is why arms are blue at all.
// HII #FF79AF: Balmer recombination reddened by dust.
// Halo #FFEDD4: the oldest, most metal-poor stars, with no gas and no blue.
const OLD_DISC = [0.91, 0.894, 0.847];
const BULGE = [0.969, 0.882, 0.71];
const YOUNG_ARM = [0.659, 0.753, 1];
const HII = [1, 0.475, 0.686];
const HALO = [1, 0.929, 0.831];

function writeColor(target, index, [red, green, blue], brightness) {
  target[index * 3] = Math.min(1, red * brightness);
  target[index * 3 + 1] = Math.min(1, green * brightness);
  target[index * 3 + 2] = Math.min(1, blue * brightness);
}

function writePosition(target, index, x, y, z) {
  target[index * 3] = x;
  target[index * 3 + 1] = y;
  target[index * 3 + 2] = z;
}

function normalizeSpec(spec) {
  if (!GALAXY_FORMS.includes(spec?.form)) {
    throw new Error(`Unknown galaxy form: ${spec?.form}`);
  }
  const barred = spec.form === "barred-spiral" && spec.barLength > 0;
  const spiralArms = spec.form === "spiral" || spec.form === "barred-spiral";
  if (spiralArms && (!Number.isFinite(spec.pitchAngle) || spec.pitchAngle <= 0 || spec.pitchAngle >= 90)) {
    throw new Error("A spiral galaxy needs a pitch angle between 0 and 90 degrees");
  }
  return {
    form: spec.form,
    barred,
    spiralArms,
    armCount: Math.max(1, Math.round(spec.armCount ?? 2)),
    pitchAngle: spec.pitchAngle ?? 12,
    barLength: barred ? spec.barLength : 0,
    barAngle: spec.barAngle ?? 0,
    bulgeFraction: Math.min(0.95, Math.max(0, spec.bulgeFraction ?? 0.16)),
    bulgeRadius: spec.bulgeRadius ?? 0.2,
    scaleLength: spec.scaleLength ?? 0.3,
    diskThickness: spec.diskThickness ?? 0.035,
    axisRatio: spec.axisRatio ?? 0.7,
    hiiRate: spec.hiiRate ?? 0.035,
    haloFraction: spec.haloFraction ?? 0.03,
    clumpCount: spec.clumpCount ?? 4,
  };
}

function spheroidPoint(random, radius, flattening) {
  const cosine = random() * 2 - 1;
  const sine = Math.sqrt(Math.max(0, 1 - cosine * cosine));
  const angle = random() * Math.PI * 2;
  return {
    x: radius * sine * Math.cos(angle),
    y: radius * cosine * flattening,
    z: radius * sine * Math.sin(angle),
  };
}

function buildSpheroid(spec, count, positions, colors, sizes, random, offset, options) {
  const { concentration, maxRadius, flattening, palette, sizeScale } = options;
  for (let index = 0; index < count; index += 1) {
    const target = offset + index;
    const fraction = random() ** concentration;
    const radius = fraction * maxRadius;
    const point = spheroidPoint(random, radius, flattening);
    writePosition(positions, target, point.x, point.y, point.z);
    // Old spheroids redden inward, so brightness falls with radius, never colour.
    writeColor(colors, target, palette, 0.55 + (1 - fraction) * 0.45);
    sizes[target] = sizeScale * (0.7 + random() * 0.7);
  }
}

/**
 * Where the arms start and how fast they open. In a barred galaxy the arms
 * spring from the ends of the bar, which is why an SB galaxy has a swept-clear
 * inner disc; an unbarred disc reaches almost to the bulge.
 */
export function galaxyArmGeometry(spec) {
  const resolved = normalizeSpec(spec);
  return {
    innerRadius: Math.max(0.06, resolved.barred ? resolved.barLength : resolved.bulgeRadius * 0.5),
    tangent: Math.tan((resolved.pitchAngle * Math.PI) / 180),
    armSpacing: (Math.PI * 2) / resolved.armCount,
  };
}

function buildDisc(spec, count, positions, colors, sizes, random, offset) {
  const { armSpacing, tangent, innerRadius } = galaxyArmGeometry(spec);

  // An exponential disc truncated to [innerRadius, 1] and sampled by its exact
  // inverse CDF. Clamping instead would pile a hard bright ring onto both edges.
  const span = 1 - innerRadius;
  const cumulativeMax = 1 - Math.exp(-span / spec.scaleLength);

  for (let index = 0; index < count; index += 1) {
    const target = offset + index;
    const radius = innerRadius - spec.scaleLength * Math.log(1 - random() * cumulativeMax);

    let angle;
    let onArm = false;
    if (spec.spiralArms) {
      const armIndex = Math.floor(random() * spec.armCount);
      const armAngle = Math.log(radius / innerRadius) / tangent + armIndex * armSpacing;
      // An arm keeps a roughly constant physical width, so its angular width
      // narrows outward even as the arm itself grows more ragged.
      const spread = 0.07 / radius + 0.1;
      const scatter = gaussianFrom(random);
      angle = armAngle + scatter * spread;
      onArm = Math.abs(scatter) < 0.75;
    } else {
      angle = random() * Math.PI * 2;
    }

    const height = gaussianFrom(random) * spec.diskThickness * (0.6 + radius * 0.9);
    writePosition(
      positions,
      target,
      Math.cos(angle) * radius,
      height,
      Math.sin(angle) * radius,
    );

    if (onArm && random() < spec.hiiRate) {
      writeColor(colors, target, HII, 0.9 + random() * 0.1);
      sizes[target] = 2.6 + random() * 1.8;
    } else if (onArm) {
      writeColor(colors, target, YOUNG_ARM, 0.7 + random() * 0.3);
      sizes[target] = 1 + random() * 0.9;
    } else {
      writeColor(colors, target, OLD_DISC, 0.38 + random() * 0.34);
      sizes[target] = 0.75 + random() * 0.6;
    }
  }
}

function buildBar(spec, count, positions, colors, sizes, random, offset) {
  const cosine = Math.cos(spec.barAngle);
  const sine = Math.sin(spec.barAngle);
  for (let index = 0; index < count; index += 1) {
    const target = offset + index;
    // A boxy bar: nearly uniform along its length, narrow across it.
    const along = (random() * 2 - 1) * spec.barLength;
    const across = gaussianFrom(random) * spec.barLength * 0.16;
    const height = gaussianFrom(random) * spec.barLength * 0.1;
    writePosition(
      positions,
      target,
      along * cosine - across * sine,
      height,
      along * sine + across * cosine,
    );
    writeColor(colors, target, BULGE, 0.5 + random() * 0.42);
    sizes[target] = 0.85 + random() * 0.7;
  }
}

function buildHalo(spec, count, positions, colors, sizes, random, offset) {
  for (let index = 0; index < count; index += 1) {
    const target = offset + index;
    const radius = 0.35 + random() ** 0.6 * 0.95;
    const point = spheroidPoint(random, radius, 0.92);
    writePosition(positions, target, point.x, point.y, point.z);
    writeColor(colors, target, HALO, 0.32 + random() * 0.3);
    sizes[target] = 0.8 + random() * 1.4;
  }
}

function buildIrregular(spec, count, positions, colors, sizes, random, offset) {
  const clumps = [];
  for (let index = 0; index < spec.clumpCount; index += 1) {
    clumps.push({
      x: (random() * 2 - 1) * 0.5,
      z: (random() * 2 - 1) * 0.5,
      spread: 0.18 + random() * 0.26,
      starForming: index === 0 || random() < 0.35,
    });
  }
  for (let index = 0; index < count; index += 1) {
    const target = offset + index;
    const clump = clumps[Math.floor(random() * clumps.length)];
    const x = clump.x + gaussianFrom(random) * clump.spread;
    const z = clump.z + gaussianFrom(random) * clump.spread;
    const y = gaussianFrom(random) * 0.09;
    const radius = Math.hypot(x, z);
    const scale = radius > 1 ? 1 / radius : 1;
    writePosition(positions, target, x * scale, y, z * scale);

    if (clump.starForming && random() < 0.06) {
      writeColor(colors, target, HII, 0.85 + random() * 0.15);
      sizes[target] = 2.4 + random() * 2;
    } else if (clump.starForming) {
      writeColor(colors, target, YOUNG_ARM, 0.6 + random() * 0.4);
      sizes[target] = 1 + random();
    } else {
      writeColor(colors, target, OLD_DISC, 0.35 + random() * 0.35);
      sizes[target] = 0.8 + random() * 0.6;
    }
  }
}

/**
 * Build one galaxy as a point cloud.
 *
 * @param spec  form, arm count, pitch angle, bar and bulge geometry
 * @param options.starCount  how many points to spend on it
 * @param options.seed  any string; the same seed always draws the same galaxy
 */
function shuffleCloud(positions, colors, sizes, random) {
  // Populations are generated in blocks. Shuffling makes any prefix of the
  // cloud a fair sample of the whole galaxy, so lowering the point budget on a
  // phone thins the galaxy evenly instead of deleting its halo and its arms.
  for (let index = sizes.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    if (swap === index) continue;
    for (let axis = 0; axis < 3; axis += 1) {
      const here = index * 3 + axis;
      const there = swap * 3 + axis;
      [positions[here], positions[there]] = [positions[there], positions[here]];
      [colors[here], colors[there]] = [colors[there], colors[here]];
    }
    [sizes[index], sizes[swap]] = [sizes[swap], sizes[index]];
  }
}

export function buildGalaxyCloud(spec, { starCount, seed }) {
  if (!Number.isInteger(starCount) || starCount < 1) {
    throw new Error("A galaxy needs at least one star");
  }
  const resolved = normalizeSpec(spec);
  const random = seededRandom(stringSeed(String(seed)));

  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);
  const sizes = new Float32Array(starCount);

  if (resolved.form === "elliptical" || resolved.form === "dwarf-spheroidal") {
    const halo = Math.round(starCount * resolved.haloFraction);
    const body = starCount - halo;
    buildSpheroid(resolved, body, positions, colors, sizes, random, 0, {
      // r ∝ u² concentrates light steeply inward, the way a de Vaucouleurs
      // profile does, without pretending to be a fit.
      concentration: resolved.form === "elliptical" ? 2 : 1.2,
      maxRadius: 1,
      flattening: resolved.axisRatio,
      palette: resolved.form === "elliptical" ? BULGE : HALO,
      sizeScale: resolved.form === "elliptical" ? 1 : 0.9,
    });
    buildHalo(resolved, halo, positions, colors, sizes, random, body);
    shuffleCloud(positions, colors, sizes, random);
    return { positions, colors, sizes };
  }

  if (resolved.form === "irregular") {
    buildIrregular(resolved, starCount, positions, colors, sizes, random, 0);
    shuffleCloud(positions, colors, sizes, random);
    return { positions, colors, sizes };
  }

  const haloCount = Math.round(starCount * resolved.haloFraction);
  const bulgeCount = Math.round(starCount * resolved.bulgeFraction);
  const barCount = resolved.barred ? Math.round(starCount * 0.16) : 0;
  const discCount = starCount - haloCount - bulgeCount - barCount;

  buildSpheroid(resolved, bulgeCount, positions, colors, sizes, random, 0, {
    concentration: 2,
    maxRadius: resolved.bulgeRadius,
    flattening: 0.72,
    palette: BULGE,
    sizeScale: 1,
  });
  buildBar(resolved, barCount, positions, colors, sizes, random, bulgeCount);
  buildDisc(resolved, discCount, positions, colors, sizes, random, bulgeCount + barCount);
  buildHalo(resolved, haloCount, positions, colors, sizes, random, bulgeCount + barCount + discCount);
  shuffleCloud(positions, colors, sizes, random);

  return { positions, colors, sizes };
}

/**
 * A galaxy cluster: many small galaxies of mixed morphology scattered through a
 * centrally concentrated spheroid, with the brightest cluster galaxies — the
 * supergiant ellipticals that really do sit at cluster centres — placed first
 * and drawn largest. Merged into one cloud so a whole cluster costs one draw.
 */
export function buildClusterCloud({ memberCount, starsPerMember, seed, axisRatio = 0.78 }) {
  if (!Number.isInteger(memberCount) || memberCount < 1) {
    throw new Error("A cluster needs at least one member galaxy");
  }
  if (!Number.isInteger(starsPerMember) || starsPerMember < 1) {
    throw new Error("A cluster member needs at least one star");
  }
  const random = seededRandom(stringSeed(`${seed}-cluster`));
  const total = memberCount * starsPerMember;
  const positions = new Float32Array(total * 3);
  const colors = new Float32Array(total * 3);
  const sizes = new Float32Array(total);

  for (let member = 0; member < memberCount; member += 1) {
    // Cluster cores are elliptical-dominated; spirals live in the outskirts.
    const central = member < 2;
    const distance = central ? random() * 0.12 : random() ** 0.55;
    const form = central || random() < 0.55 ? "elliptical" : random() < 0.6 ? "spiral" : "irregular";
    const cloud = buildGalaxyCloud(
      {
        form,
        armCount: 2,
        pitchAngle: 10 + random() * 14,
        barLength: 0,
        bulgeFraction: 0.24,
        bulgeRadius: 0.24,
        scaleLength: 0.3,
        diskThickness: 0.05,
        axisRatio: 0.55 + random() * 0.35,
        hiiRate: 0.03,
        haloFraction: 0.02,
        clumpCount: 3,
      },
      { starCount: starsPerMember, seed: `${seed}-${member}` },
    );

    const centre = spheroidPoint(random, distance, axisRatio);
    const memberScale = (central ? 0.3 : 0.07 + random() * 0.12);
    const tilt = random() * Math.PI;
    const cosine = Math.cos(tilt);
    const sine = Math.sin(tilt);

    for (let index = 0; index < starsPerMember; index += 1) {
      const target = member * starsPerMember + index;
      const x = cloud.positions[index * 3] * memberScale;
      const y = cloud.positions[index * 3 + 1] * memberScale;
      const z = cloud.positions[index * 3 + 2] * memberScale;
      writePosition(
        positions,
        target,
        centre.x + x * cosine - y * sine,
        centre.y + x * sine + y * cosine,
        centre.z + z,
      );
      colors[target * 3] = cloud.colors[index * 3];
      colors[target * 3 + 1] = cloud.colors[index * 3 + 1];
      colors[target * 3 + 2] = cloud.colors[index * 3 + 2];
      sizes[target] = cloud.sizes[index] * (central ? 1.25 : 0.85);
    }
  }

  shuffleCloud(positions, colors, sizes, random);
  return { positions, colors, sizes };
}

export { logSpiralRadius };
