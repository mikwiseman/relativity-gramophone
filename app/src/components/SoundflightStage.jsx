import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

import {
  FIXED_STEP,
  GRAVITATIONAL_CONSTANT,
  MAX_WORLDS,
  PhysicsEngine,
  createInitialPhysicsState,
} from "../lib/physicsEngine.js";
import {
  STAR_CORE_RADIUS,
  birthBodyFromRadialLaunch,
  previewOrbit,
} from "../lib/starBirth.js";
import {
  bodyToStage,
  buildMusicalConnections,
  cameraScaleLabel,
  canBeginRadialLaunchFromHit,
  dopplerTintedColor,
  nextCameraDistance,
  selectRenderProfile,
  shouldRefreshMusicalConnection,
  sonicIntensity,
  voiceVisual,
} from "../lib/soundflight.js";
import { nearestStringPoint } from "../lib/harpStrings.js";

const STAGE_SCALE = 10;
const MAX_FRAME_DELTA = 0.1;
const STRING_TOUCH_DISTANCE = 14;
const STRING_PLUCK_COOLDOWN = 120;
const MAX_TRAIL_PARTICLES = 1100;
const MAX_TRAIL_POINTS = 256;
const RIBBON_HIGHLIGHT = 0xffeed6;

const trailVertexShader = `
  attribute float aAlpha;
  varying float vAlpha;
  void main() {
    vAlpha = aAlpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const trailFragmentShader = `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(uColor, vAlpha * uOpacity);
  }
`;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function eventPoint(event, target) {
  const rect = target.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function stageToWorld(point) {
  return { x: point.x / STAGE_SCALE, y: -point.z / STAGE_SCALE };
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function createRadialTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, "rgba(255,247,215,1)");
  gradient.addColorStop(0.16, "rgba(255,190,88,0.82)");
  gradient.addColorStop(0.48, "rgba(255,126,76,0.18)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createStarGloryTexture() {
  const size = 512;
  const half = size / 2;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");

  const core = context.createRadialGradient(half, half, 0, half, half, half);
  core.addColorStop(0, "rgba(255,250,232,1)");
  core.addColorStop(0.1, "rgba(255,214,132,0.9)");
  core.addColorStop(0.3, "rgba(255,150,70,0.3)");
  core.addColorStop(0.62, "rgba(255,112,58,0.07)");
  core.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = core;
  context.fillRect(0, 0, size, size);

  context.globalCompositeOperation = "lighter";
  context.translate(half, half);
  for (let ray = 0; ray < 26; ray += 1) {
    const angle = (ray / 26) * Math.PI * 2;
    const reach = half * (0.5 + 0.42 * Math.abs(Math.sin(ray * 2.39996 + 0.8)));
    const width = 1.1 + 2.3 * Math.abs(Math.sin(ray * 1.7));
    const beam = context.createLinearGradient(0, 0, Math.cos(angle) * reach, Math.sin(angle) * reach);
    beam.addColorStop(0, "rgba(255,206,138,0.16)");
    beam.addColorStop(0.4, "rgba(255,172,96,0.05)");
    beam.addColorStop(1, "rgba(255,150,80,0)");
    context.strokeStyle = beam;
    context.lineWidth = width;
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(Math.cos(angle) * reach, Math.sin(angle) * reach);
    context.stroke();
  }
  for (const [ringRadius, alpha] of [[0.58, 0.05], [0.78, 0.03]]) {
    context.strokeStyle = `rgba(255,196,120,${alpha})`;
    context.lineWidth = 1.6;
    context.beginPath();
    context.arc(0, 0, half * ringRadius, 0, Math.PI * 2);
    context.stroke();
  }
  context.setTransform(1, 0, 0, 1, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const STAR_TINTS = [
  [1, 0.95, 0.86],
  [1, 0.87, 0.68],
  [0.82, 0.89, 1],
  [0.68, 0.8, 0.98],
  [1, 0.78, 0.66],
];

const starfieldVertexShader = `
  attribute float aSize;
  attribute float aPhase;
  attribute float aTwinkleSpeed;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uTwinkle;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vGlow;
  void main() {
    vColor = aColor;
    float twinkle = 1.0 - uTwinkle * (0.32 + 0.18 * sin(aPhase * 3.7)) * (0.5 + 0.5 * sin(uTime * aTwinkleSpeed + aPhase));
    vGlow = twinkle;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = min(aSize * uPixelRatio * twinkle * (110.0 / -mvPosition.z), 4.6 * uPixelRatio);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const starfieldFragmentShader = `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vGlow;
  void main() {
    vec2 offset = gl_PointCoord - vec2(0.5);
    float falloff = smoothstep(0.5, 0.04, length(offset));
    gl_FragColor = vec4(vColor, falloff * uOpacity * vGlow);
  }
`;

function createStarfield({ starCount, dustCount, twinkle }) {
  const random = seededRandom(299792458);
  const total = starCount + dustCount;
  const positions = new Float32Array(total * 3);
  const colors = new Float32Array(total * 3);
  const sizes = new Float32Array(total);
  const phases = new Float32Array(total);
  const speeds = new Float32Array(total);

  for (let index = 0; index < starCount; index += 1) {
    const radius = 34 + random() * 34;
    const theta = random() * Math.PI * 2;
    const elevation = Math.asin(random() * 2 - 1) * 0.92;
    positions[index * 3] = radius * Math.cos(elevation) * Math.cos(theta);
    positions[index * 3 + 1] = radius * Math.sin(elevation);
    positions[index * 3 + 2] = radius * Math.cos(elevation) * Math.sin(theta);
    const tint = STAR_TINTS[Math.floor(random() * STAR_TINTS.length)];
    const magnitude = random();
    const accent = random() < 0.03;
    const brightness = accent ? 0.85 + random() * 0.15 : 0.16 + magnitude * 0.4;
    colors[index * 3] = tint[0] * brightness;
    colors[index * 3 + 1] = tint[1] * brightness;
    colors[index * 3 + 2] = tint[2] * brightness;
    sizes[index] = accent ? 2 + random() * 1.1 : 0.3 + magnitude * magnitude * 1;
    phases[index] = random() * Math.PI * 2;
    speeds[index] = 0.24 + random() * 1.1;
  }

  for (let index = starCount; index < total; index += 1) {
    const radius = 15 + random() * 22;
    const theta = random() * Math.PI * 2;
    positions[index * 3] = radius * Math.cos(theta);
    positions[index * 3 + 1] = -2 + random() * 2.6;
    positions[index * 3 + 2] = radius * Math.sin(theta);
    const warmth = 0.34 + random() * 0.3;
    colors[index * 3] = warmth;
    colors[index * 3 + 1] = warmth * (0.74 + random() * 0.12);
    colors[index * 3 + 2] = warmth * (0.5 + random() * 0.14);
    sizes[index] = 0.26 + random() * 0.5;
    phases[index] = random() * Math.PI * 2;
    speeds[index] = 0.12 + random() * 0.5;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute("aTwinkleSpeed", new THREE.BufferAttribute(speeds, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uTwinkle: { value: twinkle ? 1 : 0 },
      uPixelRatio: { value: 1 },
      uOpacity: { value: 0.66 },
    },
    vertexShader: starfieldVertexShader,
    fragmentShader: starfieldFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = -10;
  return points;
}

function createEnvironmentTexture(renderer) {
  const environmentScene = new THREE.Scene();
  const gradient = new THREE.Mesh(
    new THREE.SphereGeometry(10, 32, 16),
    new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true }),
  );
  const positionAttribute = gradient.geometry.getAttribute("position");
  const gradientColors = new Float32Array(positionAttribute.count * 3);
  const deepBelow = new THREE.Color(0x120803);
  const warmHorizon = new THREE.Color(0x4a2a10);
  const coolAbove = new THREE.Color(0x0d1b2c);
  for (let index = 0; index < positionAttribute.count; index += 1) {
    const y = positionAttribute.getY(index) / 10;
    const color = y < 0
      ? warmHorizon.clone().lerp(deepBelow, Math.min(1, -y * 1.4))
      : warmHorizon.clone().lerp(coolAbove, Math.min(1, y * 1.25));
    gradientColors[index * 3] = color.r;
    gradientColors[index * 3 + 1] = color.g;
    gradientColors[index * 3 + 2] = color.b;
  }
  gradient.geometry.setAttribute("color", new THREE.BufferAttribute(gradientColors, 3));
  environmentScene.add(gradient);

  const warmKey = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 2.6),
    new THREE.MeshBasicMaterial({ color: 0xffb45e, side: THREE.DoubleSide }),
  );
  warmKey.position.set(0, -3.4, 0);
  warmKey.rotation.x = Math.PI / 2;
  environmentScene.add(warmKey);

  const coolFill = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 3.2),
    new THREE.MeshBasicMaterial({ color: 0x3e5d80, side: THREE.DoubleSide }),
  );
  coolFill.position.set(-2, 5.2, 1);
  coolFill.rotation.x = Math.PI / 2;
  environmentScene.add(coolFill);

  const accent = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 1.4),
    new THREE.MeshBasicMaterial({ color: 0xb26df2, side: THREE.DoubleSide }),
  );
  accent.position.set(5.4, 1.6, -3.4);
  accent.lookAt(0, 0, 0);
  environmentScene.add(accent);

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const environmentTexture = pmremGenerator.fromScene(environmentScene, 0.36).texture;
  pmremGenerator.dispose();
  disposeObject(environmentScene);
  return environmentTexture;
}

function createTrailMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 0.7 },
    },
    vertexShader: trailVertexShader,
    fragmentShader: trailFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

function createTrailLine(color) {
  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(new Float32Array(MAX_TRAIL_POINTS * 3), 3);
  const alphaAttribute = new THREE.BufferAttribute(new Float32Array(MAX_TRAIL_POINTS), 1);
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  alphaAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positionAttribute);
  geometry.setAttribute("aAlpha", alphaAttribute);
  geometry.setDrawRange(0, 0);
  const material = createTrailMaterial(color);
  const line = new THREE.Line(geometry, material);
  line.frustumCulled = false;
  return line;
}

function createRibbonTrail() {
  const group = new THREE.Group();
  const widths = [2.4, 2, 1.6];
  const lines = widths.map((linewidth) => {
    const geometry = new LineGeometry();
    geometry.setPositions([0, 0, 0, 0, 0, 0]);
    const material = new LineMaterial({
      color: 0xffffff,
      linewidth,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      alphaToCoverage: true,
    });
    const line = new Line2(geometry, material);
    line.frustumCulled = false;
    group.add(line);
    return line;
  });
  group.visible = false;
  return { group, lines, strandColor: new THREE.Color(), shiftedColor: new THREE.Color() };
}

function updateRibbonTrail(ribbon, history, intensity, color) {
  if (history.length < 2) {
    ribbon.group.visible = false;
    return;
  }
  ribbon.group.visible = true;
  ribbon.strandColor.setHex(color);
  ribbon.shiftedColor.setHex(color).offsetHSL(0.055, -0.08, 0.1);
  const strandColors = [ribbon.strandColor, RIBBON_HIGHLIGHT, ribbon.shiftedColor];
  for (let lineIndex = 0; lineIndex < ribbon.lines.length; lineIndex += 1) {
    const phase = lineIndex * 2.1;
    const positions = [];
    for (let index = 0; index < history.length; index += 1) {
      const point = history[index];
      const previous = history[Math.max(0, index - 1)];
      const next = history[Math.min(history.length - 1, index + 1)];
      const dx = next.x - previous.x;
      const dz = next.z - previous.z;
      const length = Math.max(0.0001, Math.hypot(dx, dz));
      const progress = index / Math.max(1, history.length - 1);
      const braid = Math.sin(progress * 18 + phase) * 0.16 * progress;
      positions.push(
        point.x - (dz / length) * braid,
        0.03 + (lineIndex - 1) * 0.045 + Math.cos(progress * 13 + phase) * 0.04 * progress,
        point.z + (dx / length) * braid,
      );
    }
    const line = ribbon.lines[lineIndex];
    line.material.color.set(strandColors[lineIndex]);
    line.geometry.setPositions(positions);
    line.material.opacity = (0.035 + intensity * 0.13) * (1 - lineIndex * 0.24);
  }
}

function updateTrailLine(line, history, phase, intensity) {
  const count = Math.min(history.length, MAX_TRAIL_POINTS);
  if (count < 2 || intensity <= 0) {
    line.visible = false;
    return;
  }

  const positionAttribute = line.geometry.getAttribute("position");
  const alphaAttribute = line.geometry.getAttribute("aAlpha");
  const positions = positionAttribute.array;
  const alphas = alphaAttribute.array;
  const first = history.length - count;
  for (let index = 0; index < count; index += 1) {
    const point = history[first + index];
    const previous = history[Math.max(first, first + index - 1)];
    const next = history[Math.min(history.length - 1, first + index + 1)];
    const dx = next.x - previous.x;
    const dz = next.z - previous.z;
    const length = Math.max(0.0001, Math.hypot(dx, dz));
    const progress = index / Math.max(1, count - 1);
    const braid = Math.sin(progress * 18 + phase) * 0.085 * progress;
    positions[index * 3] = point.x - (dz / length) * braid;
    positions[index * 3 + 1] = 0.025 + Math.cos(progress * 13 + phase) * 0.025 * progress;
    positions[index * 3 + 2] = point.z + (dx / length) * braid;
    alphas[index] = Math.pow(progress, 1.7);
  }
  positionAttribute.needsUpdate = true;
  alphaAttribute.needsUpdate = true;
  line.geometry.setDrawRange(0, count);
  line.material.uniforms.uOpacity.value = intensity;
  line.visible = true;
}

function createPlanetVisual(opalTexture, radialTexture) {
  const group = new THREE.Group();
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xf5f0e8,
    map: opalTexture,
    emissiveMap: opalTexture,
    emissive: new THREE.Color(0x6f8fac),
    emissiveIntensity: 0.3,
    roughness: 0.28,
    metalness: 0.03,
    clearcoat: 0.84,
    clearcoatRoughness: 0.16,
    iridescence: 0.76,
    iridescenceIOR: 1.48,
    transmission: 0.04,
    envMapIntensity: 1.15,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  group.add(mesh);

  const rim = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture,
    color: 0xbceef5,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }));
  rim.scale.setScalar(3.4);
  group.add(rim);

  const trailLine = createTrailLine(0xffe9c9);

  return {
    group,
    mesh,
    rim,
    trailLine,
    trailColor: new THREE.Color(),
    history: [],
    lastTrailSample: -Infinity,
    impulse: 0,
  };
}

function createStarVisual(solarTexture, radialTexture) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: 0xffc36a,
    map: solarTexture,
    emissiveMap: solarTexture,
    emissive: new THREE.Color(0xff9d36),
    emissiveIntensity: 1.5,
    roughness: 0.58,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.25, 64, 48), material);
  group.add(mesh);

  const glory = new THREE.Sprite(new THREE.SpriteMaterial({
    map: createStarGloryTexture(),
    color: 0xffc678,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }));
  glory.scale.set(2.6, 2.6, 1);
  group.add(glory);

  const corona = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture,
    color: 0xffb552,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }));
  corona.scale.set(1.9, 1.9, 1);
  group.add(corona);

  const outerCorona = corona.clone();
  outerCorona.material = corona.material.clone();
  outerCorona.material.opacity = 0.1;
  outerCorona.scale.set(3.7, 3.7, 1);
  group.add(outerCorona);

  const ambientHalo = corona.clone();
  ambientHalo.material = corona.material.clone();
  ambientHalo.material.opacity = 0.05;
  ambientHalo.material.color.setHex(0xff9e4a);
  ambientHalo.scale.set(11, 11, 1);
  group.add(ambientHalo);

  const light = new THREE.PointLight(0xffb25b, 4.8, 36, 1.7);
  group.add(light);
  return { group, mesh, glory, corona, outerCorona, ambientHalo, impulse: 0 };
}

