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

// One cheap value-noise field, shared by every surface shader here. A star's
// granulation and a world's continents are the same three lines of arithmetic;
// what separates them is the physics fed in above.
const NOISE_GLSL = `
  float rgHash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
  }
  float rgNoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = rgHash(i);
    float n100 = rgHash(i + vec3(1.0, 0.0, 0.0));
    float n010 = rgHash(i + vec3(0.0, 1.0, 0.0));
    float n110 = rgHash(i + vec3(1.0, 1.0, 0.0));
    float n001 = rgHash(i + vec3(0.0, 0.0, 1.0));
    float n101 = rgHash(i + vec3(1.0, 0.0, 1.0));
    float n011 = rgHash(i + vec3(0.0, 1.0, 1.0));
    float n111 = rgHash(i + vec3(1.0, 1.0, 1.0));
    return mix(
      mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
      mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
      f.z
    );
  }
  float rgFbm(vec3 p) {
    float sum = 0.0;
    float amplitude = 0.5;
    for (int octave = 0; octave < 4; octave += 1) {
      sum += amplitude * rgNoise(p);
      p *= 2.03;
      amplitude *= 0.5;
    }
    return sum;
  }
`;

const SURFACE_VERTEX_SHADER = `
  varying vec3 vObjectNormal;
  varying vec3 vViewNormal;
  varying vec3 vViewPosition;
  void main() {
    vObjectNormal = normalize(position);
    vViewNormal = normalize(normalMatrix * normal);
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = viewPosition.xyz;
    gl_Position = projectionMatrix * viewPosition;
  }
`;

// Eddington's limb darkening, I(mu)/I(1) = 0.4 + 0.6 mu, plus slow granulation.
// A real star is not a flat disc of colour: it is brightest dead centre and
// falls away to a soft, redder edge, and that alone is most of what makes an
// image read as a photograph rather than as a sticker.
const STAR_SURFACE_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uImpulse;
  uniform float uWhiteCore;
  varying vec3 vObjectNormal;
  varying vec3 vViewNormal;
  varying vec3 vViewPosition;
  ${NOISE_GLSL}
  void main() {
    vec3 normal = normalize(vObjectNormal);
    float mu = clamp(dot(normalize(vViewNormal), normalize(-vViewPosition)), 0.0, 1.0);
    float limb = 0.42 + 0.58 * mu;
    float granulation = rgFbm(normal * 6.4 + vec3(0.0, uTime * 0.035, uTime * 0.014));
    float faculae = smoothstep(0.62, 0.88, rgFbm(normal * 2.6 + 11.0));
    vec3 color = uColor * limb * (0.82 + 0.42 * granulation + 0.3 * faculae);
    // The photosphere whitens toward the centre of the disc, where we see
    // deepest and hottest into it.
    color += vec3(1.0, 0.95, 0.88) * pow(mu, 4.2) * 0.34 * uWhiteCore;
    color *= 0.88 + uImpulse * 0.7;
    gl_FragColor = vec4(color, uOpacity);
  }
