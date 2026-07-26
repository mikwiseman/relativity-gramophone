import test from "node:test";
import assert from "node:assert/strict";

import { GALAXY_FORMS, buildGalaxyCloud, galaxyArmGeometry } from "./galaxyShape.js";

const SPIRAL = Object.freeze({
  form: "barred-spiral",
  armCount: 4,
  pitchAngle: 12,
  barLength: 0.34,
  barAngle: 0.4,
  bulgeFraction: 0.18,
  bulgeRadius: 0.22,
  scaleLength: 0.3,
  diskThickness: 0.035,
});

function radiusOf(positions, index) {
  const x = positions[index * 3];
  const z = positions[index * 3 + 2];
  return Math.hypot(x, z);
}

test("every listed galaxy form builds a bounded, finite cloud", () => {
  for (const form of GALAXY_FORMS) {
    const cloud = buildGalaxyCloud({ ...SPIRAL, form }, { starCount: 800, seed: "test" });
    assert.equal(cloud.positions.length, 800 * 3);
    assert.equal(cloud.colors.length, 800 * 3);
    assert.equal(cloud.sizes.length, 800);
    assert.ok(cloud.positions.every(Number.isFinite), `${form} produced a non-finite coordinate`);
    assert.ok(cloud.colors.every((value) => value >= 0 && value <= 1), `${form} produced a colour outside 0..1`);
    assert.ok(cloud.sizes.every((size) => size > 0), `${form} produced a non-positive point size`);
    for (let index = 0; index < 800; index += 1) {
      assert.ok(radiusOf(cloud.positions, index) <= 1.35, `${form} escaped its disc radius`);
    }
  }
});

test("the same seed always draws the same galaxy", () => {
  const first = buildGalaxyCloud(SPIRAL, { starCount: 300, seed: "andromeda" });
  const second = buildGalaxyCloud(SPIRAL, { starCount: 300, seed: "andromeda" });
  const other = buildGalaxyCloud(SPIRAL, { starCount: 300, seed: "triangulum" });

  assert.deepEqual(Array.from(first.positions), Array.from(second.positions));
  assert.notDeepEqual(Array.from(first.positions), Array.from(other.positions));
});

test("spiral stars really gather onto arms instead of spreading evenly", () => {
  const spiral = buildGalaxyCloud(SPIRAL, { starCount: 4000, seed: "arms" });
  const smooth = buildGalaxyCloud(
    { ...SPIRAL, form: "elliptical" },
    { starCount: 4000, seed: "arms" },
  );

  const { innerRadius, tangent, armSpacing } = galaxyArmGeometry(SPIRAL);
  const armOffsets = (cloud) => {
    const offsets = [];
    for (let index = 0; index < cloud.sizes.length; index += 1) {
      const radius = radiusOf(cloud.positions, index);
      if (radius < 0.4 || radius > 0.9) continue;
      const angle = Math.atan2(cloud.positions[index * 3 + 2], cloud.positions[index * 3]);
      const armAngle = Math.log(radius / innerRadius) / tangent;
      let offset = (angle - armAngle) % armSpacing;
      if (offset < 0) offset += armSpacing;
      offsets.push(Math.min(offset, armSpacing - offset));
    }
    return offsets;
  };

  const spiralOffsets = armOffsets(spiral);
  const smoothOffsets = armOffsets(smooth);
  assert.ok(spiralOffsets.length > 200, "the sample covers the disc");

  const mean = (values) => values.reduce((total, value) => total + value, 0) / values.length;
  assert.ok(
    mean(spiralOffsets) < mean(smoothOffsets) * 0.75,
    "spiral stars sit far closer to an arm ridge than a structureless cloud does",
  );
});

test("a bar makes the inner galaxy elongated, and dropping it makes it round", () => {
  const inertia = (cloud, limit) => {
    let alongBar = 0;
    let acrossBar = 0;
    for (let index = 0; index < cloud.sizes.length; index += 1) {
      const x = cloud.positions[index * 3];
      const z = cloud.positions[index * 3 + 2];
      if (Math.hypot(x, z) > limit) continue;
      const along = x * Math.cos(0.4) + z * Math.sin(0.4);
      const across = -x * Math.sin(0.4) + z * Math.cos(0.4);
      alongBar += along * along;
      acrossBar += across * across;
    }
    return alongBar / Math.max(1e-9, acrossBar);
  };

  const barred = buildGalaxyCloud(SPIRAL, { starCount: 4000, seed: "bar" });
  const unbarred = buildGalaxyCloud(
    { ...SPIRAL, form: "spiral", barLength: 0 },
    { starCount: 4000, seed: "bar" },
  );

  assert.ok(inertia(barred, 0.34) > 1.6, "the bar is clearly elongated along its position angle");
  assert.ok(inertia(unbarred, 0.34) < 1.4, "an unbarred galaxy has a round centre");
});

test("an elliptical galaxy is a smooth, centrally concentrated spheroid", () => {
  const cloud = buildGalaxyCloud(
    { ...SPIRAL, form: "elliptical", axisRatio: 0.65 },
    { starCount: 3000, seed: "m87" },
  );

  let inner = 0;
  let vertical = 0;
  for (let index = 0; index < 3000; index += 1) {
    if (radiusOf(cloud.positions, index) < 0.3) inner += 1;
    vertical += Math.abs(cloud.positions[index * 3 + 1]);
  }
  assert.ok(inner / 3000 > 0.45, "most light sits in the centre");
  assert.ok(vertical / 3000 > 0.05, "and it is a spheroid, not a flat disc");
});

test("a spiral disc stays far flatter than an elliptical spheroid", () => {
  const thickness = (cloud) => cloud.positions
    .filter((_, index) => index % 3 === 1)
    .reduce((total, value) => total + Math.abs(value), 0) / cloud.sizes.length;

  const disc = buildGalaxyCloud(SPIRAL, { starCount: 3000, seed: "flat" });
  const spheroid = buildGalaxyCloud(
    { ...SPIRAL, form: "elliptical" },
    { starCount: 3000, seed: "flat" },
  );
  assert.ok(thickness(disc) < thickness(spheroid) * 0.5);
});

test("thinning a galaxy for a weaker device keeps every population", () => {
  const cloud = buildGalaxyCloud(SPIRAL, { starCount: 6000, seed: "lod" });
  const prefix = 1200;

  let bulgeLike = 0;
  let armLike = 0;
  let outer = 0;
  for (let index = 0; index < prefix; index += 1) {
    const red = cloud.colors[index * 3];
    const blue = cloud.colors[index * 3 + 2];
    if (red > blue * 1.2) bulgeLike += 1;
    if (blue >= red) armLike += 1;
    if (radiusOf(cloud.positions, index) > 0.75) outer += 1;
  }

  assert.ok(bulgeLike > 60, "old warm stars survive the cut");
  assert.ok(armLike > 60, "young blue arm stars survive the cut");
  assert.ok(outer > 30, "the outer disc and halo survive the cut");
});

test("galaxy shapes refuse impossible specifications", () => {
  assert.throws(
    () => buildGalaxyCloud({ ...SPIRAL, form: "sombrero" }, { starCount: 10, seed: "x" }),
    /unknown galaxy form/i,
  );
  assert.throws(
    () => buildGalaxyCloud(SPIRAL, { starCount: 0, seed: "x" }),
    /at least one star/i,
  );
  assert.throws(
    () => buildGalaxyCloud({ ...SPIRAL, pitchAngle: 0 }, { starCount: 10, seed: "x" }),
    /pitch angle/i,
  );
});
