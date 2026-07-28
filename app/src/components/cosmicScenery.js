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
import { systemTouchRadius } from "../lib/soundflight.js";

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

let MAX_ANISOTROPY = 8;
/** Texture filtering can only ask for what this GPU actually has. */
export function setMaxAnisotropy(value) {
  if (Number.isFinite(value) && value >= 1) MAX_ANISOTROPY = value;
}

let sharedHaze = null;
function hazeTexture() {
  if (!sharedHaze) sharedHaze = createHazeTexture(0.85, 0.32);
  return sharedHaze;
}

let sharedNeutralHalo = null;
/**
 * A colourless glow. The shared radial texture bakes red at 255 with green and
 * blue falling away, so a sprite tinted with it can only ever come out orange —
 * which is why seven worlds of one system all wore the same warm skirt. A
 * neutral map lets `SpriteMaterial.color` actually mean the world's colour.
 */
function neutralHaloTexture() {
  if (sharedNeutralHalo) return sharedNeutralHalo;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (let index = 0; index <= 24; index += 1) {
    const radius = index / 24;
    const alpha = Math.exp(-((radius / 0.3) ** 2)) * (1 - radius * radius) ** 2.2;
    gradient.addColorStop(radius, `rgba(255,255,255,${alpha.toFixed(4)})`);
  }
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  sharedNeutralHalo = new THREE.CanvasTexture(canvas);
  sharedNeutralHalo.colorSpace = THREE.SRGBColorSpace;
  return sharedNeutralHalo;
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

function createStarBall(temperature, drawnRadius, radialTexture, innermostOrbit = Infinity) {
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
    // Light in front of a body is still light: a glow is never occluded by the
    // thing it belongs to.
    depthTest: false,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }));
  glow.renderOrder = 3;
  glow.scale.setScalar(Math.min(drawnRadius * 5.4, innermostOrbit * 0.82));
  group.add(glow);

  const corona = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture,
    color,
    transparent: true,
    // Light in front of a body is still light: a glow is never occluded by the
    // thing it belongs to.
    depthTest: false,
    opacity: 0.26,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }));
  corona.renderOrder = 2;
  corona.scale.setScalar(Math.min(drawnRadius * 13, innermostOrbit * 1.55));
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
  uniform vec3 uAccent;
  uniform float uBanding;
  uniform float uRoughness;
  uniform float uIceCaps;
  uniform float uMolten;
  uniform float uOcean;
  uniform float uStorm;
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
    float latitude = abs(normal.y);

    // Three ways a real surface can be organised, mixed by class rather than
    // by taste: broken continents, zonal wind bands, and a banded giant's one
    // long-lived storm. Seven worlds of one system differ because their
    // measured radius and the starlight they receive differ, not because a
    // palette was chosen for them.
    float continents = rgFbm(normal * 2.9 + uSeed);
    float weather = rgFbm(normal * 5.6 + uSeed * 1.7);
    float bands = 0.5 + 0.5 * sin(normal.y * 13.0 + rgFbm(normal * vec3(1.4, 3.2, 1.4) + uSeed) * 3.6);
    float surface = mix(mix(continents, weather, 0.35), bands, uBanding);

    vec3 day = uDayColor * (0.46 + uRoughness * surface * 0.78);

    // Dark basalt plains, the way the Moon and Mercury are mottled.
    float maria = smoothstep(0.62, 0.30, continents) * (1.0 - uBanding);
    day *= 1.0 - maria * 0.34 * (1.0 - uOcean);

    // A liquid surface is smooth and dark where it is deep, and it throws a
    // specular highlight back at the star.
    float sea = smoothstep(0.54, 0.40, continents) * uOcean;
    day = mix(day, uAccent * 0.62, sea * 0.75);

    // Ice reaches down from the poles, and further on a colder world.
    float caps = smoothstep(0.98 - uIceCaps * 0.62, 1.0, latitude + rgFbm(normal * 6.0 + uSeed) * 0.14);
    day = mix(day, vec3(0.93, 0.96, 1.0) * 0.86, caps * uIceCaps);

    // One oval storm, held at a single latitude, the way a giant's is.
    float stormShape = exp(-24.0 * pow(normal.y - 0.22, 2.0)
      - 5.0 * pow(atan(normal.z, normal.x) - 1.1, 2.0));
    day = mix(day, uAccent, clamp(stormShape, 0.0, 1.0) * uStorm * 0.7);

    vec3 color = mix(uNightColor, day, lit);

    // A molten world glows through its own crust on the side facing away from
    // its star; that glow is the only light a lava night side has.
    float cracks = smoothstep(0.58, 0.86, rgFbm(normal * 7.2 + uSeed * 2.3));
    color += uAccent * cracks * uMolten * (1.0 - lit) * 1.35;

    float fresnel = pow(1.0 - clamp(dot(normalize(vViewNormal), normalize(-vViewPosition)), 0.0, 1.0), 1.6);
    color += uAtmosphere * fresnel * (0.16 + 1.05 * lit);
    // Sunlight glancing off a sea, only where the star is actually reflected.
    color += uAccent * pow(max(0.0, incidence), 34.0) * sea * 0.9;
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