`;

function createStarBall(temperature, drawnRadius, radialTexture) {
  const group = new THREE.Group();
  const color = blackbodyColor(temperature);
  const whiteCore = Math.min(1, Math.max(0, (temperature - 3200) / 2600));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      uImpulse: { value: 0 },
      // How much white a star is allowed to show at the centre of its disc.
      // The Sun's photosphere burns out to white there; a 2566 K dwarf never
      // does, and letting it read as a bright ellipse of colour instead of a
      // white ball is the whole point of taking its temperature seriously.
      uWhiteCore: { value: whiteCore },
    },
    vertexShader: SURFACE_VERTEX_SHADER,
    fragmentShader: STAR_SURFACE_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
  });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(drawnRadius, 48, 32), material);
  group.add(sphere);

  // Two skirts rather than one: a tight chromosphere the colour of the star,
  // and a wide faint corona. A single sprite always reads as a decal.
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture,
    color,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }));
  glow.scale.setScalar(drawnRadius * 5.4);
  group.add(glow);

  const corona = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture,
    color,
    transparent: true,
    opacity: 0.26,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }));
  corona.scale.setScalar(drawnRadius * 13);
  group.add(corona);

  return { group, sphere, glow, corona, material, color };
}

// A world is lit by its own star and by nothing else. The terminator is soft
// because a star is a disc and not a point, the night side keeps only the
// faintest ash of reflected light, and the atmosphere is a Fresnel rim that
// brightens on the lit limb — which is what a crescent actually looks like.
const PLANET_SURFACE_FRAGMENT_SHADER = `
  uniform vec3 uStarDirection;
  uniform vec3 uDayColor;
  uniform vec3 uNightColor;
  uniform vec3 uAtmosphere;
  uniform float uBanding;
  uniform float uRoughness;
  uniform float uImpulse;
  uniform float uOpacity;
  uniform float uSeed;
  varying vec3 vObjectNormal;
  varying vec3 vViewNormal;
  varying vec3 vViewPosition;
  ${NOISE_GLSL}
  void main() {
    vec3 normal = normalize(vObjectNormal);
    float incidence = dot(normal, normalize(uStarDirection));
    float lit = smoothstep(-0.18, 0.30, incidence);

    float continents = rgFbm(normal * 2.9 + uSeed);
    float weather = rgFbm(normal * 5.6 + uSeed * 1.7);
    // Zonal bands: a giant's winds are stretched flat along its latitudes.
    float bands = 0.5 + 0.5 * sin(normal.y * 13.0 + rgFbm(normal * vec3(1.4, 3.2, 1.4) + uSeed) * 3.6);
    float surface = mix(mix(continents, weather, 0.35), bands, uBanding);

    vec3 day = uDayColor * (0.46 + uRoughness * surface * 0.78);
    vec3 color = mix(uNightColor, day, lit);

    float fresnel = pow(1.0 - clamp(dot(normalize(vViewNormal), normalize(-vViewPosition)), 0.0, 1.0), 2.8);
    color += uAtmosphere * fresnel * (0.16 + 1.05 * lit);
    color += uDayColor * uImpulse * 0.75;

    gl_FragColor = vec4(color, uOpacity);
  }
