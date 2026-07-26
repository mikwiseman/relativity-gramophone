// Three.js bodies for the outer scales: real galaxies, real star systems.
//
// Everything here is built from `galaxyShape` and `cosmicAtlas`, so the shape of
// a galaxy and the colour of a star come from measured structure rather than
// from a palette chosen by eye.

import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";

import {
  blackbodyColor,
  compressedOrbitRadius,
  habitableZone,
  planetAppearance,
} from "../lib/cosmicAtlas.js";
import { buildClusterCloud, buildGalaxyCloud } from "../lib/galaxyShape.js";
import { seededRandom, stringSeed } from "../lib/seededRandom.js";

const galaxyVertexShader = `
  attribute float aSize;
  attribute vec3 aColor;
  uniform float uPixelRatio;
  uniform float uScale;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float distance = max(0.05, -mvPosition.z);
    gl_PointSize = clamp(aSize * uScale * uPixelRatio / distance, 0.55, 4.2 * uPixelRatio);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const galaxyFragmentShader = `
  uniform float uOpacity;
  varying vec3 vColor;
  void main() {
    vec2 offset = gl_PointCoord - vec2(0.5);
    float radius = length(offset);
    if (radius > 0.5) discard;
    // A soft core with a wide faint skirt reads as unresolved starlight.
    float core = smoothstep(0.5, 0.0, radius);
    float halo = smoothstep(0.5, 0.2, radius);
    gl_FragColor = vec4(vColor, uOpacity * (core * 0.34 + halo * 0.3));
  }