/**
 * How each measured class of world is organised on its surface. Nothing here is
 * a taste decision about a particular planet: `planetAppearance` derives the
 * class from the world's measured radius and the starlight it actually
 * receives, and the class decides which of these features exist at all.
 */
const CLASS_SURFACE = Object.freeze({
  lava:               { banding: 0, iceCaps: 0,    molten: 1,    ocean: 0,    storm: 0,   accent: 0xff5a1e },
  "warm-rocky":       { banding: 0, iceCaps: 0.12, molten: 0.12, ocean: 0,    storm: 0,   accent: 0xff8b4a },
  "temperate-rocky":  { banding: 0, iceCaps: 0.5,  molten: 0,    ocean: 0.85, storm: 0,   accent: 0x2f6fb8 },
  "frozen-rocky":     { banding: 0, iceCaps: 1,    molten: 0,    ocean: 0,    storm: 0,   accent: 0xdff0ff },
  "mini-neptune":     { banding: 1, iceCaps: 0.2,  molten: 0,    ocean: 0,    storm: 0,   accent: 0xbfe4f4 },
  "ice-giant":        { banding: 1, iceCaps: 0.1,  molten: 0,    ocean: 0,    storm: 0.3, accent: 0x5ec7dd },
  "gas-giant":        { banding: 1, iceCaps: 0,    molten: 0,    ocean: 0,    storm: 1,   accent: 0xc9603a },
});