`;

/** The tint a class of world puts on its own limb. */
function atmosphereColor(classId, dayColor) {
  switch (classId) {
    case "lava": return new THREE.Color(0xff9a4e);
    case "warm-rocky": return new THREE.Color(0xffb98a);
    case "temperate-rocky": return new THREE.Color(0x8fc9ff);
    case "frozen-rocky": return new THREE.Color(0xcfe6ff);
    case "mini-neptune": return new THREE.Color(0x9fd8ef);
    case "ice-giant": return new THREE.Color(0x7fdcf0);
    case "gas-giant": return new THREE.Color(0xffd7a3);
    default: return new THREE.Color(dayColor);
  }
}

function createPlanetSurface(radius, appearance, color, seed) {
  const day = new THREE.Color(color);
  const banding = appearance.id === "gas-giant" || appearance.id === "ice-giant"
    || appearance.id === "mini-neptune" ? 1 : 0;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uStarDirection: { value: new THREE.Vector3(1, 0, 0) },
      uDayColor: { value: day },
      // The unlit face is not black — it holds a trace of its own colour, the
      // way the dark limb of a planet does against a starfield.
      uNightColor: { value: day.clone().multiplyScalar(0.055) },
      uAtmosphere: { value: atmosphereColor(appearance.id, color) },
      uBanding: { value: banding },
      uRoughness: { value: banding ? 0.34 : 0.62 },
      uImpulse: { value: 0 },
      uOpacity: { value: 0 },
      uSeed: { value: seed },
    },
    vertexShader: SURFACE_VERTEX_SHADER,
    fragmentShader: PLANET_SURFACE_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 40, 28), material);
}

/**
 * A world's own name, and the year it actually keeps. Drawn once into a canvas
 * so that reading the sky costs nothing per frame.
 */
function createPlanetLabelTexture(planet, appearance) {
  const width = 768;
  const height = 192;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.shadowColor = "rgba(0, 0, 0, 0.95)";

  // A world of TRAPPIST-1 is "TRAPPIST-1 e"; on its own orbit it is simply "e".
  const shortName = planet.name.replace(/^.*?([A-Za-z]?\s*[b-z])$/u, "$1").trim();
  const name = shortName.length <= 2 && shortName.length > 0
    ? shortName.toUpperCase()
    : planet.name.toUpperCase();

  context.shadowBlur = 20;
  context.font = "58px 'Iowan Old Style', Georgia, serif";
  context.fillStyle = "rgba(255, 246, 228, 0.96)";
  context.fillText(name, width / 2, 63);

  const days = planet.periodDays;
  const year = days >= 365
    ? `${(days / 365.25).toFixed(days / 365.25 >= 10 ? 0 : 1)} YEARS`
    : `${days >= 10 ? days.toFixed(0) : days.toFixed(1)} DAYS`;
  context.shadowBlur = 14;
  context.font = "30px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.fillStyle = "rgba(188, 236, 255, 0.8)";
  context.fillText(`${year} · ${appearance.label}`, width / 2, 132);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.anisotropy = 8;
  return texture;
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
export const VISITED_SYSTEM_OUTER_RADIUS = 4.2;

export function createStarSystemObject(system, {
  radialTexture,
  innerRadius = 1.1,
  outerRadius = VISITED_SYSTEM_OUTER_RADIUS,
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

  const worlds = planets.map((planet) => {
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
        linewidth: 1.35,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        // Not additive. Line2 draws every segment as its own capped quad, so
        // consecutive caps overlap at each joint; under additive blending that
        // doubles the brightness at every one of them and a smooth ellipse
        // comes out as a string of beads.
        blending: THREE.NormalBlending,
        toneMapped: false,
        // Not alpha-to-coverage. Quantising a thin line's alpha into four
        // MSAA samples makes its brightness step as its sub-pixel position
        // drifts, and a smooth ellipse comes out as a chain of beads. The
        // multisampled target still resolves the quad's own edges, so ordinary
        // alpha blending gives a smoother and brighter line than coverage does.
        alphaToCoverage: false,
      }),
    );
    orbit.geometry.setPositions(ellipsePoints(drawnRadius, planet.eccentricity ?? 0, 256));
    orbit.computeLineDistances();
    orbit.frustumCulled = false;
    group.add(orbit);

    // Radii are compressed too: Jupiter must read as a giant beside Earth
    // without Earth vanishing, so the cube root of the real radius sets the size.
    // Large enough to be a world rather than a pixel: at the distance a phone
    // has to stand back to fit seven orbits, the old radius was under three
    // pixels across.
    const bodyRadius = 0.052 + 0.062 * Math.cbrt(Math.min(14, planet.radiusEarth));
    const body = createPlanetSurface(
      bodyRadius,
      appearance,
      color,
      (stringSeed(planet.id) % 997) / 97,
    );
    body.userData.systemPlanetId = planet.id;
    body.frustumCulled = false;
    group.add(body);

    // A world this small on screen needs a halo to be findable at all; it is
    // sized from the body so it never becomes a decorative blob.
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialTexture,
      color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    halo.scale.setScalar(bodyRadius * 4.4);
    group.add(halo);

    // A generous invisible sphere, so a fingertip can find a world that is two
    // pixels wide without having to be surgical about it.
    const touchArea = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(bodyRadius * 3.4, 0.14), 12, 10),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    touchArea.userData.systemPlanetId = planet.id;
    touchArea.frustumCulled = false;
    group.add(touchArea);

    const label = new THREE.Sprite(new THREE.SpriteMaterial({
      map: createPlanetLabelTexture(planet, appearance),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    }));
    label.scale.set(1.34, 0.335, 1);
    label.center.set(0.5, 1.22);
    group.add(label);

    return {
      planet,
      appearance,
      color,
      orbit,
      body,
      halo,
      touchArea,
      label,
      drawnRadius,
      bodyRadius,
      eccentricity: planet.eccentricity ?? 0,
      phase: random() * Math.PI * 2,
      impulse: 0,
    };
  });

  const fastestPeriod = Math.min(...planets.map((planet) => planet.periodDays));
  let elapsed = 0;
  let starImpulse = 0;

  return {
    group,
    star,
    worlds,
    habitableBand,
    worldById: new Map(worlds.map((world) => [world.planet.id, world])),
    /**
     * Names are drawn in world units, so a phone standing twice as far back to
     * fit the system would read them at half the size. Hold them steady.
     */
    setLabelScale(factor) {
      const eased = Math.min(2.6, Math.max(0.85, factor));
      for (const world of worlds) world.label.scale.set(1.34 * eased, 0.335 * eased, 1);
    },
    touchAreas: worlds.map((world) => world.touchArea),
    /** Advance every world by real period ratios: one shared time compression. */
    advance(delta, secondsPerFastestOrbit = 7, decayDelta = delta) {
      elapsed += delta;
      star.material.uniforms.uTime.value = elapsed;
      star.material.uniforms.uImpulse.value = starImpulse;
      starImpulse *= Math.exp(-decayDelta * 2.4);
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
        world.touchArea.position.copy(world.body.position);
        world.label.position.copy(world.body.position);
        // The star sits at the system's own origin, so the direction to the
        // light is simply the direction back to the middle.
        world.body.material.uniforms.uStarDirection.value
          .copy(world.body.position)
          .negate()
          .normalize();
        world.body.material.uniforms.uImpulse.value = world.impulse;
        world.impulse *= Math.exp(-decayDelta * 2.2);
      }
    },
    /**
     * @param opacity   how present the whole system is
     * @param labelMix  how legible the per-world names are; a system seen from
     *                  across the neighbourhood must not shout seven names.
     */
    setOpacity(opacity, labelMix = 0) {
      group.visible = opacity > 0.01;
      star.material.uniforms.uOpacity.value = opacity;
      // Seen from across the neighbourhood a system is 50 pixels wide; a corona
      // sized for arrival would bloom over its own worlds and leave a white
      // smudge where eight planets should be.
      star.glow.material.opacity = opacity * (0.2 + labelMix * 0.3);
      star.corona.material.opacity = opacity * labelMix * 0.13;
      habitableBand.material.opacity = opacity * 0.012 * (0.3 + labelMix * 0.7);
      for (const world of worlds) {
        // Eight rings of a distant system overlap into one white smear if each
        // one is drawn as boldly as it is on arrival.
        world.orbit.material.opacity = opacity
          * (0.055 + labelMix * 0.26 + world.impulse * 0.5);
        world.body.material.uniforms.uOpacity.value = opacity;
        world.halo.material.opacity = opacity * (0.07 + world.impulse * 0.62);
        world.label.material.opacity = labelMix * opacity * (0.72 + world.impulse * 0.28);
        world.label.visible = world.label.material.opacity > 0.02;
        world.touchArea.visible = labelMix > 0.5;
      }
    },
    setResolution(width, height) {
      for (const world of worlds) world.orbit.material.resolution.set(width, height);
    },
    strike(planetId) {
      const world = worlds.find((candidate) => candidate.planet.id === planetId);
      if (!world) return null;
      world.impulse = 1;
      starImpulse = Math.max(starImpulse, 0.55);
      return world;
    },
    dispose() {
      for (const world of worlds) {
        world.orbit.geometry.dispose();
        world.orbit.material.dispose();
        world.body.geometry.dispose();
        world.body.material.dispose();
        world.halo.material.dispose();
        world.touchArea.geometry.dispose();
        world.touchArea.material.dispose();
        world.label.material.map.dispose();
        world.label.material.dispose();
      }
      star.sphere.geometry.dispose();
      star.material.dispose();
      star.glow.material.dispose();
      star.corona.material.dispose();
      habitableBand.geometry.dispose();
      habitableBand.material.dispose();
    },
  };
}