`;

function createHazeTexture(innerAlpha, outerStop) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, `rgba(255,255,255,${innerAlpha})`);
  gradient.addColorStop(outerStop, `rgba(255,255,255,${innerAlpha * 0.22})`);
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

let sharedHaze = null;
function hazeTexture() {
  if (!sharedHaze) sharedHaze = createHazeTexture(0.85, 0.32);
  return sharedHaze;
}

/**
 * One galaxy, drawn from its real morphology.
 *
 * @param spec  a `galaxyShape` specification plus `tilt`/`roll` in degrees
 * @param options.radius  the drawn radius of the stellar disc
 * @param options.starCount  point budget
 */
export function createGalaxyObject(spec, { radius, starCount, seed }) {
  const group = new THREE.Group();
  const cloud = spec.form === "cluster"
    ? buildClusterCloud({
        memberCount: spec.memberCount ?? 24,
        starsPerMember: Math.max(1, Math.round(starCount / (spec.memberCount ?? 24))),
        seed: seed ?? spec.id,
      })
    : buildGalaxyCloud(spec, { starCount, seed: seed ?? spec.id });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(cloud.positions, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(cloud.colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(cloud.sizes, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.4);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uOpacity: { value: 0 },
      uPixelRatio: { value: 1 },
      uScale: { value: radius * 7.4 },
    },
    vertexShader: galaxyVertexShader,
    fragmentShader: galaxyFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.scale.setScalar(radius);
  group.add(points);

  // The unresolved inner glow every galaxy has, tinted by its old stars.
  const core = new THREE.Sprite(new THREE.SpriteMaterial({
    map: hazeTexture(),
    color: spec.coreColor ?? 0xffcf9a,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }));
  const coreSpread = spec.form === "elliptical"
    ? 1.5
    : spec.form === "dwarf-spheroidal"
      ? 1.6
      : spec.form === "cluster"
        ? 1.75
        : 0.62;
  core.scale.setScalar(radius * coreSpread);
  group.add(core);

  // A disc has to be tilted to be read as a disc; a cluster has no plane.
  group.rotation.x = ((spec.tilt ?? (spec.form === "cluster" ? 0 : 62)) * Math.PI) / 180;
  group.rotation.y = ((spec.roll ?? 0) * Math.PI) / 180;

  return {
    group,
    points,
    core,
    setOpacity(opacity) {
      material.uniforms.uOpacity.value = opacity;
      core.material.opacity = opacity * (spec.coreStrength ?? 0.34);
      group.visible = opacity > 0.004;
    },
    setPixelRatio(pixelRatio) {
      material.uniforms.uPixelRatio.value = pixelRatio;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      core.material.dispose();
    },
  };
}

function createStarBall(temperature, drawnRadius, radialTexture) {
  const group = new THREE.Group();
  const color = blackbodyColor(temperature);

  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(drawnRadius, 32, 24),
    new THREE.MeshBasicMaterial({ color, toneMapped: false }),
  );
  group.add(sphere);

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture,
    color,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }));
  glow.scale.setScalar(drawnRadius * 9);
  group.add(glow);

  return { group, sphere, glow, color };
}

function ellipsePoints(semiMajor, eccentricity, samples = 128) {
  const points = [];
  const semiMinor = semiMajor * Math.sqrt(Math.max(0, 1 - eccentricity ** 2));
  const focus = semiMajor * eccentricity;
  for (let index = 0; index <= samples; index += 1) {
    const angle = (index / samples) * Math.PI * 2;
    points.push(
      Math.cos(angle) * semiMajor - focus,
      0,
      Math.sin(angle) * semiMinor,
    );
  }
  return points;
}

/**
 * A real planetary system: real orbital ordering, real relative spacing on a
 * logarithmic scale, real planet classes, and a habitable zone drawn where the
 * star's own luminosity puts it.
 */
export function createStarSystemObject(system, {
  radialTexture,
  innerRadius = 1.1,
  outerRadius = 4.2,
  seed,
}) {
  const group = new THREE.Group();
  const random = seededRandom(stringSeed(String(seed ?? system.star.name)));
  const planets = system.bodies;
  const semiMajorValues = planets.map((planet) => planet.orbitAu);
  const minimumAu = Math.min(...semiMajorValues);
  const maximumAu = Math.max(...semiMajorValues);

  const star = createStarBall(
    system.star.temperature,
    Math.max(0.14, Math.min(0.42, 0.2 * Math.cbrt(system.star.radiusSolar))),
    radialTexture,
  );
  group.add(star.group);

  const zone = habitableZone(system.star.luminositySuns);
  const zoneInner = compressedOrbitRadius(
    Math.min(Math.max(zone.inner, minimumAu * 0.55), maximumAu * 1.8),
    { minimumAu, maximumAu, innerRadius, outerRadius },
  );
  const zoneOuter = compressedOrbitRadius(
    Math.min(Math.max(zone.outer, minimumAu * 0.6), maximumAu * 2),
    { minimumAu, maximumAu, innerRadius, outerRadius },
  );
  const habitableBand = new THREE.Mesh(
    new THREE.RingGeometry(Math.min(zoneInner, zoneOuter), Math.max(zoneInner, zoneOuter), 96),
    new THREE.MeshBasicMaterial({
      color: 0x4fd6a8,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  habitableBand.rotation.x = -Math.PI / 2;
  group.add(habitableBand);

  const worlds = planets.map((planet, index) => {
    const drawnRadius = compressedOrbitRadius(planet.orbitAu, {
      minimumAu,
      maximumAu,
      innerRadius,
      outerRadius,
    });
    const appearance = planetAppearance({
      radiusEarth: planet.radiusEarth,
      orbitAu: planet.orbitAu,
      luminositySuns: system.star.luminositySuns,
    });
    const color = planet.color ?? appearance.color;

    const orbit = new Line2(
      new LineGeometry(),
      new LineMaterial({
        color,
        linewidth: 1.15,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        alphaToCoverage: true,
      }),
    );
    orbit.geometry.setPositions(ellipsePoints(drawnRadius, planet.eccentricity ?? 0));
    orbit.computeLineDistances();
    orbit.frustumCulled = false;
    group.add(orbit);

    // Radii are compressed too: Jupiter must read as a giant beside Earth
    // without Earth vanishing, so the cube root of the real radius sets the size.
    const bodyRadius = 0.028 + 0.038 * Math.cbrt(Math.min(14, planet.radiusEarth));
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(bodyRadius, 20, 16),
      new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, opacity: 0 }),
    );
    body.userData.systemPlanetId = planet.id;
    group.add(body);

    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialTexture,
      color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    halo.scale.setScalar(bodyRadius * 4);
    group.add(halo);

    return {
      planet,
      appearance,
      color,
      orbit,
      body,
      halo,
      drawnRadius,
      eccentricity: planet.eccentricity ?? 0,
      phase: random() * Math.PI * 2,
      impulse: 0,
    };
  });

  const fastestPeriod = Math.min(...planets.map((planet) => planet.periodDays));

  return {
    group,
    star,
    worlds,
    habitableBand,
    /** Advance every world by real period ratios: one shared time compression. */
    advance(delta, secondsPerFastestOrbit = 7) {
      for (const world of worlds) {
        const revolutions = delta / (secondsPerFastestOrbit
          * (world.planet.periodDays / fastestPeriod));
        world.phase += revolutions * Math.PI * 2;
        const semiMinor = world.drawnRadius * Math.sqrt(Math.max(0, 1 - world.eccentricity ** 2));
        world.body.position.set(
          Math.cos(world.phase) * world.drawnRadius - world.drawnRadius * world.eccentricity,
          0,
          Math.sin(world.phase) * semiMinor,
        );
        world.halo.position.copy(world.body.position);
        world.impulse *= Math.exp(-delta * 2.2);
      }
    },
    setOpacity(opacity) {
      group.visible = opacity > 0.01;
      star.sphere.material.opacity = opacity;
      star.glow.material.opacity = opacity * 0.85;
      habitableBand.material.opacity = opacity * 0.024;
      for (const world of worlds) {
        world.orbit.material.opacity = opacity * (0.3 + world.impulse * 0.6);
        world.body.material.opacity = opacity;
        world.halo.material.opacity = opacity * (0.18 + world.impulse * 0.6);
      }
    },
    setResolution(width, height) {
      for (const world of worlds) world.orbit.material.resolution.set(width, height);
    },
    strike(planetId) {
      const world = worlds.find((candidate) => candidate.planet.id === planetId);
      if (!world) return null;
      world.impulse = 1;
      return world;
    },
    dispose() {
      for (const world of worlds) {
        world.orbit.geometry.dispose();
        world.orbit.material.dispose();
        world.body.geometry.dispose();
        world.body.material.dispose();
        world.halo.material.dispose();
      }
      star.sphere.geometry.dispose();
      star.sphere.material.dispose();
      star.glow.material.dispose();
      habitableBand.geometry.dispose();
      habitableBand.material.dispose();
    },
  };
}