function createPlanetSurface(radius, appearance, color, seed) {
  const day = new THREE.Color(color);
  const surface = CLASS_SURFACE[appearance.id] ?? CLASS_SURFACE["warm-rocky"];
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uStarDirection: { value: new THREE.Vector3(1, 0, 0) },
      uDayColor: { value: day },
      // The unlit face is not black — it holds a trace of its own colour, the
      // way the dark limb of a planet does against a starfield.
      uNightColor: { value: day.clone().multiplyScalar(0.15) },
      uAtmosphere: { value: atmosphereColor(appearance.id, color) },
      uAccent: { value: new THREE.Color(surface.accent) },
      uBanding: { value: surface.banding },
      uRoughness: { value: surface.banding ? 0.34 : 0.62 },
      uIceCaps: { value: surface.iceCaps },
      uMolten: { value: surface.molten },
      uOcean: { value: surface.ocean },
      uStorm: { value: surface.storm },
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
  // A shell of Omega Centauri is simply "HALF-LIGHT" — you are standing inside
  // the cluster and its name is already the headline, so repeating it on seven
  // rings at once is how the labels ran into each other.
  const shortName = planet.name.replace(/^.*?([A-Za-z]?\s*[b-z])$/u, "$1").trim();
  const name = planet.shell
    ? planet.shell
    : shortName.length <= 2 && shortName.length > 0
      ? shortName.toUpperCase()
      : planet.name.toUpperCase();

  context.shadowBlur = 20;
  context.font = "58px 'Iowan Old Style', Georgia, serif";
  context.fillStyle = "rgba(255, 246, 228, 0.96)";
  context.fillText(name, width / 2, 63);

  // A year, at whatever size the thing keeping it happens to be. A planet's is
  // days; a star's orbit around the centre of a globular cluster is millions of
  // years, and calling that "9,600,000 DAYS" would be true and useless.
  const days = planet.periodDays;
  const years = days / 365.25;
  const duration = years >= 1e9
    ? `${(years / 1e9).toFixed(1)} BILLION YEARS`
    : years >= 1e6
      ? `${(years / 1e6).toFixed(1)} MILLION YEARS`
      : years >= 1000
        ? `${Math.round(years).toLocaleString("en-US")} YEARS`
        : days >= 365
          ? `${years.toFixed(years >= 10 ? 0 : 1)} YEARS`
          : `${days >= 10 ? days.toFixed(0) : days.toFixed(1)} DAYS`;
  // A galaxy inside a cluster is not going round anything — it is on a long
  // plunging orbit, and what has been measured is how fast. So this duration is
  // a crossing time, and the label says so rather than calling it a year.
  const year = planet.crossing ? `${duration} TO CROSS` : duration;
  // A shell of a star cluster is not a planet, and a mass-radius class is not
  // a thing it has. It says where in the cluster it stands.
  const caption = planet.shell ? `${planet.shell} STARS` : appearance.label;
  context.shadowBlur = 14;
  context.font = "30px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.fillStyle = "rgba(188, 236, 255, 0.8)";
  context.fillText(`${year} · ${caption}`, width / 2, 132);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // A name is drawn three to four times smaller than its canvas. Without a
  // mipmap chain that is point sampling, and a serif stem lands as a hard
  // on/off column of pixels — the one thing on screen whose correct appearance
  // the eye already knows, arriving wrong.
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = MAX_ANISOTROPY;
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

  // A star's corona has to be sized against its own system, not in absolute
  // units. At 13 times its drawn radius the Sun's skirt reached past Mercury's
  // whole orbit and erased the inner three worlds in a white smear.
  const star = createStarBall(
    system.star.temperature,
    Math.max(0.14, Math.min(0.42, 0.2 * Math.cbrt(system.star.radiusSolar))),
    radialTexture,
    innerRadius,
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

  // The largest world in a system sets the scale, and every other world is
  // drawn as a stated power of its real radius against it. The old formula —
  // an additive floor plus a cube root — squeezed the Solar System's true 29:1
  // spread from Mercury to Jupiter into 1.97:1, so a gas giant and a rock
  // arrived on screen the same size. That is the whole of "identical
  // fireflies": nothing about a world's size meant anything.
  const largestEarthRadii = Math.max(...planets.map((planet) => planet.radiusEarth));

  const makeWorld = (planet) => {
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
    // Order- and ratio-preserving under one stated compression, with a floor
    // only so the smallest world stays aimable at arm's length on a phone.
    const bodyRadius = Math.max(
      0.052,
      0.158 * (planet.radiusEarth / largestEarthRadii) ** 0.45,
    );
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
      map: neutralHaloTexture(),
      color,
      transparent: true,
      depthTest: false,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    halo.renderOrder = 3;
    halo.scale.setScalar(bodyRadius * 3.1);
    group.add(halo);

    // A generous invisible sphere, so a fingertip can find a world that is two
    // pixels wide without having to be surgical about it.
    const touchBaseRadius = Math.max(bodyRadius * 3.4, 0.14);
    const touchArea = new THREE.Mesh(
      new THREE.SphereGeometry(touchBaseRadius, 12, 10),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        colorWrite: false,
      }),
    );
    touchArea.userData.systemPlanetId = planet.id;
    touchArea.frustumCulled = false;
    group.add(touchArea);

    // A ring plane is the one silhouette in the sky nobody can mistake, and the
    // Solar System table has carried `rings: true` on Saturn from the start
    // without a single line of code ever reading it. Drawn only where the data
    // says so — no exoplanet here has an observed ring system.
    let rings = null;
    if (planet.rings) {
      const ringGeometry = new THREE.RingGeometry(bodyRadius * 1.32, bodyRadius * 2.28, 96, 1);
      rings = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false,
      }));
      // Saturn's axis leans 26.7 degrees, which is why we ever see the rings
      // open at all.
      rings.rotation.set(-Math.PI / 2 + (26.73 * Math.PI) / 180, 0, 0.42);
      rings.frustumCulled = false;
      group.add(rings);
    }

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
      rings,
      drawnRadius,
      bodyRadius,
      touchBaseRadius,
      // Filled in once every world's drawn radius is known: a target may not
      // swell past its share of the gap to the next orbit.
      neighbourGap: Infinity,
      eccentricity: planet.eccentricity ?? 0,
      phase: random() * Math.PI * 2,
      impulse: 0,
    };
  };

  const worlds = planets.map(makeWorld);
  // Two worlds that both claim the same pixel are worse than one that is
  // small, so each target's ceiling is half the distance to its nearer
  // neighbour's orbit.
  const measureNeighbourGaps = (list) => {
    const sorted = [...list].sort((first, second) => first.drawnRadius - second.drawnRadius);
    for (let index = 0; index < sorted.length; index += 1) {
      const gaps = [];
      if (index > 0) gaps.push(sorted[index].drawnRadius - sorted[index - 1].drawnRadius);
      if (index < sorted.length - 1) gaps.push(sorted[index + 1].drawnRadius - sorted[index].drawnRadius);
      sorted[index].neighbourGap = gaps.length > 0 ? Math.min(...gaps) : Infinity;
    }
  };
  measureNeighbourGaps(worlds);

  const fastestPeriod = Math.min(...planets.map((planet) => planet.periodDays));
  // A system spanning Mercury to Neptune covers 684:1 in period. Anchoring the
  // clock to the fastest world freezes the outer half of it; anchoring to the
  // geometric mean lets every world visibly move, and the period RATIOS — which
  // are the music — survive untouched either way.
  const meanLogPeriod = planets
    .reduce((total, planet) => total + Math.log(planet.periodDays), 0) / planets.length;
  const secondsPerLapAtMean = 26;
  const systemSecondsPerFastestOrbit = Math.max(
    2.5,
    (secondsPerLapAtMean * fastestPeriod) / Math.exp(meanLogPeriod),
  );
  let elapsed = 0;
  let starImpulse = 0;
  let lastResolution = null;

  const api = {
    group,
    star,
    worlds,
    habitableBand,
    /**
     * How far out this system is actually drawn — which is not the authored
     * rim once a player has put a world beyond it. The camera fits this, so a
     * world placed far away stays in the picture instead of leaving it.
     */
    get outerDrawnRadius() {
      return worlds.reduce((furthest, world) => Math.max(furthest, world.drawnRadius), outerRadius);
    },
    band: Object.freeze({ minimumAu, maximumAu, innerRadius, outerRadius }),
    /**
     * A world the player adds to a real system. It keeps its own voice colour
     * rather than a measured class colour, because it is not a measurement:
     * everything else in this sky was observed, and this one was made.
     */
    addWorld(planet) {
      const world = makeWorld(planet);
      worlds.push(world);
      measureNeighbourGaps(worlds);
      api.worldById.set(planet.id, world);
      api.touchAreas.push(world.touchArea);
      if (lastResolution) world.orbit.material.resolution.set(lastResolution.width, lastResolution.height);
      world.impulse = 1;
      return world;
    },
    worldById: new Map(worlds.map((world) => [world.planet.id, world])),
    /**
     * Names are drawn in world units, so a phone standing twice as far back to
     * fit the system would read them at half the size. Hold them steady.
     */
    setLabelScale(factor) {
      const eased = Math.min(2.6, Math.max(0.85, factor));
      for (const world of worlds) world.label.scale.set(1.34 * eased, 0.335 * eased, 1);
    },
    /**
     * A finger is a fixed number of pixels wide however far the camera stands
     * back, so a touch target has to be solved against the camera rather than
     * baked when the system is built. Measured on a portrait phone before this
     * existed, every one of the catalogue's worlds was between 15 and 42
     * pixels across — not one reached the 44 this instrument asks of anything
     * a finger must hit.
     */
    setTouchScale(pixelsPerWorldUnit) {
      if (!Number.isFinite(pixelsPerWorldUnit) || pixelsPerWorldUnit <= 0) return;
      for (const world of worlds) {
        const radius = systemTouchRadius({
          bodyRadius: world.bodyRadius,
          pixelsPerWorldUnit,
          neighbourGap: world.neighbourGap,
        });
        world.touchArea.scale.setScalar(radius / world.touchBaseRadius);
      }
    },
    touchAreas: worlds.map((world) => world.touchArea),
    /** Advance every world by real period ratios: one shared time compression. */
    advance(delta, secondsPerFastestOrbit = systemSecondsPerFastestOrbit, decayDelta = delta) {
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
        if (world.rings) world.rings.position.copy(world.body.position);
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
      // A ring passing BEHIND its star is the strongest depth cue any picture
      // of a planetary system has, and without a depth buffer it happens
      // backwards: three sorts a transparent object by its origin, so every
      // orbit ellipse painted straight across the star's disc and across any
      // world standing on the far side. That single inversion is most of why a
      // real three-dimensional system read as a flat diagram. Once a system is
      // fully present it is opaque and writes depth, and the ellipses fall
      // behind the bodies where they belong.
      const solid = opacity > 0.985;
      star.material.transparent = !solid;
      star.material.depthWrite = solid;
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
        world.body.material.transparent = !solid;
        world.body.material.depthWrite = solid;
        world.halo.material.opacity = opacity * (0.07 + world.impulse * 0.62);
        if (world.rings) {
          world.rings.material.opacity = opacity * (0.28 + labelMix * 0.34);
          world.rings.visible = world.rings.material.opacity > 0.02;
        }
        world.label.material.opacity = labelMix * opacity * (0.72 + world.impulse * 0.28);
        world.label.visible = world.label.material.opacity > 0.02;
        world.touchArea.visible = labelMix > 0.5;
      }
    },
    setResolution(width, height) {
      lastResolution = { width, height };
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
        world.rings?.geometry.dispose();
        world.rings?.material.dispose();
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
  return api;
}