function predictTrailHistory(snapshot, bodyId, sampleCount) {
  const prediction = new PhysicsEngine({
    model: snapshot.model,
    time: snapshot.time,
    bodies: snapshot.bodies,
  });
  const points = [];
  for (let index = 0; index < sampleCount; index += 1) {
    for (let step = 0; step < 11; step += 1) prediction.step();
    const body = prediction.getBody(bodyId);
    if (!body) break;
    points.push(bodyToStage(body, STAGE_SCALE));
  }
  return points.reverse();
}

function createLaunchPreview() {
  const group = new THREE.Group();
  const seed = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 32, 24),
    new THREE.MeshPhysicalMaterial({
      color: 0xf2e3d2,
      emissive: 0xb971ff,
      emissiveIntensity: 2.4,
      roughness: 0.24,
      clearcoat: 0.8,
      iridescence: 1,
    }),
  );
  group.add(seed);
  const guideLine = createTrailLine(0xc79cff);
  const orbitLine = createTrailLine(0xc79cff);
  group.add(guideLine, orbitLine);
  group.visible = false;
  return { group, seed, guideLine, orbitLine };
}

function createParticleCloud() {
  const random = seededRandom(1905);
  const positions = new Float32Array(MAX_TRAIL_PARTICLES * 3);
  for (let index = 0; index < MAX_TRAIL_PARTICLES; index += 1) {
    positions[index * 3] = random() * 0.001;
    positions[index * 3 + 1] = random() * 0.001;
    positions[index * 3 + 2] = random() * 0.001;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    map: createRadialTexture(),
    size: 0.038,
    vertexColors: false,
    color: 0xffffff,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.userData.random = random;
  return points;
}

function updateParticleCloud(points, history, count, time, intensity) {
  points.geometry.setDrawRange(0, count);
  points.material.opacity = 0.08 + intensity * 0.34;
  if (history.length < 2) {
    points.visible = false;
    return;
  }
  points.visible = true;
  const positions = points.geometry.getAttribute("position");
  for (let index = 0; index < count; index += 1) {
    const fraction = ((index * 0.61803398875) + time * 0.008 * ((index % 7) + 1)) % 1;
    const historyIndex = Math.min(history.length - 1, Math.floor(fraction * history.length));
    const point = history[historyIndex];
    const envelope = Math.pow(historyIndex / Math.max(1, history.length - 1), 1.2);
    const angle = index * 2.399963 + time * (0.18 + (index % 5) * 0.014);
    const radius = (0.02 + (index % 13) * 0.0054) * envelope;
    positions.setXYZ(
      index,
      point.x + Math.cos(angle) * radius,
      0.02 + Math.sin(angle * 1.7) * radius * 0.72,
      point.z + Math.sin(angle) * radius,
    );
  }
  positions.needsUpdate = true;
}

function createHarmonicKnot() {
  const line = createTrailLine(0xf8dd99);
  line.material.uniforms.uOpacity.value = 0;
  return line;
}

const FinishingShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.34 },
    uGrain: { value: 0.05 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignette;
    uniform float uGrain;
    varying vec2 vUv;
    float hash(vec2 point) {
      return fract(sin(dot(point, vec2(12.9898, 78.233))) * 43758.5453123);
    }
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec2 centered = vUv - 0.5;
      float vignette = 1.0 - uVignette * smoothstep(0.32, 0.92, dot(centered, centered) * 2.4);
      float grain = (hash(vUv * 967.0 + fract(uTime) * 71.0) - 0.5) * uGrain;
      float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      color.rgb = color.rgb * vignette + grain * (0.18 + luma);
      gl_FragColor = color;
    }
  `,
};

function createMusicalLink(color) {
  const geometry = new LineGeometry();
  geometry.setPositions(new Float32Array(37 * 3));
  const material = new LineMaterial({
    color,
    linewidth: 2.1,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    alphaToCoverage: true,
  });
  const line = new Line2(geometry, material);
  line.frustumCulled = false;
  const pulse = new THREE.Sprite(new THREE.SpriteMaterial({
    map: createRadialTexture(),
    color,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }));
  pulse.scale.setScalar(0.42);
  pulse.visible = false;
  return {
    line,
    pulse,
    color,
    sourceId: null,
    endpoints: new Float32Array(4),
    hasGeometry: false,
    geometryUpdatedAt: -Infinity,
    curve: { firstX: 0, firstZ: 0, secondX: 0, secondZ: 0, bendDirection: 1 },
    pulseAt: -Infinity,
  };
}

function setCurvePosition(target, curve, progress) {
  const {
    firstX,
    firstZ,
    secondX,
    secondZ,
    bendDirection,
  } = curve;
  const dx = secondX - firstX;
  const dz = secondZ - firstZ;
  const length = Math.max(0.001, Math.hypot(dx, dz));
  const arc = Math.sin(progress * Math.PI) * Math.min(0.42, length * 0.12) * bendDirection;
  target.set(
    THREE.MathUtils.lerp(firstX, secondX, progress) - (dz / length) * arc,
    0.07 + Math.sin(progress * Math.PI) * 0.07,
    THREE.MathUtils.lerp(firstZ, secondZ, progress) + (dx / length) * arc,
  );
}

function writeMusicalCurve(link, first, second, bendDirection, now) {
  const dx = second.x - first.x;
  const dz = second.z - first.z;
  const length = Math.max(0.001, Math.hypot(dx, dz));
  const normalX = -dz / length;
  const normalZ = dx / length;
  const bend = Math.min(0.42, length * 0.12) * bendDirection;
  const buffer = link.line.geometry.attributes.instanceStart.data;
  const positions = buffer.array;
  for (let segment = 0; segment < 36; segment += 1) {
    for (let endpoint = 0; endpoint < 2; endpoint += 1) {
      const progress = (segment + endpoint) / 36;
      const arc = Math.sin(progress * Math.PI) * bend;
      const offset = segment * 6 + endpoint * 3;
      positions[offset] = THREE.MathUtils.lerp(first.x, second.x, progress) + normalX * arc;
      positions[offset + 1] = 0.04 + Math.sin(progress * Math.PI) * 0.07;
      positions[offset + 2] = THREE.MathUtils.lerp(first.z, second.z, progress) + normalZ * arc;
    }
  }
  buffer.needsUpdate = true;
  link.endpoints[0] = first.x;
  link.endpoints[1] = first.z;
  link.endpoints[2] = second.x;
  link.endpoints[3] = second.z;
  link.curve.firstX = first.x;
  link.curve.firstZ = first.z;
  link.curve.secondX = second.x;
  link.curve.secondZ = second.z;
  link.curve.bendDirection = bendDirection;
  link.geometryUpdatedAt = now;
  link.hasGeometry = true;
}

function updateMusicalLinks(runtime, snapshot, stageBodies, now) {
  const star = snapshot.bodies.find((body) => body.kind === "star");
  const planets = snapshot.bodies.filter((body) => body.kind === "planet");
  if (!star) return;
  const definitions = buildMusicalConnections(planets, star);
  const liveIds = new Set(definitions.map((definition) => definition.bodyId));

  for (const [bodyId, link] of runtime.musicalLinks) {
    if (liveIds.has(bodyId)) continue;
    runtime.scene.remove(link.line, link.pulse);
    disposeObject(link.line);
    link.pulse.material.map?.dispose();
    link.pulse.material.dispose();
    runtime.musicalLinks.delete(bodyId);
  }

  for (let index = 0; index < definitions.length; index += 1) {
    const definition = definitions[index];
    let link = runtime.musicalLinks.get(definition.bodyId);
    if (!link || link.color !== definition.color) {
      if (link) {
        runtime.scene.remove(link.line, link.pulse);
        disposeObject(link.line);
        link.pulse.material.map?.dispose();
        link.pulse.material.dispose();
      }
      link = createMusicalLink(definition.color);
      runtime.scene.add(link.line, link.pulse);
      runtime.musicalLinks.set(definition.bodyId, link);
    }

    const first = stageBodies.get(definition.sourceId);
    const second = stageBodies.get(definition.bodyId);
    if (!first || !second) {
      link.line.visible = false;
      link.pulse.visible = false;
      continue;
    }
    link.sourceId = definition.sourceId;
    if (shouldRefreshMusicalConnection({
      now,
      lastUpdatedAt: link.geometryUpdatedAt,
      previous: link.hasGeometry ? link.endpoints : null,
      first,
      second,
      minInterval: 1 / 30,
    })) {
      writeMusicalCurve(link, first, second, index % 2 === 0 ? 1 : -1, now);
    }
    const bodyVisual = runtime.bodyVisuals.get(definition.bodyId);
    const selected = definition.bodyId === runtime.selectedBodyId;
    const impulse = bodyVisual?.impulse ?? 0;
    link.line.material.resolution.set(runtime.renderer.domElement.clientWidth, runtime.renderer.domElement.clientHeight);
    link.line.material.opacity = 0.36 + (selected ? 0.12 : 0) + impulse * 0.4;
    link.line.visible = true;

    const pendingPulseAt = runtime.pendingLinkPulses.get(definition.bodyId);
    if (pendingPulseAt !== undefined) {
      link.pulseAt = pendingPulseAt;
      runtime.pendingLinkPulses.delete(definition.bodyId);
    }
    const pulseAge = now - link.pulseAt;
    if (pulseAge >= 0 && pulseAge <= 0.9) {
      const progress = pulseAge / 0.9;
      setCurvePosition(link.pulse.position, link.curve, progress);
      link.pulse.material.opacity = Math.sin(progress * Math.PI) * 0.92;
      link.pulse.scale.setScalar(0.28 + Math.sin(progress * Math.PI) * 0.34);
      link.pulse.visible = true;
    } else {
      link.pulse.visible = false;
    }
  }
}

function updateHarmonicKnot(line, resonance, bodiesById) {
  if (!resonance) {
    line.visible = false;
    return;
  }
  const first = bodiesById.get(resonance.bodyIds[0]);
  const second = bodiesById.get(resonance.bodyIds[1]);
  if (!first || !second) {
    line.visible = false;
    return;
  }
  const points = [];
  for (let index = 0; index <= 48; index += 1) {
    const progress = index / 48;
    const wave = Math.sin(progress * Math.PI * resonance.numerator * 2) * 0.11 * resonance.strength;
    points.push({
      x: THREE.MathUtils.lerp(first.x, second.x, progress),
      y: wave,
      z: THREE.MathUtils.lerp(first.z, second.z, progress),
    });
  }
  updateTrailLine(line, points, 0, 0.12 + resonance.strength * 0.76);
}

function applyPlaybackEvent(engine, event) {
  if (event.kind === "pluck") return;
  if (event.kind === "set-body-state" || event.kind === "add-body" || event.kind === "remove-body") {
    engine.applyEvent(event);
    return;
  }
  if (!Number.isFinite(event.semiMajor)) return;
  const star = engine.getBody("star");
  const body = engine.getBody(event.bodyId);
  if (!star || !body) return;
  const angle = Number.isFinite(event.phase) ? event.phase : Math.atan2(body.y - star.y, body.x - star.x);
  const expectedPeriod = Math.PI * 2 * Math.sqrt(
    (event.semiMajor ** 3) / (GRAVITATIONAL_CONSTANT * (star.mass + body.mass)),
  );
  const velocityScale = Number.isFinite(event.period) ? clamp(expectedPeriod / event.period, 0.72, 1.22) : 1;
  engine.setOrbitFromGesture(event.bodyId, {
    x: star.x + Math.cos(angle) * event.semiMajor,
    y: star.y + Math.sin(angle) * event.semiMajor,
    velocityScale,
  });
}

function disposeObject(root) {
  root.traverse((object) => {
    object.geometry?.dispose();
    if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
    else object.material?.dispose();
  });
}

export function SoundflightStage(props) {
  const mountRef = useRef(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const engineRef = useRef(null);
  const initialStateRef = useRef(null);
  const accumulatorRef = useRef(0);
  const previousFrameRef = useRef(performance.now());
  const appliedEventIndexRef = useRef(0);
  const previousSideRef = useRef(new Map());
  const previousRadialVelocityRef = useRef(new Map());
  const birthCountRef = useRef(0);
  const visualRuntimeRef = useRef(null);
  const physicalBodiesSignature = useMemo(() => JSON.stringify(
    props.bodies.map(({ voice: _voice, ...body }) => body),
  ), [props.bodies]);

  if (!engineRef.current) {
    initialStateRef.current = props.initialState
      ? structuredClone(props.initialState)
      : createInitialPhysicsState(props.bodies);
    engineRef.current = new PhysicsEngine(initialStateRef.current);
    birthCountRef.current = initialStateRef.current.bodies.filter((body) => body.created).length;
  }

  useEffect(() => {
    for (const compositionBody of props.bodies) {
      const physicalBody = engineRef.current.getBody(compositionBody.id);
      if (physicalBody) physicalBody.voice = compositionBody.voice;
    }
  }, [props.bodies]);

  useEffect(() => {
    const nextInitialState = props.initialState
      ? structuredClone(props.initialState)
      : createInitialPhysicsState(props.bodies);
    initialStateRef.current = nextInitialState;
    engineRef.current.reset(nextInitialState);
    accumulatorRef.current = 0;
    appliedEventIndexRef.current = 0;
    previousSideRef.current = new Map(
      nextInitialState.bodies
        .filter((body) => body.kind === "planet")
        .map((body) => [body.id, Math.sign(body.x)]),
    );
    previousRadialVelocityRef.current.clear();
    birthCountRef.current = nextInitialState.bodies.filter((body) => body.created).length;
    const runtime = visualRuntimeRef.current;
    if (runtime) {
      for (const visual of runtime.bodyVisuals.values()) {
        visual.history = [];
        visual.impulse = 0;
      }
    }
    props.onElapsed(0);
  }, [props.initialState, physicalBodiesSignature, props.resetToken]);

  useEffect(() => {
    const mount = mountRef.current;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x020202, 0.018);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 100);
    camera.position.set(-1.6, 4.6, 11.2);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(0x030303, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = false;
    renderer.domElement.className = "soundflight-canvas";
    renderer.domElement.setAttribute("aria-hidden", "true");
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.055;
    controls.zoomToCursor = true;
    controls.enableRotate = false;
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.rotateSpeed = 0.34;
    controls.panSpeed = 0.62;
    controls.zoomSpeed = 0.82;
    controls.minDistance = 3.2;
    controls.maxDistance = 24;
    controls.minPolarAngle = 0.24;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.screenSpacePanning = true;
    controls.target.set(0.5, 0, 0);
    controls.listenToKeyEvents(window);
    controls.update();

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 1.08, 0.68, 0.52);
    composer.addPass(bloomPass);
    const finishingPass = new ShaderPass(FinishingShader);
    composer.addPass(finishingPass);
    composer.addPass(new OutputPass());

    scene.environment = createEnvironmentTexture(renderer);
    scene.environmentIntensity = 0.62;

    const loadingManager = new THREE.LoadingManager();
    loadingManager.onError = (url) => {
      propsRef.current.onBirthRefused(`SOUNDFLIGHT ASSET FAILED: ${url}`);
    };
    const textureLoader = new THREE.TextureLoader(loadingManager);
    const baseUrl = import.meta.env.BASE_URL;
    const lacquerTexture = textureLoader.load(`${baseUrl}assets/soundflight/lacquer-space.webp`, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      scene.background = texture;
    });
    const opalTexture = textureLoader.load(`${baseUrl}assets/soundflight/opal-surface.webp`, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(1.6, 1.1);
      for (const visual of runtime.bodyVisuals.values()) {
        visual.mesh.material.map = texture;
        visual.mesh.material.emissiveMap = texture;
        visual.mesh.material.needsUpdate = true;
      }
    });
    const solarTexture = textureLoader.load(`${baseUrl}assets/soundflight/solar-surface.webp`, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      runtime.starVisual.mesh.material.map = texture;
      runtime.starVisual.mesh.material.emissiveMap = texture;
      runtime.starVisual.mesh.material.needsUpdate = true;
    });

    const ambient = new THREE.HemisphereLight(0x5f6f88, 0x170b05, 0.42);
    scene.add(ambient);
    const sharedRadialTexture = createRadialTexture();
    const starVisual = createStarVisual(solarTexture, sharedRadialTexture);
    scene.add(starVisual.group);
    const launchPreview = createLaunchPreview();
    scene.add(launchPreview.group);
    const particleCloud = createParticleCloud();
    scene.add(particleCloud);
    const ribbonTrail = createRibbonTrail();
    scene.add(ribbonTrail.group);
    const harmonicKnot = createHarmonicKnot();
    scene.add(harmonicKnot);

    const runtime = {
      scene,
      camera,
      renderer,
      controls,
      composer,
      bloomPass,
      finishingPass,
      lacquerTexture,
      opalTexture,
      solarTexture,
      sharedRadialTexture,
      starVisual,
      launchPreview,
      particleCloud,
      ribbonTrail,
      harmonicKnot,
      starfield: null,
      bodyVisuals: new Map(),
      musicalLinks: new Map(),
      pendingLinkPulses: new Map(),
      selectedBodyId: props.selectedBodyId,
      profile: null,
      selectedHistory: [],
      starBreath: 0.5,
      lastParticleUpdate: -Infinity,
      lastCameraReport: -Infinity,
      lastCameraCommandId: 0,
      resettingCamera: false,
      editorialCameraPosition: new THREE.Vector3(-1.6, 4.6, 11.2),
      editorialCameraTarget: new THREE.Vector3(0.5, 0, 0),
      raycaster: new THREE.Raycaster(),
      pointer: new THREE.Vector2(),
      plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
      planePoint: new THREE.Vector3(),
      drag: null,
      birth: null,
      pluck: null,
      latestGesture: null,
      lastGestureEmit: 0,
    };
    visualRuntimeRef.current = runtime;

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const measure = () => {
      const rect = mount.getBoundingClientRect();
      const profile = selectRenderProfile({
        width: rect.width,
        height: rect.height,
        devicePixelRatio: window.devicePixelRatio,
        hardwareConcurrency: navigator.hardwareConcurrency,
        reducedMotion: reducedMotionQuery.matches,
      });
      runtime.profile = profile;
      renderer.setPixelRatio(profile.pixelRatio);
      renderer.setSize(rect.width, rect.height, false);
      composer.setPixelRatio(profile.pixelRatio);
      composer.setSize(rect.width, rect.height);
      camera.aspect = rect.width / Math.max(1, rect.height);
      camera.fov = camera.aspect < 0.8 ? 55 : 42;
      camera.updateProjectionMatrix();
      bloomPass.strength = profile.bloomStrength;
      finishingPass.uniforms.uGrain.value = profile.grain ? 0.05 : 0;
      if (!runtime.starfield
        || runtime.starfield.userData.starCount !== profile.starCount
        || runtime.starfield.userData.twinkle !== profile.twinkle) {
        if (runtime.starfield) {
          scene.remove(runtime.starfield);
          disposeObject(runtime.starfield);
        }
        runtime.starfield = createStarfield(profile);
        runtime.starfield.userData.starCount = profile.starCount;
        runtime.starfield.userData.twinkle = profile.twinkle;
        scene.add(runtime.starfield);
      }
      runtime.starfield.material.uniforms.uPixelRatio.value = profile.pixelRatio;
    };
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(mount);
    reducedMotionQuery.addEventListener("change", measure);
    measure();

    const intersectPlane = (event) => {
      const point = eventPoint(event, renderer.domElement);
      runtime.pointer.set((point.x / point.width) * 2 - 1, -(point.y / point.height) * 2 + 1);
      runtime.raycaster.setFromCamera(runtime.pointer, camera);
      return runtime.raycaster.ray.intersectPlane(runtime.plane, runtime.planePoint)
        ? runtime.planePoint.clone()
        : null;
    };

    const hitBody = (event) => {
      const point = eventPoint(event, renderer.domElement);
      runtime.pointer.set((point.x / point.width) * 2 - 1, -(point.y / point.height) * 2 + 1);
      runtime.raycaster.setFromCamera(runtime.pointer, camera);
      const meshes = [...runtime.bodyVisuals.values()].map((visual) => visual.mesh);
      const hit = runtime.raycaster.intersectObjects(meshes, false)[0];
      return hit?.object?.userData?.bodyId ?? null;
    };

    const trailPaths = () => {
      const rect = renderer.domElement.getBoundingClientRect();
      return [...runtime.bodyVisuals.entries()]
        .filter(([, visual]) => visual.history.length > 1)
        .map(([bodyId, visual]) => ({
          bodyId,
          points: visual.history.map((point) => {
            const projected = new THREE.Vector3(point.x, point.y, point.z).project(camera);
            return {
              x: (projected.x * 0.5 + 0.5) * rect.width,
              y: (-projected.y * 0.5 + 0.5) * rect.height,
            };
          }),
        }));
    };

    const performPluck = (hit, strength) => {
      const engine = engineRef.current;
      const body = engine.getBody(hit.bodyId);
      if (!body) return;
      const pluck = {
        offset: Number(clamp(hit.offset, 0, 1).toFixed(3)),
        strength: Number(clamp(strength, 0, 1).toFixed(2)),
      };
      const visual = runtime.bodyVisuals.get(body.id);
      if (visual) visual.impulse = 1;
      if (!propsRef.current.isListener) {
        propsRef.current.onBodyGesture({
          kind: "pluck",
          at: Number(engine.state.time.toFixed(6)),
          bodyId: body.id,
          ...pluck,
        });
      }
      propsRef.current.onBodySelect(body.id);
      runtime.pendingLinkPulses.set(body.id, performance.now() / 1000);
      propsRef.current.onPluckBloom({ ...body }, pluck);
    };

    const showLaunchPreview = (birth) => {
      const engine = engineRef.current;
      const star = engine.getBody("star");
      try {
        const candidate = birthBodyFromRadialLaunch({
          release: birth.release,
          star,
          existingIds: engine.state.bodies.filter((body) => body.kind === "planet").map((body) => body.id),
          birthIndex: birthCountRef.current,
        });
        const position = bodyToStage(candidate, STAGE_SCALE);
        const starPosition = bodyToStage(star, STAGE_SCALE);
        const voice = voiceVisual(candidate.voice);
        launchPreview.group.visible = true;
        launchPreview.seed.position.set(position.x, 0.08, position.z);
        launchPreview.seed.scale.setScalar(1.1);
        launchPreview.seed.material.emissive.setHex(voice.color);
        launchPreview.guideLine.material.uniforms.uColor.value.setHex(voice.color);
        launchPreview.orbitLine.material.uniforms.uColor.value.setHex(voice.color);
        updateTrailLine(launchPreview.guideLine, [
          { x: starPosition.x, y: 0.03, z: starPosition.z },
          { x: position.x, y: 0.08, z: position.z },
        ], 0.4, 0.72);
        updateTrailLine(
          launchPreview.orbitLine,
          previewOrbit(candidate, star).map((point) => bodyToStage(point, STAGE_SCALE)),
          0,
          0.36,
        );
        propsRef.current.onGestationTone(candidate);
      } catch (error) {
        if (error instanceof Error && /drag outward/i.test(error.message)) {
          const starPosition = bodyToStage(star, STAGE_SCALE);
          const releasePosition = bodyToStage(birth.release, STAGE_SCALE);
          launchPreview.group.visible = true;
          launchPreview.seed.position.set(releasePosition.x, 0.08, releasePosition.z);
          launchPreview.seed.scale.setScalar(0.72);
          updateTrailLine(launchPreview.guideLine, [starPosition, releasePosition], 0, 0.34);
          launchPreview.orbitLine.visible = false;
          propsRef.current.onGestationTone(null);
          return;
        }
        runtime.birth = null;
        controls.enabled = true;
        launchPreview.group.visible = false;
        propsRef.current.onLaunchPhase("armed");
        propsRef.current.onGestationTone(null);
        propsRef.current.onBirthRefused(error instanceof Error ? error.message : "The world could not be previewed");
      }
    };

    const onPointerDown = (event) => {
      const bodyId = hitBody(event);
      if (propsRef.current.interactionMode === "launch" && !canBeginRadialLaunchFromHit(bodyId)) {
        event.stopImmediatePropagation();
        propsRef.current.onLaunchPhase("armed");
        propsRef.current.onBirthRefused("Start at the star, then drag gently outward");
        return;
      }
      if (bodyId && propsRef.current.interactionMode !== "launch") {
        event.stopImmediatePropagation();
        renderer.domElement.setPointerCapture(event.pointerId);
        propsRef.current.onBodySelect(bodyId);
        propsRef.current.onBodyAudition(bodyId);
        if (!propsRef.current.isListener) {
          const planePoint = intersectPlane(event);
          runtime.drag = { id: bodyId, start: planePoint, pointerId: event.pointerId };
          controls.enabled = false;
          const grabbed = engineRef.current.getBody(bodyId);
          if (grabbed?.created) propsRef.current.onWorldGrabbed?.({ ...grabbed });
        }
        return;
      }

      if (propsRef.current.interactionMode !== "launch") {
        const point = eventPoint(event, renderer.domElement);
        const stringHit = nearestStringPoint(point, trailPaths(), STRING_TOUCH_DISTANCE);
        if (stringHit) {
          event.stopImmediatePropagation();
          renderer.domElement.setPointerCapture(event.pointerId);
          runtime.pluck = {
            lastPluckAt: new Map([[stringHit.bodyId, performance.now()]]),
            lastPoint: { x: point.x, y: point.y },
          };
          controls.enabled = false;
          performPluck(stringHit, 0.62);
          return;
        }
      }

      if (propsRef.current.interactionMode !== "launch" || propsRef.current.isListener) return;
      event.stopImmediatePropagation();
      const point = intersectPlane(event);
      if (!point) return;
      const star = engineRef.current.getBody("star");
      const world = stageToWorld(point);
      if (Math.hypot(world.x - star.x, world.y - star.y) > STAR_CORE_RADIUS * 1.8) {
        propsRef.current.onBirthRefused("Start at the star, then drag gently outward");
        return;
      }
      if (engineRef.current.state.bodies.filter((body) => body.kind === "planet").length >= MAX_WORLDS) {
        propsRef.current.onBirthRefused("The sky is full — feed a world to the star first");
        return;
      }
      renderer.domElement.setPointerCapture(event.pointerId);
      runtime.birth = { release: world, phase: "forming", pointerId: event.pointerId };
      propsRef.current.onLaunchPhase("forming");
      controls.enabled = false;
      showLaunchPreview(runtime.birth);
    };

    const onPointerMove = (event) => {
      if (runtime.birth) {
        event.stopImmediatePropagation();
        const point = intersectPlane(event);
        if (!point) return;
        const world = stageToWorld(point);
        runtime.birth.release = world;
        const star = engineRef.current.getBody("star");
        if (runtime.birth.phase !== "aiming" && Math.hypot(world.x - star.x, world.y - star.y) > 0.1) {
          runtime.birth.phase = "aiming";
          propsRef.current.onLaunchPhase("aiming");
        }
        showLaunchPreview(runtime.birth);
        return;
      }
      if (runtime.pluck) {
        event.stopImmediatePropagation();
        const point = eventPoint(event, renderer.domElement);
        const traveled = Math.hypot(point.x - runtime.pluck.lastPoint.x, point.y - runtime.pluck.lastPoint.y);
        const hit = nearestStringPoint(point, trailPaths(), STRING_TOUCH_DISTANCE);
        if (hit && traveled >= 6) {
          const lastAt = runtime.pluck.lastPluckAt.get(hit.bodyId) ?? -Infinity;
          if (performance.now() - lastAt > STRING_PLUCK_COOLDOWN) {
            performPluck(hit, 0.4 + Math.min(0.6, traveled / 230));
            runtime.pluck.lastPluckAt.set(hit.bodyId, performance.now());
            runtime.pluck.lastPoint = { x: point.x, y: point.y };
          }
        }
        return;
      }
      if (!runtime.drag || propsRef.current.isListener) return;
      event.stopImmediatePropagation();
      const point = intersectPlane(event);
      if (!point) return;
      const engine = engineRef.current;
      const star = engine.getBody("star");
      const body = engine.getBody(runtime.drag.id);
      if (!star || !body) return;
      const world = stageToWorld(point);
      if (body.created && Math.hypot(world.x - star.x, world.y - star.y) < STAR_CORE_RADIUS) {
        const victim = { ...body };
        const removal = engine.removeBody(body.id);
        runtime.drag = null;
        controls.enabled = true;
        propsRef.current.onBodyGesture(removal);
        propsRef.current.onConsumptionBloom(victim);
        return;
      }
      const start = runtime.drag.start ?? point;
      const tangentialTravel = Math.hypot(point.x - start.x, point.z - start.z);
      const gesture = engine.setOrbitFromGesture(body.id, {
        x: world.x,
        y: world.y,
        velocityScale: 1 + tangentialTravel / 42,
      });
      runtime.latestGesture = gesture;
      const now = performance.now();
      if (now - runtime.lastGestureEmit > 70) {
        runtime.lastGestureEmit = now;
        propsRef.current.onBodyGesture(gesture);
        runtime.latestGesture = null;
      }
    };

    const cancelPointer = (event) => {
      if (runtime.birth) {
        runtime.birth = null;
        launchPreview.group.visible = false;
        propsRef.current.onGestationTone(null);
        propsRef.current.onLaunchPhase("armed");
      }
      runtime.latestGesture = null;
      runtime.drag = null;
      runtime.pluck = null;
      controls.enabled = propsRef.current.interactionMode !== "launch";
      if (renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId);
      }
    };

    const finishPointer = (event) => {
      if (runtime.birth) {
        event.stopImmediatePropagation();
        const birth = runtime.birth;
        runtime.birth = null;
        launchPreview.group.visible = false;
        propsRef.current.onGestationTone(null);
        try {
          const engine = engineRef.current;
          const spec = birthBodyFromRadialLaunch({
            release: birth.release,
            star: engine.getBody("star"),
            existingIds: engine.state.bodies.filter((body) => body.kind === "planet").map((body) => body.id),
            birthIndex: birthCountRef.current,
          });
          const birthEvent = engine.addBody(spec);
          birthCountRef.current += 1;
          propsRef.current.onBodySelect(spec.id);
          propsRef.current.onBodyGesture(birthEvent);
          runtime.pendingLinkPulses.set(spec.id, performance.now() / 1000);
          propsRef.current.onBirthBloom({ ...engine.getBody(spec.id) });
          propsRef.current.onLaunchComplete(spec.id);
        } catch (error) {
          propsRef.current.onBirthRefused(error instanceof Error ? error.message : "The world could not be born");
        }
      }
      if (runtime.pluck) {
        runtime.pluck = null;
        controls.enabled = propsRef.current.interactionMode !== "launch";
        if (renderer.domElement.hasPointerCapture(event.pointerId)) {
          renderer.domElement.releasePointerCapture(event.pointerId);
        }
        return;
      }
      if (runtime.latestGesture) propsRef.current.onBodyGesture(runtime.latestGesture);
      runtime.latestGesture = null;
      runtime.drag = null;
      controls.enabled = propsRef.current.interactionMode !== "launch";
      if (renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId);
      }
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown, { capture: true });
    renderer.domElement.addEventListener("pointermove", onPointerMove, { capture: true });
    renderer.domElement.addEventListener("pointerup", finishPointer, { capture: true });
    renderer.domElement.addEventListener("pointercancel", cancelPointer, { capture: true });
    controls.addEventListener("start", () => {
      propsRef.current.onCameraNavigate();
    });

    const resetListenerLoop = () => {
      engineRef.current.reset(initialStateRef.current);
      appliedEventIndexRef.current = 0;
      accumulatorRef.current = 0;
      previousSideRef.current = new Map(
        engineRef.current.state.bodies
          .filter((body) => body.kind === "planet")
          .map((body) => [body.id, Math.sign(body.x)]),
      );
      previousRadialVelocityRef.current.clear();
    };

    const stepPhysics = () => {
      const engine = engineRef.current;
      const currentProps = propsRef.current;
      if (currentProps.isListener) {
        while (
          appliedEventIndexRef.current < currentProps.playbackEvents.length &&
          currentProps.playbackEvents[appliedEventIndexRef.current].at <= engine.state.time + FIXED_STEP / 2
        ) {
          const event = currentProps.playbackEvents[appliedEventIndexRef.current];
          if (event.kind === "pluck") {
            const body = engine.getBody(event.bodyId);
            if (body) {
              const visual = runtime.bodyVisuals.get(body.id);
              if (visual) visual.impulse = 1;
              runtime.pendingLinkPulses.set(body.id, performance.now() / 1000);
              currentProps.onPluckBloom({ ...body }, {
                offset: event.offset,
                strength: event.strength,
              });
            }
            appliedEventIndexRef.current += 1;
            continue;
          }
          if (event.kind === "remove-body") {
            const victim = engine.getBody(event.bodyId);
            if (victim) currentProps.onConsumptionBloom({ ...victim });
          }
          if (event.kind === "add-body") {
            applyPlaybackEvent(engine, event);
            const born = engine.getBody(event.body.id);
            if (born) {
              runtime.pendingLinkPulses.set(born.id, performance.now() / 1000);
              currentProps.onBirthBloom({ ...born });
            }
          } else {
            applyPlaybackEvent(engine, event);
          }
          appliedEventIndexRef.current += 1;
        }
      }

      engine.step();
      const star = engine.getBody("star");
      for (const body of engine.state.bodies) {
        if (body.kind !== "planet") continue;
        const side = Math.sign(body.x);
        const previousSide = previousSideRef.current.get(body.id);
        if (previousSide && side && previousSide !== side && !runtime.drag) {
          const note = {
            ...body,
            mass: body.displayMass,
            velocityX: body.vx - (star?.vx ?? 0),
          };
          const visual = runtime.bodyVisuals.get(body.id);
          if (visual) visual.impulse = 1;
          runtime.starVisual.impulse = Math.min(1, runtime.starVisual.impulse + 0.55);
          runtime.pendingLinkPulses.set(body.id, performance.now() / 1000);
          currentProps.onNote(note);
        }
        if (side) previousSideRef.current.set(body.id, side);
        if (star) {
          const dx = body.x - star.x;
          const dy = body.y - star.y;
          const radialVelocity = (dx * (body.vx - star.vx) + dy * (body.vy - star.vy)) /
            Math.max(0.001, Math.hypot(dx, dy));
          const previous = previousRadialVelocityRef.current.get(body.id);
          if (previous < 0 && radialVelocity >= 0) currentProps.onHaptic({ kind: "pericenter", strength: body.displayMass });
          previousRadialVelocityRef.current.set(body.id, radialVelocity);
        }
      }
    };

    const syncVisuals = (snapshot, delta, now) => {
      const liveIds = new Set(snapshot.bodies.filter((body) => body.kind === "planet").map((body) => body.id));
      for (const [bodyId, visual] of runtime.bodyVisuals) {
        if (liveIds.has(bodyId)) continue;
        scene.remove(visual.group);
        scene.remove(visual.trailLine);
        disposeObject(visual.trailLine);
        disposeObject(visual.group);
        runtime.bodyVisuals.delete(bodyId);
      }

      const selectedId = propsRef.current.interactionMode === "launch" ? null : propsRef.current.selectedBodyId;
      runtime.selectedBodyId = selectedId;
      const stageBodies = new Map();
      for (const body of snapshot.bodies) {
        const stage = bodyToStage(body, STAGE_SCALE);
        stageBodies.set(body.id, stage);
        if (body.kind === "star") {
          starVisual.group.position.lerp(new THREE.Vector3(stage.x, 0, stage.z), 1 - Math.exp(-delta * 18));
          starVisual.impulse *= Math.exp(-delta * 2.6);
          const breathPhase = Math.sin(snapshot.time * 1.4);
          const breath = 1 + breathPhase * 0.035 + starVisual.impulse * 0.06;
          starVisual.corona.scale.setScalar(1.9 * breath);
          starVisual.corona.material.opacity = 0.4 + starVisual.impulse * 0.22;
          starVisual.glory.scale.setScalar(2.6 * (1 + breathPhase * 0.022 + starVisual.impulse * 0.05));
          starVisual.glory.material.opacity = 0.5 + breathPhase * 0.05 + starVisual.impulse * 0.18;
          starVisual.glory.material.rotation += delta * 0.016;
          starVisual.outerCorona.scale.setScalar(3.7 * (1 + Math.sin(snapshot.time * 0.42) * 0.05));
          starVisual.mesh.rotation.y += delta * 0.07;
          runtime.starBreath = 0.5 + breathPhase * 0.5;
          continue;
        }

        let visual = runtime.bodyVisuals.get(body.id);
        if (!visual) {
          visual = createPlanetVisual(opalTexture, sharedRadialTexture);
          visual.mesh.userData.bodyId = body.id;
          visual.history = predictTrailHistory(snapshot, body.id, body.id === selectedId ? 90 : 48);
          scene.add(visual.trailLine);
          scene.add(visual.group);
          runtime.bodyVisuals.set(body.id, visual);
        }
        const target = new THREE.Vector3(stage.x, 0, stage.z);
        visual.group.position.lerp(target, 1 - Math.exp(-delta * 22));
        const selected = body.id === selectedId;
        const scale = (0.24 + body.displayMass * 0.095) * (selected ? 1.55 : 0.8);
        visual.mesh.scale.setScalar(scale);
        visual.rim.scale.setScalar(scale * 4.2);
        visual.mesh.rotation.y += delta * (0.12 + body.properRate * 0.08);
        visual.impulse *= Math.exp(-delta * 2.4);
        const intensity = sonicIntensity({
          displayMass: body.displayMass,
          doppler: body.doppler,
          resonanceStrength: snapshot.resonance?.bodyIds.includes(body.id) ? snapshot.resonance.strength : 0,
          impulse: visual.impulse,
        });
        visual.mesh.material.emissiveIntensity = selected
          ? 0.52 + intensity * 1.7
          : 0.16 + intensity * 0.44;
        const voiceColor = voiceVisual(body.voice).color;
        visual.rim.material.color.setHex(voiceColor);
        visual.rim.material.opacity = selected ? 0.16 + intensity * 0.5 : 0.06 + intensity * 0.12;
        const tinted = dopplerTintedColor(voiceColor, body.doppler);
        visual.trailColor.setRGB(tinted.r, tinted.g, tinted.b);
        visual.trailLine.material.uniforms.uColor.value.copy(visual.trailColor);

        if (propsRef.current.isPlaying && now - visual.lastTrailSample > 1 / 36) {
          visual.lastTrailSample = now;
          visual.history.push({ x: target.x, y: 0, z: target.z });
          const limit = selected ? runtime.profile.trailSamples : Math.min(56, runtime.profile.trailSamples);
          if (visual.history.length > limit) visual.history.splice(0, visual.history.length - limit);
        }
        const stringIntensity = propsRef.current.isPlaying
          ? (selected ? 0.14 + visual.impulse * 0.3 : 0.07 + visual.impulse * 0.2)
          : (selected ? 0.09 + visual.impulse * 0.24 : 0.05 + visual.impulse * 0.16);
        updateTrailLine(visual.trailLine, visual.history, 0, stringIntensity);
      }

      runtime.selectedHistory = runtime.bodyVisuals.get(selectedId)?.history ?? [];
      const selectedBody = snapshot.bodies.find((body) => body.id === selectedId);
      const selectedVisual = runtime.bodyVisuals.get(selectedId);
      const selectedIntensity = selectedBody && selectedVisual ? sonicIntensity({
        displayMass: selectedBody.displayMass,
        doppler: selectedBody.doppler,
        resonanceStrength: snapshot.resonance?.bodyIds.includes(selectedBody.id) ? snapshot.resonance.strength : 0,
        impulse: selectedVisual.impulse,
      }) : 0;
      const selectedVoiceColor = selectedBody ? voiceVisual(selectedBody.voice).color : 0xffd18a;
      updateRibbonTrail(
        ribbonTrail,
        propsRef.current.isPlaying ? runtime.selectedHistory : [],
        selectedIntensity,
        selectedVoiceColor,
      );
      if (propsRef.current.isPlaying && now - runtime.lastParticleUpdate > 1 / 30) {
        runtime.lastParticleUpdate = now;
        updateParticleCloud(
          particleCloud,
          runtime.selectedHistory,
          runtime.profile.particleCount,
          snapshot.time,
          selectedIntensity,
        );
        particleCloud.material.color.setHex(selectedVoiceColor);
      } else if (!propsRef.current.isPlaying) {
        particleCloud.visible = false;
      }
      updateHarmonicKnot(harmonicKnot, snapshot.resonance, stageBodies);
      updateMusicalLinks(runtime, snapshot, stageBodies, now);
    };

    const animate = (milliseconds) => {
      const now = milliseconds / 1000;
      const delta = Math.min(MAX_FRAME_DELTA, Math.max(0, (milliseconds - previousFrameRef.current) / 1000));
      previousFrameRef.current = milliseconds;
      const currentProps = propsRef.current;
      const exploring = currentProps.interactionMode === "explore";
      if (exploring) runtime.resettingCamera = false;
      controls.enabled = !runtime.drag && !runtime.birth && currentProps.interactionMode !== "launch";
      controls.enableRotate = exploring;
      controls.enablePan = exploring;
      controls.enableZoom = currentProps.interactionMode !== "launch";

      if (currentProps.isPlaying) {
        accumulatorRef.current += delta;
        while (accumulatorRef.current >= FIXED_STEP) {
          stepPhysics();
          accumulatorRef.current -= FIXED_STEP;
          if (currentProps.isListener && engineRef.current.state.time >= currentProps.duration) resetListenerLoop();
        }
        currentProps.onElapsed(engineRef.current.state.time);
      }

      const snapshot = engineRef.current.snapshot();
      const star = snapshot.bodies.find((body) => body.kind === "star");
      const planets = snapshot.bodies.filter((body) => body.kind === "planet");
      const resonance = engineRef.current.getResonance();
      const visualSnapshot = { ...snapshot, resonance };
      syncVisuals(visualSnapshot, delta, now);
      currentProps.onPhysicsFrame({
        time: snapshot.time,
        bodies: planets,
        star,
        resonance,
        starBreath: runtime.starBreath,
      });
      if (runtime.starfield) runtime.starfield.material.uniforms.uTime.value = now;
      finishingPass.uniforms.uTime.value = now;

      const cameraCommand = currentProps.cameraCommand;
      if (cameraCommand?.id > runtime.lastCameraCommandId) {
        runtime.lastCameraCommandId = cameraCommand.id;
        if (cameraCommand.type === "reset") {
          runtime.resettingCamera = true;
        } else {
          const offset = camera.position.clone().sub(controls.target);
          if (offset.lengthSq() < 0.001) offset.set(-3.7, 3, 6.4);
          offset.setLength(nextCameraDistance(offset.length(), cameraCommand.direction));
          camera.position.copy(controls.target).add(offset);
        }
      }
      if (runtime.resettingCamera) {
        const easing = 1 - Math.exp(-delta * 6.5);
        camera.position.lerp(runtime.editorialCameraPosition, easing);
        controls.target.lerp(runtime.editorialCameraTarget, easing);
        if (camera.position.distanceTo(runtime.editorialCameraPosition) < 0.015 && controls.target.distanceTo(runtime.editorialCameraTarget) < 0.01) {
          camera.position.copy(runtime.editorialCameraPosition);
          controls.target.copy(runtime.editorialCameraTarget);
          runtime.resettingCamera = false;
        }
      }
      controls.autoRotate = false;
      controls.update(delta);

      if (now - runtime.lastCameraReport > 0.12) {
        runtime.lastCameraReport = now;
        currentProps.onCameraScale(cameraScaleLabel(camera.position.distanceTo(controls.target)));
      }
      composer.render(delta);
    };
    renderer.setAnimationLoop(animate);

    return () => {
      renderer.setAnimationLoop(null);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown, { capture: true });
      renderer.domElement.removeEventListener("pointermove", onPointerMove, { capture: true });
      renderer.domElement.removeEventListener("pointerup", finishPointer, { capture: true });
      renderer.domElement.removeEventListener("pointercancel", cancelPointer, { capture: true });
      resizeObserver.disconnect();
      reducedMotionQuery.removeEventListener("change", measure);
      controls.stopListenToKeyEvents();
      controls.dispose();
      composer.dispose();
      lacquerTexture.dispose();
      opalTexture.dispose();
      solarTexture.dispose();
      sharedRadialTexture.dispose();
      scene.environment?.dispose();
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
      visualRuntimeRef.current = null;
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="soundflight-stage"
      data-interaction-mode={props.interactionMode}
      role="application"
      aria-label="Three-dimensional musical universe. Choose Add Planet, drag outward from the star, and release to add a colored voice. Colored threads pulse when notes sound. Zoom at any time; choose Explore for free camera flight. Touch a planet to hear it."
      tabIndex={0}
    />
  );
}
