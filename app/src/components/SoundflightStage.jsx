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
  orbitPathForBody,
} from "../lib/physicsEngine.js";
import {
  birthBodyFromRadialLaunch,
  previewOrbit,
} from "../lib/starBirth.js";
import {
  bodyToStage,
  audioUnlockPhase,
  buildResonanceBridge,
  cameraScaleLabel,
  cosmicCameraDirection,
  cosmicCameraTarget,
  dopplerTintedColor,
  editorialCameraDistance,
  nextCameraDistance,
  orbitStringStyle,
  selectRenderProfile,
  shouldAutoSoundBody,
  shouldAdvancePhysics,
  shouldBeginThereminHold,
  shouldCancelDirectManipulation,
  shouldDeferStringPluck,
  shouldSoundThereminOnRelease,
  shouldOrbitAffectCameraFit,
  shouldShowMoonPlacementGuide,
  sonicIntensity,
  thereminReleaseDisposition,
  voiceVisual,
} from "../lib/soundflight.js";
import { nearestStringPoint } from "../lib/harpStrings.js";
import {
  birthSatelliteFromRadialLaunch,
  satelliteStabilityBand,
} from "../lib/satelliteBirth.js";
import {
  COSMIC_DESTINATIONS,
  cathedralIntensity,
  cosmicDestination,
  cosmicLandmarkById,
  cosmicLandmarksForScale,
  cosmicScaleForDistance,
  cosmicScaleForView,
  memoryCometEnvelope,
  thereminParameters,
} from "../lib/cosmicInstrument.js";

const STAGE_SCALE = 10;
const MAX_FRAME_DELTA = 0.1;
const STRING_TOUCH_DISTANCE = 14;
const STRING_PLUCK_COOLDOWN = 120;
const MAX_TRAIL_PARTICLES = 1100;
const MAX_TRAIL_POINTS = 256;
const RIBBON_HIGHLIGHT = 0xffeed6;
const ORBIT_STRING_SAMPLES = 128;
const ORBIT_STRING_REFRESH = 0.24;
const NOTE_PULSE_DURATION = 1.15;
const MOON_DISPLAY_MAGNIFICATION = 54;
const CREATION_DRAG_THRESHOLD = 8;
const THEREMIN_HOLD_MS = 360;
const MEMORY_COMET_DURATION = 5.8;
const GALAXY_CENTER = Object.freeze({ x: -5.2, y: -0.7, z: 0 });

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

function displayWorldForBody(body, bodiesById) {
  if (body.kind !== "moon") return body;
  const parent = bodiesById.get(body.parentId);
  if (!parent) return body;
  return {
    ...body,
    x: parent.x + (body.x - parent.x) * MOON_DISPLAY_MAGNIFICATION,
    y: parent.y + (body.y - parent.y) * MOON_DISPLAY_MAGNIFICATION,
  };
}

function physicalMoonRelease(displayRelease, parent) {
  return {
    x: parent.x + (displayRelease.x - parent.x) / MOON_DISPLAY_MAGNIFICATION,
    y: parent.y + (displayRelease.y - parent.y) / MOON_DISPLAY_MAGNIFICATION,
  };
}

function observerSide(body, bodies) {
  const focusId = body.kind === "moon" ? body.parentId : "star";
  const focus = bodies.find((candidate) => candidate.id === focusId);
  return focus ? Math.sign(body.x - focus.x) : 0;
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
  attribute float aDust;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uTwinkle;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vGlow;
  varying float vDust;
  void main() {
    vColor = aColor;
    vDust = aDust;
    float twinkle = 1.0 - uTwinkle * (0.32 + 0.18 * sin(aPhase * 3.7)) * (0.5 + 0.5 * sin(uTime * aTwinkleSpeed + aPhase));
    vGlow = twinkle;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = min(aSize * uPixelRatio * twinkle * (110.0 / -mvPosition.z), 4.6 * uPixelRatio);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const starfieldFragmentShader = `
  uniform float uOpacity;
  uniform float uDustOpacity;
  varying vec3 vColor;
  varying float vGlow;
  varying float vDust;
  void main() {
    vec2 offset = gl_PointCoord - vec2(0.5);
    float falloff = smoothstep(0.5, 0.04, length(offset));
    float layerOpacity = mix(1.0, uDustOpacity, vDust);
    gl_FragColor = vec4(vColor, falloff * uOpacity * vGlow * layerOpacity);
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
  const dust = new Float32Array(total);

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
    dust[index] = 0;
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
    dust[index] = 1;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute("aTwinkleSpeed", new THREE.BufferAttribute(speeds, 1));
  geometry.setAttribute("aDust", new THREE.BufferAttribute(dust, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uTwinkle: { value: twinkle ? 1 : 0 },
      uPixelRatio: { value: 1 },
      uOpacity: { value: 0.66 },
      uDustOpacity: { value: 0 },
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
  const environmentTexture = pmremGenerator.fromScene(environmentScene, 0.04).texture;
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

function createOrbitString(color, { opacity = 0.2, linewidth = 1.35 } = {}) {
  const geometry = new LineGeometry();
  geometry.setPositions([0, 0, 0, 0, 0, 0]);
  const material = new LineMaterial({
    color,
    linewidth,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    alphaToCoverage: true,
  });
  const line = new Line2(geometry, material);
  line.frustumCulled = false;
  line.renderOrder = -1;
  return line;
}

function writeOrbitString(line, points, color, opacity, linewidth, resolution) {
  if (points.length < 2) {
    line.visible = false;
    return;
  }
  line.geometry.setPositions(points.flatMap((point) => [point.x, point.y ?? 0, point.z]));
  line.computeLineDistances();
  line.material.color.setHex(color);
  line.material.opacity = opacity;
  line.material.linewidth = linewidth;
  line.material.resolution.set(resolution.width, resolution.height);
  line.visible = true;
}

function createNotePulse(radialTexture, color) {
  const pulse = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture,
    color,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }));
  pulse.scale.setScalar(0.34);
  pulse.visible = false;
  pulse.renderOrder = 5;
  return pulse;
}

function nearestOrbitPointIndex(points, position) {
  let closestIndex = 0;
  let closestDistance = Infinity;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const distance = (point.x - position.x) ** 2 + (point.z - position.z) ** 2;
    if (distance >= closestDistance) continue;
    closestDistance = distance;
    closestIndex = index;
  }
  return closestIndex;
}

function updateNotePulse(visual, now) {
  const age = now - visual.pulseAt;
  if (age < 0 || age > NOTE_PULSE_DURATION || visual.orbitPoints.length < 2) {
    visual.notePulse.visible = false;
    return;
  }
  const progress = age / NOTE_PULSE_DURATION;
  const span = visual.orbitPoints.length - 1;
  const index = Math.floor((visual.pulseStartIndex + progress * span) % span);
  const nextIndex = (index + 1) % span;
  const localProgress = (visual.pulseStartIndex + progress * span) % 1;
  const current = visual.orbitPoints[index];
  const next = visual.orbitPoints[nextIndex];
  visual.notePulse.position.set(
    THREE.MathUtils.lerp(current.x, next.x, localProgress),
    0.12,
    THREE.MathUtils.lerp(current.z, next.z, localProgress),
  );
  const envelope = Math.sin(progress * Math.PI);
  const isMoon = visual.kind === "moon";
  visual.notePulse.material.opacity = envelope * (isMoon ? 0.34 : 0.94);
  visual.notePulse.scale.setScalar(
    isMoon ? 0.14 + envelope * 0.2 : 0.22 + envelope * 0.38,
  );
  visual.notePulse.visible = true;
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

function createPlanetVisual(opalTexture, radialTexture, body) {
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

  const orbitString = createOrbitString(voiceVisual(body.voice).color);
  const notePulse = createNotePulse(radialTexture, voiceVisual(body.voice).color);

  return {
    kind: body.kind,
    group,
    mesh,
    rim,
    orbitString,
    notePulse,
    trailColor: new THREE.Color(),
    orbitPoints: [],
    orbitUpdatedAt: -Infinity,
    pulseAt: -Infinity,
    pulseStartIndex: 0,
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

  const hitArea = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 24, 16),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  group.add(hitArea);

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
  return {
    group,
    mesh,
    hitArea,
    glory,
    corona,
    outerCorona,
    ambientHalo,
    impulse: 0,
  };
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

function createMoonPreview() {
  const group = new THREE.Group();
  const seed = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 24, 18),
    new THREE.MeshPhysicalMaterial({
      color: 0xf7f0e6,
      emissive: 0x72edff,
      emissiveIntensity: 2.8,
      roughness: 0.2,
      clearcoat: 0.9,
      iridescence: 0.85,
      transparent: true,
      opacity: 0.68,
    }),
  );
  const innerRing = createOrbitString(0xff765f, { opacity: 0.44, linewidth: 1.2 });
  const outerRing = createOrbitString(0xd7aa5f, { opacity: 0.48, linewidth: 1.2 });
  innerRing.material.depthTest = false;
  outerRing.material.depthTest = false;
  innerRing.renderOrder = 8;
  outerRing.renderOrder = 8;
  const guideLine = createTrailLine(0x72edff);
  const orbitLine = createTrailLine(0x72edff);
  group.add(seed, innerRing, outerRing, guideLine, orbitLine);
  seed.visible = false;
  guideLine.visible = false;
  orbitLine.visible = false;
  group.visible = false;
  return {
    group,
    seed,
    innerRing,
    outerRing,
    guideLine,
    orbitLine,
    parentId: null,
    band: null,
  };
}

function localCirclePoints(radius, sampleCount = 96) {
  return Array.from({ length: sampleCount + 1 }, (_, index) => {
    const angle = (index / sampleCount) * Math.PI * 2;
    return {
      x: Math.cos(angle) * radius,
      y: 0.055,
      z: -Math.sin(angle) * radius,
    };
  });
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
  const geometry = new LineGeometry();
  geometry.setPositions([0, 0, 0, 0, 0, 0]);
  geometry.setColors([1, 1, 1, 1, 1, 1]);
  const material = new LineMaterial({
    color: 0xffffff,
    vertexColors: true,
    linewidth: 2.2,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    alphaToCoverage: true,
  });
  const line = new Line2(geometry, material);
  line.frustumCulled = false;
  line.visible = false;
  return line;
}

function stringSeed(value) {
  let seed = 2166136261;
  for (const character of value) {
    seed ^= character.codePointAt(0);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

function createLandmarkLabelTexture(landmark) {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 160;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.shadowBlur = 18;
  context.shadowColor = "rgba(0, 0, 0, 0.95)";
  context.fillStyle = "#f5d596";
  context.font = "34px Georgia, serif";
  context.fillText(landmark.name, canvas.width / 2, 58);
  context.shadowBlur = 12;
  context.fillStyle = "rgba(188, 236, 255, 0.78)";
  context.font = "20px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.fillText(landmark.detail, canvas.width / 2, 112);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function createMiniGalaxy(landmark) {
  const random = seededRandom(stringSeed(landmark.id));
  const count = landmark.scale === "universe" ? 54 : 84;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color(landmark.color);
  for (let index = 0; index < count; index += 1) {
    const arm = index % 2;
    const radius = 0.12 + Math.pow(random(), 0.72) * (landmark.scale === "universe" ? 1.25 : 1.7);
    const angle = arm * Math.PI + radius * 3.2 + (random() - 0.5) * 0.5;
    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = (random() - 0.5) * 0.12;
    positions[index * 3 + 2] = Math.sin(angle) * radius * 0.42;
    const brightness = 0.42 + random() * 0.58;
    colors[index * 3] = color.r * brightness;
    colors[index * 3 + 1] = color.g * brightness;
    colors[index * 3 + 2] = color.b * brightness;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: landmark.scale === "universe" ? 1.75 : 2.15,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  points.rotation.x = -0.42 + random() * 0.84;
  points.rotation.z = random() * Math.PI;
  points.scale.setScalar(landmark.scale === "universe" ? 2.55 : 2.15);
  return points;
}

function createCosmicLandmarkVisual(landmark, radialTexture) {
  const group = new THREE.Group();
  group.position.fromArray(landmark.position);
  group.visible = false;

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture,
    color: landmark.color,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }));
  const coreScale = {
    neighborhood: 1.05,
    galaxy: 1.35,
    localGroup: 2.2,
    universe: 2.45,
  }[landmark.scale];
  glow.scale.set(coreScale, coreScale, 1);
  glow.userData.cosmicLandmarkId = landmark.id;
  group.add(glow);

  const pulse = glow.clone();
  pulse.material = glow.material.clone();
  pulse.material.opacity = 0;
  pulse.scale.setScalar(coreScale);
  pulse.userData.cosmicLandmarkId = null;
  group.add(pulse);

  const hitArea = new THREE.Sprite(new THREE.SpriteMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.001,
    depthWrite: false,
    depthTest: false,
  }));
  const hitScale = {
    neighborhood: 3.4,
    galaxy: 4.2,
    localGroup: 6.2,
    universe: 6.8,
  }[landmark.scale];
  hitArea.scale.set(hitScale, hitScale, 1);
  hitArea.userData.cosmicLandmarkId = landmark.id;
  group.add(hitArea);

  const labelTexture = createLandmarkLabelTexture(landmark);
  const label = new THREE.Sprite(new THREE.SpriteMaterial({
    map: labelTexture,
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  }));
  const labelHeight = {
    neighborhood: 2.5,
    galaxy: 3,
    localGroup: 4.15,
    universe: 4.45,
  }[landmark.scale];
  label.position.y = {
    neighborhood: 1.75,
    galaxy: 2.25,
    localGroup: 4,
    universe: 4.45,
  }[landmark.scale];
  label.scale.set(
    labelHeight * 4.8,
    labelHeight,
    1,
  );
  group.add(label);

  const cluster = !landmark.usesLivingGalaxy
    && (landmark.scale === "localGroup" || landmark.scale === "universe")
    ? createMiniGalaxy(landmark)
    : null;
  if (cluster) group.add(cluster);

  return {
    landmark,
    group,
    glow,
    pulse,
    hitArea,
    label,
    labelTexture,
    cluster,
    coreScale,
    impulse: 0,
  };
}

function createCosmicWeb(visuals, radialTexture) {
  const group = new THREE.Group();
  const byId = new Map(visuals.map((visual) => [visual.landmark.id, visual]));
  const connections = [
    ["virgo-cluster", "coma-cluster"],
    ["coma-cluster", "fornax-cluster"],
    ["fornax-cluster", "cosmic-web"],
    ["cosmic-web", "virgo-cluster"],
  ];
  const paths = connections.map(([fromId, toId], index) => {
    const from = byId.get(fromId)?.group.position.clone();
    const to = byId.get(toId)?.group.position.clone();
    const midpoint = from.clone().lerp(to, 0.5);
    midpoint.y += index % 2 === 0 ? 3.2 : -2.6;
    midpoint.z += index % 2 === 0 ? 1.8 : -1.4;
    const curve = new THREE.QuadraticBezierCurve3(from, midpoint, to);
    const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(48));
    const material = new THREE.LineBasicMaterial({
      color: index % 2 === 0 ? 0x72ddec : 0xc7a86d,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const line = new THREE.Line(geometry, material);
    group.add(line);

    const mote = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialTexture,
      color: index % 2 === 0 ? 0x72edff : 0xf0c97d,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    mote.scale.setScalar(0.72);
    group.add(mote);
    return {
      curve,
      line,
      mote,
      phase: index * 0.23,
      speed: 0.018 + index * 0.003,
    };
  });
  group.visible = false;
  return { group, paths, elapsed: 0 };
}

function createCosmicLandmarkField(radialTexture) {
  const group = new THREE.Group();
  group.renderOrder = -3;
  const visuals = [
    "neighborhood",
    "galaxy",
    "localGroup",
    "universe",
  ].flatMap((scaleId) => cosmicLandmarksForScale(scaleId))
    .map((landmark) => createCosmicLandmarkVisual(landmark, radialTexture));
  const web = createCosmicWeb(visuals, radialTexture);
  group.add(web.group);
  for (const visual of visuals) group.add(visual.group);
  return {
    group,
    visuals,
    byId: new Map(visuals.map((visual) => [visual.landmark.id, visual])),
    web,
  };
}

function updateCosmicLandmarkField(field, scale, delta, reducedMotion) {
  const mixes = {
    neighborhood: scale.neighborhoodMix,
    galaxy: scale.galaxyMix,
    localGroup: scale.localGroupMix,
    universe: scale.universeMix,
  };
  for (const visual of field.visuals) {
    const mix = mixes[visual.landmark.scale] ?? 0;
    const focused = scale.id === visual.landmark.scale;
    const opacity = mix * (focused ? 1 : 0.28);
    visual.group.visible = opacity > 0.015;
    visual.glow.material.opacity = opacity * (0.34 + visual.impulse * 0.56);
    visual.label.material.opacity = opacity * (focused ? 0.82 : 0.12);
    visual.hitArea.visible = focused && opacity > 0.45;
    visual.pulse.material.opacity = opacity * visual.impulse * 0.62;
    const pulseScale = 1 + (1 - visual.impulse) * 1.8;
    visual.pulse.scale.setScalar(visual.coreScale * pulseScale);
    if (visual.cluster) {
      visual.cluster.material.opacity = opacity * (0.72 + visual.impulse * 0.28);
      if (!reducedMotion) visual.cluster.rotation.y += delta * 0.035;
    }
    visual.impulse *= Math.exp(-delta * 2.4);
  }
  const webOpacity = scale.universeMix * (scale.id === "universe" ? 1 : 0.1);
  field.web.group.visible = webOpacity > 0.02;
  if (!reducedMotion) field.web.elapsed += delta;
  for (const path of field.web.paths) {
    path.line.material.opacity = webOpacity * 0.2;
    path.mote.material.opacity = webOpacity * 0.52;
    const progress = (field.web.elapsed * path.speed + path.phase) % 1;
    path.mote.position.copy(path.curve.getPoint(progress));
  }
}

function triggerCosmicLandmark(field, landmarkId) {
  const visual = field.byId.get(landmarkId);
  if (visual) visual.impulse = 1;
}

function galaxySpiralArmPoints(armIndex, samples = 220) {
  const points = [];
  for (let index = 0; index < samples; index += 1) {
    const progress = index / (samples - 1);
    const radius = 0.72 + progress * 9.2;
    const angle = armIndex * ((Math.PI * 2) / 3) + radius * 0.28;
    points.push(
      Math.cos(angle) * radius,
      -0.055 + Math.sin(progress * Math.PI) * 0.035,
      Math.sin(angle) * radius,
    );
  }
  return points;
}

function createLivingGalaxy() {
  const random = seededRandom(31415926);
  const group = new THREE.Group();
  group.position.set(GALAXY_CENTER.x, GALAXY_CENTER.y, GALAXY_CENTER.z);
  group.renderOrder = -8;

  const pointCount = 1900;
  const positions = new Float32Array(pointCount * 3);
  const colors = new Float32Array(pointCount * 3);
  const gold = new THREE.Color(0xe7bd72);
  const cyan = new THREE.Color(0x72edff);
  const opal = new THREE.Color(0xe9eee8);
  const mixed = new THREE.Color();
  for (let index = 0; index < pointCount; index += 1) {
    const arm = index % 3;
    const radius = 0.72 + Math.pow(random(), 0.72) * 9.35;
    const angle = arm * ((Math.PI * 2) / 3)
      + radius * 0.28
      + (random() - 0.5) * (0.18 + radius * 0.026);
    const armWidth = (random() - 0.5) * (0.18 + radius * 0.046);
    positions[index * 3] = Math.cos(angle) * (radius + armWidth);
    positions[index * 3 + 1] = (random() - 0.5) * (0.12 + radius * 0.028);
    positions[index * 3 + 2] = Math.sin(angle) * (radius + armWidth);
    const memoryThread = arm === 1 && index % 5 === 1;
    const base = memoryThread ? cyan : random() < 0.15 ? opal : gold;
    const brightness = 0.28 + random() * 0.68;
    mixed.copy(base).multiplyScalar(brightness);
    colors[index * 3] = mixed.r;
    colors[index * 3 + 1] = mixed.g;
    colors[index * 3 + 2] = mixed.b;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.105,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  group.add(points);

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: createRadialTexture(),
    color: 0xf1ad63,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }));
  halo.scale.set(5.6, 5.6, 1);
  halo.position.y = 0.32;
  halo.renderOrder = -9;
  group.add(halo);

  const grooves = [0, 1, 2].map((armIndex) => {
    const groove = createOrbitString(armIndex === 1 ? 0x72edff : 0xd9ae64, {
      opacity: 0,
      linewidth: armIndex === 1 ? 1.05 : 0.68,
    });
    groove.geometry.setPositions(galaxySpiralArmPoints(armIndex));
    groove.computeLineDistances();
    group.add(groove);
    return groove;
  });

  const core = new THREE.Mesh(
    new THREE.RingGeometry(0.48, 1.05, 64),
    new THREE.MeshBasicMaterial({
      color: 0x050403,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  core.rotation.x = -Math.PI / 2;
  core.position.y = 0.03;
  group.add(core);

  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 0.045, 0.38),
    new THREE.MeshBasicMaterial({
      color: 0xe8a75f,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  bar.rotation.y = -0.24;
  bar.position.y = -0.015;
  group.add(bar);

  const universeGroup = new THREE.Group();
  universeGroup.renderOrder = -9;
  const distantPositions = [];
  const distantColors = [];
  const centers = [
    [-15, 4, -14],
    [13, -3, -15],
    [15, 7, 7],
    [-16, -5, 10],
    [2, 10, -17],
    [17, -8, -4],
    [-8, 8, 16],
  ];
  for (let galaxyIndex = 0; galaxyIndex < centers.length; galaxyIndex += 1) {
    const center = centers[galaxyIndex];
    const tilt = random() * Math.PI;
    for (let index = 0; index < 86; index += 1) {
      const radius = Math.pow(random(), 0.68) * (0.9 + galaxyIndex * 0.06);
      const angle = radius * 2.3 + (index % 2) * Math.PI + (random() - 0.5) * 0.45;
      const localX = Math.cos(angle) * radius;
      const localZ = Math.sin(angle) * radius * 0.34;
      distantPositions.push(
        center[0] + localX * Math.cos(tilt) - localZ * Math.sin(tilt),
        center[1] + (random() - 0.5) * 0.26,
        center[2] + localX * Math.sin(tilt) + localZ * Math.cos(tilt),
      );
      const tint = galaxyIndex % 3 === 0 ? cyan : galaxyIndex % 3 === 1 ? gold : opal;
      distantColors.push(tint.r, tint.g, tint.b);
    }
  }
  const distantGeometry = new THREE.BufferGeometry();
  distantGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(distantPositions, 3),
  );
  distantGeometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(distantColors, 3),
  );
  const distantMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.075,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const distant = new THREE.Points(distantGeometry, distantMaterial);
  distant.frustumCulled = false;
  universeGroup.add(distant);

  return {
    group,
    points,
    halo,
    grooves,
    core,
    bar,
    universeGroup,
    distant,
  };
}

function updateLivingGalaxy(galaxy, scale, resolution, delta, reducedMotion, cathedral) {
  const quieting = 1 - cathedral * 0.68;
  galaxy.group.visible = scale.galaxyMix > 0.012;
  galaxy.universeGroup.visible = scale.universeMix > 0.012;
  const contextGain = scale.id === "galaxy"
    ? 1
    : scale.id === "localGroup"
      ? 0.62
      : scale.id === "universe"
        ? 0.18
        : 0.3;
  const presentationScale = scale.id === "localGroup"
    ? 0.46
    : scale.id === "universe"
      ? 0.22
      : 1;
  const easedScale = THREE.MathUtils.lerp(
    galaxy.group.scale.x,
    presentationScale,
    1 - Math.exp(-delta * 3.4),
  );
  galaxy.group.scale.setScalar(easedScale);
  galaxy.points.material.opacity = scale.galaxyMix * 0.84 * quieting * contextGain;
  galaxy.halo.material.opacity = scale.galaxyMix * 0.42 * quieting * contextGain;
  galaxy.core.material.opacity = scale.galaxyMix * 0.9 * quieting * contextGain;
  galaxy.bar.material.opacity = scale.galaxyMix * 0.22 * quieting * contextGain;
  galaxy.distant.material.opacity = scale.universeMix * 0.58 * quieting;
  for (let index = 0; index < galaxy.grooves.length; index += 1) {
    const groove = galaxy.grooves[index];
    groove.material.resolution.set(resolution.width, resolution.height);
    groove.material.opacity = scale.galaxyMix
      * (index === 1 ? 0.14 : 0.055)
      * quieting
      * contextGain;
  }
  if (!reducedMotion) {
    galaxy.group.rotation.y += delta * (0.0022 + scale.galaxyMix * 0.0028);
    galaxy.universeGroup.rotation.y -= delta * 0.0008;
  }
}

function createMemoryComet(radialTexture) {
  const group = new THREE.Group();
  const head = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture,
    color: 0x72edff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }));
  head.scale.setScalar(0.52);
  group.add(head);
  const trail = createOrbitString(0x72edff, { opacity: 0, linewidth: 2.2 });
  group.add(trail);
  group.visible = false;
  return {
    group,
    head,
    trail,
    activeAt: -Infinity,
    bodyId: null,
    color: 0x72edff,
  };
}

function memoryCometPoint(orbitPoints, progress) {
  const orbitProgress = Math.min(1, progress / 0.58);
  const orbitIndex = Math.min(
    orbitPoints.length - 1,
    Math.floor(orbitProgress * (orbitPoints.length - 1)),
  );
  const orbitPoint = orbitPoints[orbitIndex] ?? orbitPoints[0];
  const release = Math.max(0, (progress - 0.35) / 0.65);
  const curve = release * release * (3 - 2 * release);
  return {
    x: THREE.MathUtils.lerp(orbitPoint.x, GALAXY_CENTER.x + 2.4, curve),
    y: 0.14 + Math.sin(progress * Math.PI) * 0.8 + curve * 1.2,
    z: THREE.MathUtils.lerp(orbitPoint.z, GALAXY_CENTER.z - 1.4, curve),
  };
}

function updateMemoryComet(comet, bodyVisuals, now, resolution) {
  if (!Number.isFinite(comet.activeAt)) {
    comet.group.visible = false;
    return;
  }
  const progress = (now - comet.activeAt) / MEMORY_COMET_DURATION;
  const envelope = memoryCometEnvelope(progress);
  const visual = bodyVisuals.get(comet.bodyId);
  if (!envelope.visible || !visual || visual.orbitPoints.length < 2) {
    comet.group.visible = false;
    return;
  }
  comet.group.visible = true;
  const head = memoryCometPoint(visual.orbitPoints, progress);
  comet.head.position.set(head.x, head.y, head.z);
  comet.head.material.color.setHex(comet.color);
  comet.head.material.opacity = envelope.opacity * 0.95;
  comet.head.scale.setScalar(0.32 + envelope.opacity * 0.52);
  const trailPositions = [];
  for (let index = 0; index < 24; index += 1) {
    const localProgress = Math.max(0, progress - ((23 - index) / 23) * 0.16);
    const point = memoryCometPoint(visual.orbitPoints, localProgress);
    trailPositions.push(point.x, point.y, point.z);
  }
  comet.trail.geometry.setPositions(trailPositions);
  comet.trail.computeLineDistances();
  comet.trail.material.color.setHex(comet.color);
  comet.trail.material.opacity = envelope.opacity * 0.52;
  comet.trail.material.linewidth = 1.2 + envelope.opacity * 1.8;
  comet.trail.material.resolution.set(resolution.width, resolution.height);
}

function createResonanceCathedral() {
  const group = new THREE.Group();
  const arches = Array.from({ length: 7 }, (_, index) => {
    const arch = createOrbitString(index % 2 === 0 ? 0xe7bd72 : 0x72edff, {
      opacity: 0,
      linewidth: 1.2,
    });
    group.add(arch);
    return arch;
  });
  group.visible = false;
  return { group, arches, intensity: 0 };
}

function updateResonanceCathedral(
  cathedral,
  resonance,
  stageBodies,
  bodiesById,
  bodyCount,
  resolution,
) {
  const targetIntensity = cathedralIntensity(resonance, bodyCount);
  cathedral.intensity += (targetIntensity - cathedral.intensity) * 0.08;
  if (cathedral.intensity < 0.015 || !resonance?.bodyIds) {
    cathedral.group.visible = false;
    return cathedral.intensity;
  }
  const first = stageBodies.get(resonance.bodyIds[0]);
  const second = stageBodies.get(resonance.bodyIds[1]);
  if (!first || !second) {
    cathedral.group.visible = false;
    return 0;
  }
  cathedral.group.visible = true;
  const firstColor = new THREE.Color(
    voiceVisual(bodiesById.get(resonance.bodyIds[0])?.voice).color,
  );
  const secondColor = new THREE.Color(
    voiceVisual(bodiesById.get(resonance.bodyIds[1])?.voice).color,
  );
  for (let archIndex = 0; archIndex < cathedral.arches.length; archIndex += 1) {
    const arch = cathedral.arches[archIndex];
    const positions = [];
    for (let index = 0; index <= 56; index += 1) {
      const progress = index / 56;
      const lateral = Math.sin(progress * Math.PI * 2 + archIndex * 0.72)
        * 0.08
        * cathedral.intensity;
      positions.push(
        THREE.MathUtils.lerp(first.x, second.x, progress) + lateral * archIndex,
        0.08 + Math.sin(progress * Math.PI) * (0.7 + archIndex * 0.38),
        THREE.MathUtils.lerp(first.z, second.z, progress)
          + Math.cos(progress * Math.PI) * (archIndex - 3) * 0.22,
      );
    }
    arch.geometry.setPositions(positions);
    arch.computeLineDistances();
    arch.material.color.copy(firstColor).lerp(secondColor, archIndex / 6);
    arch.material.opacity = cathedral.intensity * (0.18 + archIndex * 0.038);
    arch.material.linewidth = 0.75 + cathedral.intensity * 1.25;
    arch.material.resolution.set(resolution.width, resolution.height);
  }
  return cathedral.intensity;
}

function createThereminField(radialTexture) {
  const group = new THREE.Group();
  const guide = createOrbitString(0x72edff, { opacity: 0, linewidth: 1.4 });
  group.add(guide);
  const rings = [0.32, 0.52, 0.74].map((radius, index) => {
    const ring = createOrbitString(index === 1 ? 0xe7bd72 : 0x72edff, {
      opacity: 0,
      linewidth: 1.1,
    });
    ring.userData.baseRadius = radius;
    group.add(ring);
    return ring;
  });
  const light = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture,
    color: 0x72edff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }));
  group.add(light);
  group.visible = false;
  return { group, guide, rings, light };
}

function updateThereminField(field, stagePoint, starPoint, parameters, resolution) {
  field.group.visible = true;
  const energy = clamp(parameters.gain / 0.065, 0, 1);
  const color = new THREE.Color(0x72edff).lerp(new THREE.Color(0xe7bd72), energy * 0.34);
  field.light.position.set(stagePoint.x, 0.32, stagePoint.z);
  field.light.material.color.copy(color);
  field.light.material.opacity = 0.24 + energy * 0.66;
  field.light.scale.setScalar(0.42 + energy * 0.72);
  field.guide.geometry.setPositions([
    starPoint.x, 0.08, starPoint.z,
    stagePoint.x, 0.18, stagePoint.z,
  ]);
  field.guide.computeLineDistances();
  field.guide.material.color.copy(color);
  field.guide.material.opacity = 0.1 + energy * 0.32;
  field.guide.material.linewidth = 0.8 + energy * 1.2;
  field.guide.material.resolution.set(resolution.width, resolution.height);
  for (let index = 0; index < field.rings.length; index += 1) {
    const ring = field.rings[index];
    const radius = ring.userData.baseRadius * (0.8 + energy * 1.3);
    ring.geometry.setPositions(
      localCirclePoints(radius, 72)
        .flatMap((point) => [
          stagePoint.x + point.x,
          0.12 + index * 0.025,
          stagePoint.z + point.z,
        ]),
    );
    ring.computeLineDistances();
    ring.material.color.copy(index === 1 ? new THREE.Color(0xe7bd72) : color);
    ring.material.opacity = (0.08 + energy * 0.24) * (1 - index * 0.16);
    ring.material.linewidth = 0.7 + energy * 0.8;
    ring.material.resolution.set(resolution.width, resolution.height);
  }
}

function armThereminField(field, stagePoint, resolution) {
  field.group.visible = true;
  field.light.position.set(stagePoint.x, 0.25, stagePoint.z);
  field.light.material.color.setHex(0x72edff);
  field.light.material.opacity = 0.18;
  field.light.scale.setScalar(0.34);
  field.guide.material.opacity = 0;
  for (let index = 0; index < field.rings.length; index += 1) {
    const ring = field.rings[index];
    const radius = 0.22 + index * 0.12;
    ring.geometry.setPositions(
      localCirclePoints(radius, 72)
        .flatMap((point) => [
          stagePoint.x + point.x,
          0.1 + index * 0.015,
          stagePoint.z + point.z,
        ]),
    );
    ring.computeLineDistances();
    ring.material.color.setHex(0x72edff);
    ring.material.opacity = index === 0 ? 0.26 : 0.08;
    ring.material.linewidth = index === 0 ? 1.2 : 0.7;
    ring.material.resolution.set(resolution.width, resolution.height);
  }
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

function updateHarmonicKnot(line, resonance, physicalBodies, bodiesById, resolution) {
  const definition = buildResonanceBridge(physicalBodies, resonance);
  if (!definition) {
    line.visible = false;
    return;
  }
  const first = bodiesById.get(definition.bodyIds[0]);
  const second = bodiesById.get(definition.bodyIds[1]);
  if (!first || !second) {
    line.visible = false;
    return;
  }
  const firstColor = new THREE.Color(definition.colors[0]);
  const secondColor = new THREE.Color(definition.colors[1]);
  const mixed = new THREE.Color();
  const positions = [];
  const colors = [];
  const dx = second.x - first.x;
  const dz = second.z - first.z;
  const distance = Math.max(0.001, Math.hypot(dx, dz));
  for (let index = 0; index <= 72; index += 1) {
    const progress = index / 72;
    const wave = Math.sin(progress * Math.PI * definition.numerator * 2)
      * Math.min(0.24, distance * 0.075)
      * definition.strength;
    positions.push(
      THREE.MathUtils.lerp(first.x, second.x, progress) - (dz / distance) * wave,
      0.12 + Math.sin(progress * Math.PI) * 0.08,
      THREE.MathUtils.lerp(first.z, second.z, progress) + (dx / distance) * wave,
    );
    mixed.copy(firstColor).lerp(secondColor, progress);
    colors.push(mixed.r, mixed.g, mixed.b);
  }
  line.geometry.setPositions(positions);
  line.geometry.setColors(colors);
  line.computeLineDistances();
  line.material.opacity = 0.18 + definition.strength * 0.64;
  line.material.linewidth = 1.3 + definition.strength * 2.2;
  line.material.resolution.set(resolution.width, resolution.height);
  line.visible = true;
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
    birthCountRef.current = initialStateRef.current.bodies
      .filter((body) => body.created && body.kind !== "moon").length;
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
        .filter((body) => body.kind !== "star")
        .map((body) => [body.id, observerSide(body, nextInitialState.bodies)]),
    );
    previousRadialVelocityRef.current.clear();
    birthCountRef.current = nextInitialState.bodies
      .filter((body) => body.created && body.kind !== "moon").length;
    const runtime = visualRuntimeRef.current;
    if (runtime) {
      for (const visual of runtime.bodyVisuals.values()) {
        visual.orbitPoints = [];
        visual.orbitUpdatedAt = -Infinity;
        visual.pulseAt = -Infinity;
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
    renderer.domElement.dataset.moonPlacementGuide = "hidden";
    renderer.domElement.dataset.thereminPhase = "idle";
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
    controls.maxDistance = 72;
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
    const cosmicLandmarkField = createCosmicLandmarkField(sharedRadialTexture);
    scene.add(cosmicLandmarkField.group);
    const starVisual = createStarVisual(solarTexture, sharedRadialTexture);
    starVisual.mesh.userData.bodyId = "star";
    starVisual.hitArea.userData.bodyId = "star";
    scene.add(starVisual.group);
    const launchPreview = createLaunchPreview();
    scene.add(launchPreview.group);
    const moonPreview = createMoonPreview();
    scene.add(moonPreview.group);
    const particleCloud = createParticleCloud();
    scene.add(particleCloud);
    const ribbonTrail = createRibbonTrail();
    scene.add(ribbonTrail.group);
    const harmonicKnot = createHarmonicKnot();
    scene.add(harmonicKnot);
    const livingGalaxy = createLivingGalaxy();
    scene.add(livingGalaxy.group);
    scene.add(livingGalaxy.universeGroup);
    const memoryComet = createMemoryComet(sharedRadialTexture);
    scene.add(memoryComet.group);
    const resonanceCathedral = createResonanceCathedral();
    scene.add(resonanceCathedral.group);
    const thereminField = createThereminField(sharedRadialTexture);
    scene.add(thereminField.group);
    const timeNeedle = document.createElement("div");
    timeNeedle.className = "soundflight-time-needle";
    timeNeedle.setAttribute("aria-hidden", "true");
    for (let index = 0; index < 3; index += 1) timeNeedle.appendChild(document.createElement("i"));
    mount.appendChild(timeNeedle);

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
      cosmicLandmarkField,
      starVisual,
      launchPreview,
      moonPreview,
      particleCloud,
      ribbonTrail,
      harmonicKnot,
      livingGalaxy,
      memoryComet,
      resonanceCathedral,
      thereminField,
      starfield: null,
      bodyVisuals: new Map(),
      pendingOrbitPulses: new Map(),
      selectedBodyId: props.selectedBodyId,
      profile: null,
      selectedHistory: [],
      starBreath: 0.5,
      lastParticleUpdate: -Infinity,
      lastCameraReport: -Infinity,
      lastCameraCommandId: 0,
      lastRemoveCommandId: 0,
      lastInteractionMode: props.interactionMode,
      lastInteractionCancelToken: props.interactionCancelToken,
      resettingCamera: false,
      userControllingCamera: false,
      compositionZoom: 1,
      authoredCameraDistance: null,
      authoredScaleId: null,
      cameraJourneyTargetId: null,
      lastFitDistance: 10,
      editorialCameraPosition: new THREE.Vector3(-1.6, 4.6, 11.2),
      editorialCameraTarget: new THREE.Vector3(0.5, 0, 0),
      raycaster: new THREE.Raycaster(),
      pointer: new THREE.Vector2(),
      plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
      planePoint: new THREE.Vector3(),
      drag: null,
      birth: null,
      moonBirth: null,
      pluck: null,
      theremin: null,
      pendingBodyTap: null,
      pendingCosmicTap: null,
      activeTouchPointers: new Set(),
      cancelledPointerIds: new Set(),
      cosmicScale: cosmicScaleForDistance(camera.position.distanceTo(controls.target)),
      lastCosmicScaleId: null,
      latestGesture: null,
      lastGestureEmit: 0,
    };
    visualRuntimeRef.current = runtime;
    if (import.meta.env.DEV) {
      mount.__rgDebugState = () => {
        const rect = mount.getBoundingClientRect();
        return {
          bodies: engineRef.current.state.bodies.map((body) => ({
            id: body.id,
            kind: body.kind,
            parentId: body.parentId,
          })),
          birth: runtime.birth ? { active: runtime.birth.active, phase: runtime.birth.phase } : null,
          moonBirth: runtime.moonBirth
            ? {
                active: runtime.moonBirth.active,
                phase: runtime.moonBirth.phase,
                parentId: runtime.moonBirth.parentId,
              }
            : null,
          cosmicScale: runtime.cosmicScale.id,
          cameraDistance: camera.position.distanceTo(controls.target),
          landmarks: cosmicLandmarkField.visuals
            .filter((visual) => visual.group.visible)
            .map((visual) => {
              const projected = visual.group
                .getWorldPosition(new THREE.Vector3())
                .project(camera);
              return {
                id: visual.landmark.id,
                scale: visual.landmark.scale,
                x: rect.left + (projected.x * 0.5 + 0.5) * rect.width,
                y: rect.top + (-projected.y * 0.5 + 0.5) * rect.height,
                interactive: visual.hitArea.visible,
              };
            }),
        };
      };
    }

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
      livingGalaxy.points.geometry.setDrawRange(
        0,
        Math.min(1900, Math.max(1150, Math.floor(profile.starCount * 0.8))),
      );
      livingGalaxy.distant.geometry.setDrawRange(
        0,
        Math.min(
          livingGalaxy.distant.geometry.getAttribute("position").count,
          Math.max(210, Math.floor(profile.starCount * 0.2)),
        ),
      );
      renderer.setPixelRatio(profile.pixelRatio);
      renderer.setSize(rect.width, rect.height, false);
      composer.setPixelRatio(profile.pixelRatio);
      composer.setSize(rect.width, rect.height);
      camera.aspect = rect.width / Math.max(1, rect.height);
      camera.fov = camera.aspect < 0.8 ? 55 : 42;
      camera.updateProjectionMatrix();
      bloomPass.strength = profile.bloomStrength;
      finishingPass.uniforms.uGrain.value = profile.grain ? 0.05 : 0;
      for (const visual of runtime.bodyVisuals.values()) {
        visual.orbitString.material.resolution.set(rect.width, rect.height);
      }
      moonPreview.innerRing.material.resolution.set(rect.width, rect.height);
      moonPreview.outerRing.material.resolution.set(rect.width, rect.height);
      harmonicKnot.material.resolution.set(rect.width, rect.height);
      for (const groove of livingGalaxy.grooves) {
        groove.material.resolution.set(rect.width, rect.height);
      }
      memoryComet.trail.material.resolution.set(rect.width, rect.height);
      for (const arch of resonanceCathedral.arches) {
        arch.material.resolution.set(rect.width, rect.height);
      }
      thereminField.guide.material.resolution.set(rect.width, rect.height);
      for (const ring of thereminField.rings) {
        ring.material.resolution.set(rect.width, rect.height);
      }
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
      const worlds = [...runtime.bodyVisuals.values()]
        .flatMap((visual) => [visual.mesh, visual.rim]);
      const worldHit = runtime.raycaster.intersectObjects(worlds, false)[0];
      if (worldHit) return worldHit.object.userData.bodyId ?? null;

      const starHit = runtime.raycaster.intersectObjects(
        [starVisual.hitArea],
        false,
      )[0];
      return starHit?.object?.userData?.bodyId ?? null;
    };

    const hitCosmicLandmark = (event) => {
      if (runtime.cosmicScale.id === "orbit" || runtime.cosmicScale.id === "system") return null;
      const point = eventPoint(event, renderer.domElement);
      runtime.pointer.set((point.x / point.width) * 2 - 1, -(point.y / point.height) * 2 + 1);
      runtime.raycaster.setFromCamera(runtime.pointer, camera);
      const hitTargets = cosmicLandmarkField.visuals
        .filter((visual) => visual.hitArea.visible)
        .map((visual) => visual.hitArea);
      const hit = runtime.raycaster.intersectObjects(hitTargets, false)[0];
      const landmarkId = hit?.object?.userData?.cosmicLandmarkId;
      return landmarkId ? cosmicLandmarkField.byId.get(landmarkId)?.landmark ?? null : null;
    };

    const trailPaths = () => {
      const rect = renderer.domElement.getBoundingClientRect();
      return [...runtime.bodyVisuals.entries()]
        .filter(([, visual]) => visual.orbitPoints.length > 1)
        .map(([bodyId, visual]) => {
          const projectedBody = visual.group.position.clone().project(camera);
          return {
            bodyId,
            bodyPoint: {
              x: (projectedBody.x * 0.5 + 0.5) * rect.width,
              y: (-projectedBody.y * 0.5 + 0.5) * rect.height,
            },
            points: visual.orbitPoints.map((point) => {
              const projected = new THREE.Vector3(point.x, point.y, point.z).project(camera);
              return {
                x: (projected.x * 0.5 + 0.5) * rect.width,
                y: (-projected.y * 0.5 + 0.5) * rect.height,
              };
            }),
          };
        });
    };
    if (import.meta.env.DEV || window.__relativityE2E === true) {
      mount.__rgTrailPaths = trailPaths;
    }

    const capturePointer = (pointerId) => {
      try {
        renderer.domElement.setPointerCapture(pointerId);
      } catch {
        // The pointer may already be released (stylus lift, synthetic ids), so the gesture continues without capture.
      }
    };

    const releaseCapturedPointer = (pointerId) => {
      if (pointerId == null) return;
      try {
        if (renderer.domElement.hasPointerCapture(pointerId)) {
          renderer.domElement.releasePointerCapture(pointerId);
        }
      } catch {
        // Pointer capture can disappear between a second touch and this cancellation.
      }
    };

    const triggerOrbitPulse = (bodyId, at = performance.now() / 1000) => {
      const visual = runtime.bodyVisuals.get(bodyId);
      if (!visual || visual.orbitPoints.length < 2) {
        runtime.pendingOrbitPulses.set(bodyId, at);
        return;
      }
      visual.pulseAt = at;
      visual.pulseStartIndex = nearestOrbitPointIndex(visual.orbitPoints, visual.group.position);
    };

    const performCosmicAudition = (landmark) => {
      triggerCosmicLandmark(cosmicLandmarkField, landmark.id);
      if (!propsRef.current.isListener) {
        propsRef.current.onBodyGesture({
          kind: "cosmic-landmark",
          at: Number(engineRef.current.state.time.toFixed(6)),
          landmarkId: landmark.id,
        });
      }
      propsRef.current.onCosmicAudition(landmark);
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
      triggerOrbitPulse(body.id);
      runtime.memoryComet.activeAt = performance.now() / 1000;
      runtime.memoryComet.bodyId = body.id;
      runtime.memoryComet.color = voiceVisual(body.voice).color;
      propsRef.current.onPluckBloom({ ...body }, pluck);
    };

    const showLaunchPreview = (birth) => {
      const engine = engineRef.current;
      const star = engine.getBody("star");
      try {
        const candidate = birthBodyFromRadialLaunch({
          release: birth.release,
          star,
          existingIds: engine.state.bodies.filter((body) => body.kind !== "star").map((body) => body.id),
          existingBodies: engine.state.bodies.filter((body) => body.kind === "planet"),
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
        propsRef.current.onGestationTone({
          ...candidate,
          deferAudio: audioUnlockPhase(birth.pointerType) === "pointerup",
        });
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

    const updateMoonBand = () => {
      const activeBirth = shouldShowMoonPlacementGuide({
        activeDrag: Boolean(runtime.moonBirth?.active),
      })
        ? runtime.moonBirth
        : null;
      if (!activeBirth) {
        renderer.domElement.dataset.moonPlacementGuide = "hidden";
        moonPreview.group.visible = false;
        return null;
      }
      const parentId = activeBirth.parentId;
      const parent = engineRef.current.getBody(parentId);
      const star = engineRef.current.getBody("star");
      const siblingCount = engineRef.current.state.bodies
        .filter((body) => body.kind === "moon" && body.parentId === parentId)
        .length;
      const canAddMoon = !propsRef.current.isListener
        && parent?.kind === "planet"
        && siblingCount < 2
        && engineRef.current.state.bodies.filter((body) => body.kind !== "star").length < MAX_WORLDS;
      if (!canAddMoon || !star) {
        renderer.domElement.dataset.moonPlacementGuide = "hidden";
        moonPreview.group.visible = false;
        return null;
      }
      const band = satelliteStabilityBand({ parent, star });
      const parentStage = bodyToStage(parent, STAGE_SCALE);
      const displayInnerRadius = band.innerRadius * STAGE_SCALE * MOON_DISPLAY_MAGNIFICATION;
      const displayOuterRadius = band.outerRadius * STAGE_SCALE * MOON_DISPLAY_MAGNIFICATION;
      moonPreview.group.position.set(parentStage.x, 0, parentStage.z);
      moonPreview.group.visible = true;
      renderer.domElement.dataset.moonPlacementGuide = "visible";
      moonPreview.parentId = parent.id;
      moonPreview.band = band;
      const resolution = {
        width: renderer.domElement.clientWidth,
        height: renderer.domElement.clientHeight,
      };
      writeOrbitString(
        moonPreview.innerRing,
        localCirclePoints(displayInnerRadius),
        0xff765f,
        0.58,
        1.45,
        resolution,
      );
      writeOrbitString(
        moonPreview.outerRing,
        localCirclePoints(displayOuterRadius),
        0xd7aa5f,
        0.92,
        2.15,
        resolution,
      );
      return { parent, star, band, parentStage };
    };

    const showMoonPreview = (birth) => {
      const context = updateMoonBand();
      if (!context) return;
      const { parent, star, parentStage } = context;
      const releaseStage = bodyToStage(birth.release, STAGE_SCALE);
      const localRelease = {
        x: releaseStage.x - parentStage.x,
        y: 0.08,
        z: releaseStage.z - parentStage.z,
      };
      updateTrailLine(moonPreview.guideLine, [
        { x: 0, y: 0.05, z: 0 },
        localRelease,
      ], 0, 0.66);
      try {
        const physicalRelease = physicalMoonRelease(birth.release, parent);
        const candidate = birthSatelliteFromRadialLaunch({
          release: physicalRelease,
          parent,
          star,
          existingBodies: engineRef.current.state.bodies,
        });
        const voice = voiceVisual(candidate.voice);
        moonPreview.seed.position.set(localRelease.x, localRelease.y, localRelease.z);
        moonPreview.seed.scale.setScalar(1);
        moonPreview.seed.material.emissive.setHex(voice.color);
        moonPreview.seed.material.opacity = 1;
        moonPreview.seed.visible = true;
        moonPreview.guideLine.material.uniforms.uColor.value.setHex(voice.color);
        moonPreview.orbitLine.material.uniforms.uColor.value.setHex(voice.color);
        const localOrbit = orbitPathForBody(candidate, parent, 96)
          .map((point) => {
            const stage = bodyToStage({
              x: parent.x + (point.x - parent.x) * MOON_DISPLAY_MAGNIFICATION,
              y: parent.y + (point.y - parent.y) * MOON_DISPLAY_MAGNIFICATION,
            }, STAGE_SCALE);
            return {
              x: stage.x - parentStage.x,
              y: 0.07,
              z: stage.z - parentStage.z,
            };
          });
        updateTrailLine(moonPreview.orbitLine, localOrbit, 0, 0.52);
        propsRef.current.onGestationTone({
          ...candidate,
          deferAudio: audioUnlockPhase(moonBirth.pointerType) === "pointerup",
        });
      } catch {
        moonPreview.seed.visible = false;
        moonPreview.orbitLine.visible = false;
        moonPreview.guideLine.material.uniforms.uColor.value.setHex(0xff765f);
        propsRef.current.onGestationTone(null);
      }
    };

    const endThereminGesture = (phase = null) => {
      const gesture = runtime.theremin;
      if (!gesture) return;
      window.clearTimeout(gesture.holdTimer);
      runtime.theremin = null;
      thereminField.group.visible = false;
      renderer.domElement.dataset.thereminPhase = "idle";
      releaseCapturedPointer(gesture.pointerId);
      if (phase) {
        propsRef.current.onTheremin({ phase });
      } else if (gesture.active) {
        propsRef.current.onTheremin({ phase: "end" });
      }
    };

    const armTheremin = (event) => {
      const worldPoint = intersectPlane(event);
      if (!worldPoint) return;
      const screen = eventPoint(event, renderer.domElement);
      const gesture = {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        startScreen: screen,
        lastScreen: screen,
        worldPoint,
        active: false,
        holdTimer: null,
      };
      gesture.holdTimer = window.setTimeout(() => {
        if (runtime.theremin !== gesture) return;
        const traveled = Math.hypot(
          gesture.lastScreen.x - gesture.startScreen.x,
          gesture.lastScreen.y - gesture.startScreen.y,
        );
        if (!shouldBeginThereminHold({
          pointerType: gesture.pointerType,
          activeTouchCount: runtime.activeTouchPointers.size,
          traveled,
          dragThreshold: CREATION_DRAG_THRESHOLD,
        })) {
          endThereminGesture("cancel");
          return;
        }
        gesture.active = true;
        renderer.domElement.dataset.thereminPhase = "active";
        capturePointer(event.pointerId);
        controls.enabled = false;
        const parameters = {
          ...thereminParameters(screen),
          deferAudio: audioUnlockPhase(gesture.pointerType) === "pointerup",
        };
        const star = engineRef.current.getBody("star");
        if (!star) return;
        updateThereminField(
          thereminField,
          bodyToStage(stageToWorld(worldPoint), STAGE_SCALE),
          bodyToStage(star, STAGE_SCALE),
          parameters,
          {
            width: renderer.domElement.clientWidth,
            height: renderer.domElement.clientHeight,
          },
        );
        propsRef.current.onTheremin({ phase: "prepare", parameters });
      }, THEREMIN_HOLD_MS);
      runtime.theremin = gesture;
      renderer.domElement.dataset.thereminPhase = "arming";
      armThereminField(
        thereminField,
        bodyToStage(stageToWorld(worldPoint), STAGE_SCALE),
        {
          width: renderer.domElement.clientWidth,
          height: renderer.domElement.clientHeight,
        },
      );
      propsRef.current.onTheremin({ phase: "arming" });
    };

    const cancelDirectManipulation = ({ rememberPointers = false } = {}) => {
      const directPointerIds = [
        runtime.birth?.pointerId,
        runtime.moonBirth?.pointerId,
        runtime.theremin?.pointerId,
        runtime.pluck?.pointerId,
        runtime.pendingBodyTap?.pointerId,
        runtime.pendingCosmicTap?.pointerId,
      ].filter((pointerId) => Number.isInteger(pointerId));
      if (rememberPointers) {
        for (const pointerId of [
          ...directPointerIds,
          ...runtime.activeTouchPointers,
        ]) {
          runtime.cancelledPointerIds.add(pointerId);
        }
      }
      endThereminGesture("cancel");
      if (runtime.moonBirth) {
        runtime.moonBirth = null;
        moonPreview.seed.visible = false;
        moonPreview.guideLine.visible = false;
        moonPreview.orbitLine.visible = false;
        propsRef.current.onGestationTone(null);
        propsRef.current.onMoonPhase("armed");
      }
      if (runtime.birth) {
        runtime.birth = null;
        launchPreview.group.visible = false;
        propsRef.current.onGestationTone(null);
        propsRef.current.onLaunchPhase("armed");
      }
      runtime.pluck = null;
      runtime.pendingBodyTap = null;
      runtime.pendingCosmicTap = null;
      directPointerIds.forEach(releaseCapturedPointer);
      controls.enabled = true;
    };

    const applyPendingInteractionCancel = () => {
      const nextToken = propsRef.current.interactionCancelToken;
      if (nextToken === runtime.lastInteractionCancelToken) return false;
      runtime.lastInteractionCancelToken = nextToken;
      cancelDirectManipulation({ rememberPointers: true });
      return true;
    };

    const onPointerDown = (event) => {
      applyPendingInteractionCancel();
      runtime.cancelledPointerIds.delete(event.pointerId);
      const unlockPhase = audioUnlockPhase(event.pointerType);
      const deferAudio = unlockPhase === "pointerup";
      if (unlockPhase === "pointerdown") {
        propsRef.current.onAudioUnlock();
      }
      if (event.pointerType === "touch") {
        runtime.activeTouchPointers.add(event.pointerId);
        if (shouldCancelDirectManipulation({
          pointerType: event.pointerType,
          activeTouchCount: runtime.activeTouchPointers.size,
        })) {
          cancelDirectManipulation({ rememberPointers: true });
          return;
        }
      }
      const cosmicLandmark = hitCosmicLandmark(event);
      if (cosmicLandmark) {
        if (deferAudio) {
          runtime.pendingCosmicTap = {
            pointerId: event.pointerId,
            pointerType: event.pointerType,
            landmark: cosmicLandmark,
            startScreen: eventPoint(event, renderer.domElement),
          };
        } else {
          event.stopImmediatePropagation();
          performCosmicAudition(cosmicLandmark);
        }
        return;
      }
      if (propsRef.current.interactionMode === "explore") return;
      const bodyId = hitBody(event);
      const engine = engineRef.current;
      if (propsRef.current.interactionMode === "moon"
        && bodyId !== propsRef.current.selectedBodyId) {
        propsRef.current.onBirthRefused("Start from the selected planet to make its moon.");
        return;
      }

      if (bodyId === "star"
        && propsRef.current.interactionMode === "compose"
        && !propsRef.current.isListener) {
        if (event.pointerType !== "touch") event.stopImmediatePropagation();
        if (engine.state.bodies.filter((body) => body.kind !== "star").length >= MAX_WORLDS) {
          propsRef.current.onBirthRefused("The sky is full. Remove a world before adding another.");
          return;
        }
        const point = intersectPlane(event);
        if (!point) return;
        if (event.pointerType !== "touch") capturePointer(event.pointerId);
        runtime.birth = {
          release: stageToWorld(point),
          phase: "forming",
          pointerId: event.pointerId,
          pointerType: event.pointerType,
          startScreen: eventPoint(event, renderer.domElement),
          active: false,
        };
        if (event.pointerType !== "touch") controls.enabled = false;
        return;
      }

      if (bodyId && bodyId !== "star") {
        if (!deferAudio) {
          event.stopImmediatePropagation();
          capturePointer(event.pointerId);
          propsRef.current.onBodySelect(bodyId);
          propsRef.current.onBodyAudition(bodyId);
        } else {
          runtime.pendingBodyTap = {
            pointerId: event.pointerId,
            pointerType: event.pointerType,
            bodyId,
            startScreen: eventPoint(event, renderer.domElement),
          };
        }
        const parent = engine.getBody(bodyId);
        const siblingCount = engine.state.bodies
          .filter((body) => body.kind === "moon" && body.parentId === bodyId)
          .length;
        if (!propsRef.current.isListener
          && propsRef.current.interactionMode === "moon"
          && bodyId === propsRef.current.selectedBodyId
          && parent?.kind === "planet"
          && siblingCount < 2
          && engine.state.bodies.filter((body) => body.kind !== "star").length < MAX_WORLDS) {
          const point = intersectPlane(event);
          if (!point) return;
          runtime.moonBirth = {
            parentId: bodyId,
            release: stageToWorld(point),
            phase: "forming",
            pointerId: event.pointerId,
            pointerType: event.pointerType,
            startScreen: eventPoint(event, renderer.domElement),
            active: false,
          };
          if (event.pointerType !== "touch") controls.enabled = false;
        }
        return;
      }

      if (propsRef.current.interactionMode === "moon") return;
      const point = eventPoint(event, renderer.domElement);
      const stringHit = nearestStringPoint(point, trailPaths(), STRING_TOUCH_DISTANCE);
      if (stringHit) {
        const deferred = shouldDeferStringPluck(event.pointerType);
        if (event.pointerType !== "touch") {
          event.stopImmediatePropagation();
          capturePointer(event.pointerId);
        }
        runtime.pluck = {
          pointerId: event.pointerId,
          pointerType: event.pointerType,
          pendingPluck: deferred ? { hit: stringHit, strength: 0.62 } : null,
          lastPluckAt: new Map([[stringHit.bodyId, performance.now()]]),
          lastPoint: { x: point.x, y: point.y },
        };
        if (event.pointerType !== "touch") controls.enabled = false;
        if (!deferred) performPluck(stringHit, 0.62);
        return;
      }
      armTheremin(event);
    };

    const onPointerMove = (event) => {
      if (applyPendingInteractionCancel()
        || runtime.cancelledPointerIds.has(event.pointerId)) return;
      for (const pendingKey of ["pendingBodyTap", "pendingCosmicTap"]) {
        const pending = runtime[pendingKey];
        if (!pending || pending.pointerId !== event.pointerId) continue;
        const screen = eventPoint(event, renderer.domElement);
        const traveled = Math.hypot(
          screen.x - pending.startScreen.x,
          screen.y - pending.startScreen.y,
        );
        if (traveled > CREATION_DRAG_THRESHOLD) runtime[pendingKey] = null;
      }
      if (runtime.theremin) {
        const screen = eventPoint(event, renderer.domElement);
        runtime.theremin.lastScreen = screen;
        const traveled = Math.hypot(
          screen.x - runtime.theremin.startScreen.x,
          screen.y - runtime.theremin.startScreen.y,
        );
        if (!runtime.theremin.active) {
          if (runtime.activeTouchPointers.size > 1 || traveled > CREATION_DRAG_THRESHOLD) {
            endThereminGesture("cancel");
            controls.enabled = true;
          }
          return;
        }
        event.stopImmediatePropagation();
        const point = intersectPlane(event);
        if (!point) return;
        runtime.theremin.lastScreen = screen;
        runtime.theremin.worldPoint = point;
        const parameters = {
          ...thereminParameters(screen),
          deferAudio: audioUnlockPhase(runtime.theremin.pointerType) === "pointerup",
        };
        const star = engineRef.current.getBody("star");
        if (!star) return;
        updateThereminField(
          thereminField,
          bodyToStage(stageToWorld(point), STAGE_SCALE),
          bodyToStage(star, STAGE_SCALE),
          parameters,
          {
            width: renderer.domElement.clientWidth,
            height: renderer.domElement.clientHeight,
          },
        );
        propsRef.current.onTheremin({ phase: "update", parameters });
        return;
      }
      if (runtime.moonBirth) {
        const screen = eventPoint(event, renderer.domElement);
        const traveled = Math.hypot(
          screen.x - runtime.moonBirth.startScreen.x,
          screen.y - runtime.moonBirth.startScreen.y,
        );
        if (!runtime.moonBirth.active && traveled < CREATION_DRAG_THRESHOLD) return;
        event.stopImmediatePropagation();
        const point = intersectPlane(event);
        if (!point) return;
        if (!runtime.moonBirth.active) {
          capturePointer(event.pointerId);
          runtime.moonBirth.active = true;
          runtime.moonBirth.phase = "aiming";
          propsRef.current.onMoonPhase("aiming");
        }
        runtime.moonBirth.release = stageToWorld(point);
        showMoonPreview(runtime.moonBirth);
        return;
      }
      if (runtime.birth) {
        const screen = eventPoint(event, renderer.domElement);
        const traveled = Math.hypot(
          screen.x - runtime.birth.startScreen.x,
          screen.y - runtime.birth.startScreen.y,
        );
        if (!runtime.birth.active && traveled < CREATION_DRAG_THRESHOLD) return;
        event.stopImmediatePropagation();
        const point = intersectPlane(event);
        if (!point) return;
        const world = stageToWorld(point);
        if (!runtime.birth.active) {
          capturePointer(event.pointerId);
          runtime.birth.active = true;
          runtime.birth.phase = "aiming";
          propsRef.current.onLaunchPhase("aiming");
        }
        runtime.birth.release = world;
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
            const strength = 0.4 + Math.min(0.6, traveled / 230);
            if (shouldDeferStringPluck(runtime.pluck.pointerType)) {
              runtime.pluck.pendingPluck = { hit, strength };
            } else {
              performPluck(hit, strength);
            }
            runtime.pluck.lastPluckAt.set(hit.bodyId, performance.now());
            runtime.pluck.lastPoint = { x: point.x, y: point.y };
          }
        }
        return;
      }
    };

    const cancelPointer = (event) => {
      const interactionWasCancelled = applyPendingInteractionCancel()
        || runtime.cancelledPointerIds.has(event.pointerId);
      runtime.activeTouchPointers.delete(event.pointerId);
      runtime.cancelledPointerIds.delete(event.pointerId);
      if (!interactionWasCancelled) {
        cancelDirectManipulation({ rememberPointers: true });
        runtime.cancelledPointerIds.delete(event.pointerId);
      }
      runtime.latestGesture = null;
      controls.enabled = true;
      releaseCapturedPointer(event.pointerId);
    };

    const finishPointer = (event) => {
      const interactionWasCancelled = applyPendingInteractionCancel()
        || runtime.cancelledPointerIds.has(event.pointerId);
      runtime.activeTouchPointers.delete(event.pointerId);
      runtime.cancelledPointerIds.delete(event.pointerId);
      if (interactionWasCancelled) {
        runtime.latestGesture = null;
        controls.enabled = true;
        releaseCapturedPointer(event.pointerId);
        return;
      }
      if (audioUnlockPhase(event.pointerType) === "pointerup") {
        propsRef.current.onAudioUnlock();
      }
      if (runtime.theremin) {
        if (event.pointerType !== "touch") event.stopImmediatePropagation();
        const gesture = runtime.theremin;
        const wasActive = gesture.active;
        let releaseParameters = null;
        let releaseFailed = false;
        try {
          if (shouldSoundThereminOnRelease({
            pointerType: gesture.pointerType,
            active: gesture.active,
          })) {
            releaseParameters = {
              ...thereminParameters(gesture.lastScreen),
              deferAudio: false,
            };
          }
        } catch (error) {
          releaseFailed = true;
          propsRef.current.onBirthRefused(
            error instanceof Error ? error.message : "The theremin could not be released",
          );
        } finally {
          const disposition = thereminReleaseDisposition({
            wasActive,
            releaseFailed,
            hasReleaseParameters: Boolean(releaseParameters),
          });
          gesture.active = disposition.activeDuringCompletion;
          endThereminGesture(disposition.completionPhase);
          controls.enabled = true;
          releaseCapturedPointer(event.pointerId);
        }
        if (releaseParameters) {
          propsRef.current.onTheremin({
            phase: "release",
            parameters: releaseParameters,
          });
        }
        return;
      }
      if (runtime.pendingCosmicTap?.pointerId === event.pointerId) {
        const { landmark } = runtime.pendingCosmicTap;
        runtime.pendingCosmicTap = null;
        performCosmicAudition(landmark);
        releaseCapturedPointer(event.pointerId);
        return;
      }
      if (runtime.pendingBodyTap?.pointerId === event.pointerId) {
        const { bodyId } = runtime.pendingBodyTap;
        runtime.pendingBodyTap = null;
        propsRef.current.onBodySelect(bodyId);
        propsRef.current.onBodyAudition(bodyId);
      }
      if (runtime.moonBirth) {
        if (event.pointerType !== "touch") event.stopImmediatePropagation();
        const moonBirth = runtime.moonBirth;
        runtime.moonBirth = null;
        moonPreview.seed.visible = false;
        moonPreview.guideLine.visible = false;
        moonPreview.orbitLine.visible = false;
        propsRef.current.onGestationTone(null);
        if (moonBirth.active) try {
          const engine = engineRef.current;
          const parent = engine.getBody(moonBirth.parentId);
          const star = engine.getBody("star");
          const spec = birthSatelliteFromRadialLaunch({
            release: physicalMoonRelease(moonBirth.release, parent),
            parent,
            star,
            existingBodies: engine.state.bodies,
          });
          const birthEvent = engine.addBody(spec);
          propsRef.current.onBodySelect(spec.id);
          propsRef.current.onBodyGesture(birthEvent);
          propsRef.current.onMoonBloom({ ...engine.getBody(spec.id) }, { ...parent });
          propsRef.current.onMoonComplete(spec.id, parent.id);
        } catch (error) {
          propsRef.current.onBirthRefused(error instanceof Error ? error.message : "The moon could not be born");
          propsRef.current.onMoonPhase("armed");
        }
      }
      if (runtime.birth) {
        if (event.pointerType !== "touch") event.stopImmediatePropagation();
        const birth = runtime.birth;
        runtime.birth = null;
        launchPreview.group.visible = false;
        propsRef.current.onGestationTone(null);
        if (birth.active) try {
          const engine = engineRef.current;
          const spec = birthBodyFromRadialLaunch({
            release: birth.release,
            star: engine.getBody("star"),
            existingIds: engine.state.bodies.filter((body) => body.kind !== "star").map((body) => body.id),
            existingBodies: engine.state.bodies.filter((body) => body.kind === "planet"),
            birthIndex: birthCountRef.current,
          });
          const birthEvent = engine.addBody(spec);
          birthCountRef.current += 1;
          propsRef.current.onBodySelect(spec.id);
          propsRef.current.onBodyGesture(birthEvent);
          triggerOrbitPulse(spec.id);
          propsRef.current.onBirthBloom({ ...engine.getBody(spec.id) });
          propsRef.current.onLaunchComplete(spec.id);
        } catch (error) {
          propsRef.current.onBirthRefused(error instanceof Error ? error.message : "The world could not be born");
        }
      }
      if (runtime.pluck) {
        const pluck = runtime.pluck;
        runtime.pluck = null;
        if (pluck.pointerId === event.pointerId
          && shouldDeferStringPluck(pluck.pointerType)
          && runtime.activeTouchPointers.size === 0
          && pluck.pendingPluck) {
          performPluck(pluck.pendingPluck.hit, pluck.pendingPluck.strength);
        }
        controls.enabled = true;
        releaseCapturedPointer(event.pointerId);
        return;
      }
      runtime.latestGesture = null;
      controls.enabled = true;
      releaseCapturedPointer(event.pointerId);
    };

    const clearCancelledPointerOutsideCanvas = (event) => {
      if (event.target === renderer.domElement) return;
      if (!runtime.cancelledPointerIds.delete(event.pointerId)) return;
      runtime.activeTouchPointers.delete(event.pointerId);
      releaseCapturedPointer(event.pointerId);
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown, { capture: true });
    renderer.domElement.addEventListener("pointermove", onPointerMove, { capture: true });
    renderer.domElement.addEventListener("pointerup", finishPointer, { capture: true });
    renderer.domElement.addEventListener("pointercancel", cancelPointer, { capture: true });
    window.addEventListener("pointerup", clearCancelledPointerOutsideCanvas, true);
    window.addEventListener("pointercancel", clearCancelledPointerOutsideCanvas, true);
    const handleControlStart = () => {
      runtime.userControllingCamera = true;
      runtime.cameraJourneyTargetId = null;
      propsRef.current.onCameraNavigate({ type: "manual" });
    };
    const handleControlEnd = () => {
      runtime.userControllingCamera = false;
      if (propsRef.current.interactionMode === "explore" || runtime.lastFitDistance <= 0) return;
      runtime.authoredCameraDistance = clamp(
        camera.position.distanceTo(controls.target),
        controls.minDistance,
        controls.maxDistance,
      );
      runtime.authoredScaleId = null;
      runtime.compositionZoom = clamp(
        runtime.authoredCameraDistance / runtime.lastFitDistance,
        0.58,
        7.2,
      );
    };
    controls.addEventListener("start", handleControlStart);
    controls.addEventListener("end", handleControlEnd);

    const resetListenerLoop = () => {
      engineRef.current.reset(initialStateRef.current);
      appliedEventIndexRef.current = 0;
      accumulatorRef.current = 0;
      runtime.authoredCameraDistance = COSMIC_DESTINATIONS.system.distance;
      runtime.authoredScaleId = "system";
      runtime.compositionZoom = 1;
      runtime.resettingCamera = true;
      previousSideRef.current = new Map(
        engineRef.current.state.bodies
          .filter((body) => body.kind !== "star")
          .map((body) => [body.id, observerSide(body, engineRef.current.state.bodies)]),
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
          if (event.kind === "cosmic-landmark") {
            const landmark = cosmicLandmarkById(event.landmarkId);
            const destination = cosmicDestination(landmark.scale);
            runtime.authoredCameraDistance = destination.distance;
            runtime.authoredScaleId = destination.id;
            runtime.compositionZoom = 1;
            runtime.resettingCamera = true;
            triggerCosmicLandmark(cosmicLandmarkField, landmark.id);
            currentProps.onCosmicAudition(landmark);
            appliedEventIndexRef.current += 1;
            continue;
          }
          if (event.kind === "pluck") {
            const body = engine.getBody(event.bodyId);
            if (body) {
              const visual = runtime.bodyVisuals.get(body.id);
              if (visual) visual.impulse = 1;
              runtime.pendingOrbitPulses.set(body.id, performance.now() / 1000);
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
              if (born.kind === "moon") {
                const parent = engine.getBody(born.parentId);
                if (parent) currentProps.onMoonBloom({ ...born }, { ...parent });
              } else {
                runtime.pendingOrbitPulses.set(born.id, performance.now() / 1000);
                currentProps.onBirthBloom({ ...born });
              }
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
        if (body.kind === "star") continue;
        const focus = body.kind === "moon" ? engine.getBody(body.parentId) : star;
        const side = observerSide(body, engine.state.bodies);
        const previousSide = previousSideRef.current.get(body.id);
        if (previousSide
          && side
          && previousSide !== side
          && !runtime.drag
          && shouldAutoSoundBody(body)) {
          const note = {
            ...body,
            mass: body.displayMass,
            velocityX: body.vx - (focus?.vx ?? 0),
          };
          const visual = runtime.bodyVisuals.get(body.id);
          if (visual) visual.impulse = 1;
          runtime.starVisual.impulse = Math.min(1, runtime.starVisual.impulse + 0.55);
          triggerOrbitPulse(body.id);
          currentProps.onNote(note);
        }
        if (side) previousSideRef.current.set(body.id, side);
        if (focus) {
          const dx = body.x - focus.x;
          const dy = body.y - focus.y;
          const radialVelocity = (dx * (body.vx - focus.vx) + dy * (body.vy - focus.vy)) /
            Math.max(0.001, Math.hypot(dx, dy));
          const previous = previousRadialVelocityRef.current.get(body.id);
          if (previous < 0 && radialVelocity >= 0 && shouldAutoSoundBody(body)) {
            currentProps.onHaptic({ kind: "pericenter", strength: body.displayMass });
          }
          previousRadialVelocityRef.current.set(body.id, radialVelocity);
        }
      }
    };

    const syncVisuals = (snapshot, delta, now) => {
      const liveIds = new Set(snapshot.bodies.filter((body) => body.kind !== "star").map((body) => body.id));
      for (const [bodyId, visual] of runtime.bodyVisuals) {
        if (liveIds.has(bodyId)) continue;
        scene.remove(visual.group);
        scene.remove(visual.orbitString);
        scene.remove(visual.notePulse);
        disposeObject(visual.orbitString);
        disposeObject(visual.notePulse);
        disposeObject(visual.group);
        runtime.bodyVisuals.delete(bodyId);
      }

      const selectedId = propsRef.current.selectedBodyId;
      const moonMode = Boolean(runtime.moonBirth?.active);
      const systemMix = runtime.cosmicScale?.systemMix ?? 1;
      runtime.selectedBodyId = selectedId;
      const stageBodies = new Map();
      const bodiesById = new Map(snapshot.bodies.map((body) => [body.id, body]));
      const star = bodiesById.get("star");
      let starStage = new THREE.Vector3();
      let systemRadius = 0;
      for (const body of snapshot.bodies) {
        const stage = bodyToStage(displayWorldForBody(body, bodiesById), STAGE_SCALE);
        stageBodies.set(body.id, stage);
        if (body.kind === "star") {
          starStage = new THREE.Vector3(stage.x, 0, stage.z);
          starVisual.group.position.lerp(new THREE.Vector3(stage.x, 0, stage.z), 1 - Math.exp(-delta * 18));
          starVisual.impulse *= Math.exp(-delta * 2.6);
          const breathPhase = Math.sin(snapshot.time * 1.4);
          const breath = 1 + breathPhase * 0.035 + starVisual.impulse * 0.06;
          starVisual.group.scale.setScalar(0.34 + systemMix * 0.66);
          starVisual.corona.scale.setScalar(1.9 * breath);
          starVisual.corona.material.opacity = (
            0.4 + starVisual.impulse * 0.22
          ) * (0.34 + systemMix * 0.66);
          starVisual.glory.scale.setScalar(2.6 * (1 + breathPhase * 0.022 + starVisual.impulse * 0.05));
          starVisual.glory.material.opacity = (
            0.5 + breathPhase * 0.05 + starVisual.impulse * 0.18
          ) * (0.3 + systemMix * 0.7);
          starVisual.glory.material.rotation += delta * 0.016;
          starVisual.outerCorona.scale.setScalar(3.7 * (1 + Math.sin(snapshot.time * 0.42) * 0.05));
          starVisual.mesh.rotation.y += delta * 0.07;
          runtime.starBreath = 0.5 + breathPhase * 0.5;
          continue;
        }

        let visual = runtime.bodyVisuals.get(body.id);
        if (!visual) {
          visual = createPlanetVisual(opalTexture, sharedRadialTexture, body);
          visual.mesh.userData.bodyId = body.id;
          visual.rim.userData.bodyId = body.id;
          scene.add(visual.orbitString);
          scene.add(visual.notePulse);
          scene.add(visual.group);
          runtime.bodyVisuals.set(body.id, visual);
        }
        const target = new THREE.Vector3(stage.x, 0, stage.z);
        systemRadius = Math.max(systemRadius, target.distanceTo(starStage));
        visual.group.position.lerp(target, 1 - Math.exp(-delta * 22));
        const selected = body.id === selectedId;
        const inMoonFamily = selected || (body.kind === "moon" && body.parentId === selectedId);
        const baseScale = body.kind === "moon"
          ? 0.125 + body.displayMass * 0.42
          : 0.24 + body.displayMass * 0.095;
        const scale = baseScale * (selected ? 1.12 : body.kind === "moon" ? 0.86 : 0.86);
        visual.mesh.scale.setScalar(scale);
        visual.rim.scale.setScalar(scale * (body.kind === "moon" ? 3.5 : 4.2));
        visual.mesh.rotation.y += delta * (0.1 + body.properRate * 0.1);
        visual.impulse *= Math.exp(-delta * 2.4);
        const intensity = sonicIntensity({
          displayMass: body.displayMass,
          doppler: body.doppler,
          resonanceStrength: snapshot.resonance?.bodyIds.includes(body.id) ? snapshot.resonance.strength : 0,
          impulse: visual.impulse,
        });
        if (body.kind === "moon") {
          visual.mesh.material.emissiveIntensity = selected
            ? 0.28 + intensity * 0.52
            : 0.08 + intensity * 0.16;
        } else {
          visual.mesh.material.emissiveIntensity = selected
            ? 0.52 + intensity * 1.7
            : 0.16 + intensity * 0.44;
        }
        const voiceColor = voiceVisual(body.voice).color;
        visual.rim.material.color.setHex(voiceColor);
        if (body.kind === "moon") {
          visual.rim.material.opacity = selected
            ? 0.08 + intensity * 0.16
            : 0.018 + intensity * 0.045;
        } else {
          visual.rim.material.opacity = selected
            ? 0.16 + intensity * 0.5
            : 0.06 + intensity * 0.12;
        }
        const tinted = dopplerTintedColor(voiceColor, body.doppler);
        visual.trailColor.setRGB(tinted.r, tinted.g, tinted.b);

        if (visual.orbitPoints.length < 2 || now - visual.orbitUpdatedAt > ORBIT_STRING_REFRESH) {
          const focus = body.kind === "moon" ? bodiesById.get(body.parentId) : star;
          const path = focus ? orbitPathForBody(body, focus, body.kind === "moon" ? 96 : ORBIT_STRING_SAMPLES) : [];
          visual.orbitPoints = path.map((point) => {
            const displayPoint = body.kind === "moon"
              ? {
                  x: focus.x + (point.x - focus.x) * MOON_DISPLAY_MAGNIFICATION,
                  y: focus.y + (point.y - focus.y) * MOON_DISPLAY_MAGNIFICATION,
                }
              : point;
            const orbitPoint = bodyToStage(displayPoint, STAGE_SCALE);
            return {
              x: orbitPoint.x,
              y: body.kind === "moon" ? 0.075 : 0.035,
              z: orbitPoint.z,
            };
          });
          visual.orbitUpdatedAt = now;
        }
        if (shouldOrbitAffectCameraFit(body)) {
          for (const point of visual.orbitPoints) {
            systemRadius = Math.max(systemRadius, Math.hypot(point.x - starStage.x, point.z - starStage.z));
          }
        }
        const pendingPulse = runtime.pendingOrbitPulses.get(body.id);
        if (pendingPulse !== undefined && visual.orbitPoints.length > 1) {
          visual.pulseAt = pendingPulse;
          visual.pulseStartIndex = nearestOrbitPointIndex(visual.orbitPoints, visual.group.position);
          runtime.pendingOrbitPulses.delete(body.id);
        }
        const stringStyle = orbitStringStyle({
          kind: body.kind,
          selected,
          isPlaying: propsRef.current.isPlaying,
          impulse: visual.impulse,
        });
        writeOrbitString(
          visual.orbitString,
          visual.orbitPoints,
          voiceColor,
          (
            moonMode && !inMoonFamily
              ? stringStyle.opacity * 0.08
              : stringStyle.opacity
          ) * (0.05 + systemMix * 0.95),
          stringStyle.linewidth,
          { width: renderer.domElement.clientWidth, height: renderer.domElement.clientHeight },
        );
        visual.notePulse.material.color.setHex(voiceColor);
        updateNotePulse(visual, now);
      }

      runtime.selectedHistory = runtime.bodyVisuals.get(selectedId)?.orbitPoints ?? [];
      const selectedBody = snapshot.bodies.find((body) => body.id === selectedId);
      const selectedVisual = runtime.bodyVisuals.get(selectedId);
      const selectedIntensity = selectedBody && selectedVisual ? sonicIntensity({
        displayMass: selectedBody.displayMass,
        doppler: selectedBody.doppler,
        resonanceStrength: snapshot.resonance?.bodyIds.includes(selectedBody.id) ? snapshot.resonance.strength : 0,
        impulse: selectedVisual.impulse,
      }) : 0;
      const selectedVoiceColor = selectedBody ? voiceVisual(selectedBody.voice).color : 0xffd18a;
      ribbonTrail.group.visible = false;
      if (selectedVisual?.impulse > 0.08
        && runtime.selectedHistory.length > 1
        && now - runtime.lastParticleUpdate > 1 / 30) {
        runtime.lastParticleUpdate = now;
        updateParticleCloud(
          particleCloud,
          runtime.selectedHistory,
          Math.min(runtime.profile.particleCount, 280),
          snapshot.time,
          selectedIntensity * selectedVisual.impulse,
        );
        particleCloud.material.color.setHex(selectedVoiceColor);
      } else if (!selectedVisual || selectedVisual.impulse <= 0.08) {
        particleCloud.visible = false;
      }
      updateHarmonicKnot(
        harmonicKnot,
        snapshot.resonance,
        snapshot.bodies.filter((body) => body.kind === "planet"),
        stageBodies,
        { width: renderer.domElement.clientWidth, height: renderer.domElement.clientHeight },
      );
      if (moonMode) harmonicKnot.visible = false;
      const resolution = {
        width: renderer.domElement.clientWidth,
        height: renderer.domElement.clientHeight,
      };
      const cathedralLevel = updateResonanceCathedral(
        resonanceCathedral,
        snapshot.resonance,
        stageBodies,
        bodiesById,
        snapshot.bodies.filter((body) => body.kind === "planet").length,
        resolution,
      );
      updateLivingGalaxy(
        livingGalaxy,
        runtime.cosmicScale,
        resolution,
        delta,
        reducedMotionQuery.matches,
        cathedralLevel,
      );
      updateCosmicLandmarkField(
        cosmicLandmarkField,
        runtime.cosmicScale,
        delta,
        reducedMotionQuery.matches,
      );
      updateMemoryComet(memoryComet, runtime.bodyVisuals, now, resolution);
      if (runtime.starfield) {
        runtime.starfield.material.uniforms.uOpacity.value = (
          0.66
          - runtime.cosmicScale.galaxyMix * 0.18
          + runtime.cosmicScale.universeMix * 0.08
        ) * (1 - cathedralLevel * 0.42);
        runtime.starfield.material.uniforms.uDustOpacity.value = (
          runtime.cosmicScale.id === "orbit" || runtime.cosmicScale.id === "system"
            ? 0
            : (
                runtime.cosmicScale.neighborhoodMix * 0.08
                + runtime.cosmicScale.galaxyMix * 0.18
                + runtime.cosmicScale.universeMix * 0.12
              ) * (1 - cathedralLevel * 0.5)
        );
      }
      updateMoonBand();

      const projectedStar = starStage.clone().project(camera);
      timeNeedle.style.left = `${clamp((projectedStar.x * 0.5 + 0.5) * 100, 8, 92)}%`;
      timeNeedle.style.opacity = `${clamp(systemMix * 1.18 - 0.14, 0, 1)}`;
      runtime.systemRadius = systemRadius;
      const semanticScaleId = runtime.authoredScaleId
        ?? (runtime.cosmicScale.id === "orbit" ? "system" : runtime.cosmicScale.id);
      const authoredTarget = cosmicCameraTarget(semanticScaleId, starStage);
      runtime.editorialCameraTarget.set(
        authoredTarget.x,
        authoredTarget.y,
        authoredTarget.z,
      );
    };

    const animate = (milliseconds) => {
      const now = milliseconds / 1000;
      const delta = Math.min(MAX_FRAME_DELTA, Math.max(0, (milliseconds - previousFrameRef.current) / 1000));
      previousFrameRef.current = milliseconds;
      const currentProps = propsRef.current;
      applyPendingInteractionCancel();
      const exploring = currentProps.interactionMode === "explore";
      controls.enabled = !runtime.birth?.active
        && !runtime.moonBirth?.active
        && !runtime.theremin?.active;
      controls.enableRotate = exploring;
      controls.enablePan = exploring;
      controls.enableZoom = true;

      if (shouldAdvancePhysics({
        isPlaying: currentProps.isPlaying,
        interactionMode: currentProps.interactionMode,
        creationActive: Boolean(runtime.birth?.active || runtime.moonBirth?.active),
      })) {
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
      const playableBodies = snapshot.bodies.filter((body) => body.kind !== "star");
      const resonance = engineRef.current.getResonance();
      const visualSnapshot = { ...snapshot, resonance };
      syncVisuals(visualSnapshot, delta, now);
      currentProps.onPhysicsFrame({
        time: snapshot.time,
        bodies: playableBodies,
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
          runtime.compositionZoom = 1;
          runtime.authoredCameraDistance = null;
          runtime.authoredScaleId = null;
          runtime.cameraJourneyTargetId = null;
          runtime.resettingCamera = true;
        } else if (cameraCommand.type === "travel") {
          if (!Number.isFinite(cameraCommand.distance)) {
            currentProps.onBirthRefused("Cosmic travel requires a real destination.");
          } else {
            runtime.authoredCameraDistance = clamp(
              cameraCommand.distance,
              controls.minDistance,
              controls.maxDistance,
            );
            runtime.authoredScaleId = cameraCommand.targetId ?? null;
            runtime.cameraJourneyTargetId = cameraCommand.targetId ?? null;
            runtime.compositionZoom = clamp(
              runtime.authoredCameraDistance / Math.max(0.001, runtime.lastFitDistance),
              0.58,
              7.2,
            );
            runtime.resettingCamera = true;
          }
        } else if (!exploring) {
          const zoomFactor = cameraCommand.direction < 0 ? 0.86 : 1.16;
          const currentDistance = runtime.authoredCameraDistance
            ?? camera.position.distanceTo(controls.target);
          runtime.authoredCameraDistance = clamp(
            currentDistance * zoomFactor,
            controls.minDistance,
            controls.maxDistance,
          );
          runtime.authoredScaleId = null;
          runtime.cameraJourneyTargetId = null;
          runtime.compositionZoom = clamp(
            runtime.authoredCameraDistance / Math.max(0.001, runtime.lastFitDistance),
            0.58,
            7.2,
          );
        } else {
          const offset = camera.position.clone().sub(controls.target);
          if (offset.lengthSq() < 0.001) offset.set(-3.7, 3, 6.4);
          offset.setLength(nextCameraDistance(offset.length(), cameraCommand.direction));
          camera.position.copy(controls.target).add(offset);
        }
      }
      const removeCommand = currentProps.removeCommand;
      if (removeCommand?.id > runtime.lastRemoveCommandId) {
        runtime.lastRemoveCommandId = removeCommand.id;
        const victim = engineRef.current.getBody(removeCommand.bodyId);
        if (victim && victim.kind !== "star") {
          const removal = engineRef.current.removeBody(victim.id);
          currentProps.onBodyGesture(removal);
          currentProps.onConsumptionBloom({ ...victim });
          currentProps.onBodySelect(null);
        }
      }
      if (!exploring && !runtime.userControllingCamera) {
        const fitDistance = editorialCameraDistance(runtime.systemRadius ?? 4, camera.aspect);
        runtime.lastFitDistance = fitDistance;
        const authoredDistance = runtime.authoredCameraDistance === null
          ? null
          : runtime.authoredScaleId === "system"
            ? Math.max(runtime.authoredCameraDistance, fitDistance)
            : runtime.authoredCameraDistance;
        const desiredDistance = clamp(
          authoredDistance ?? fitDistance * runtime.compositionZoom,
          controls.minDistance,
          controls.maxDistance,
        );
        const semanticScaleId = runtime.authoredScaleId
          ?? (runtime.cosmicScale.id === "orbit" ? "system" : runtime.cosmicScale.id);
        const direction = cosmicCameraDirection(semanticScaleId);
        const viewDirection = new THREE.Vector3(direction.x, direction.y, direction.z);
        runtime.editorialCameraPosition.copy(runtime.editorialCameraTarget).addScaledVector(viewDirection, desiredDistance);
        const easing = 1 - Math.exp(-delta * (runtime.resettingCamera ? 6.5 : 2.8));
        camera.position.lerp(runtime.editorialCameraPosition, easing);
        controls.target.lerp(runtime.editorialCameraTarget, easing);
        if (runtime.resettingCamera
          && camera.position.distanceTo(runtime.editorialCameraPosition) < 0.015
          && controls.target.distanceTo(runtime.editorialCameraTarget) < 0.01) {
          camera.position.copy(runtime.editorialCameraPosition);
          controls.target.copy(runtime.editorialCameraTarget);
          runtime.resettingCamera = false;
          if (runtime.cameraJourneyTargetId) {
            const targetId = runtime.cameraJourneyTargetId;
            runtime.cameraJourneyTargetId = null;
            currentProps.onCameraNavigate({ type: "settled", targetId });
          }
        }
      }
      controls.autoRotate = false;
      controls.update(delta);

      const cameraDistance = camera.position.distanceTo(controls.target);
      runtime.cosmicScale = cosmicScaleForView(cameraDistance, runtime.authoredScaleId);
      if (now - runtime.lastCameraReport > 0.12) {
        runtime.lastCameraReport = now;
        const reportedDistance = runtime.authoredScaleId === "system"
          ? COSMIC_DESTINATIONS.system.distance
          : cameraDistance;
        currentProps.onCameraScale(cameraScaleLabel(reportedDistance));
        currentProps.onCosmicScale(runtime.cosmicScale);
      }
      composer.render(delta);
    };
    renderer.setAnimationLoop(animate);

    return () => {
      renderer.setAnimationLoop(null);
      window.clearTimeout(runtime.theremin?.holdTimer);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown, { capture: true });
      renderer.domElement.removeEventListener("pointermove", onPointerMove, { capture: true });
      renderer.domElement.removeEventListener("pointerup", finishPointer, { capture: true });
      renderer.domElement.removeEventListener("pointercancel", cancelPointer, { capture: true });
      window.removeEventListener("pointerup", clearCancelledPointerOutsideCanvas, true);
      window.removeEventListener("pointercancel", clearCancelledPointerOutsideCanvas, true);
      controls.removeEventListener("start", handleControlStart);
      controls.removeEventListener("end", handleControlEnd);
      resizeObserver.disconnect();
      reducedMotionQuery.removeEventListener("change", measure);
      controls.stopListenToKeyEvents();
      controls.dispose();
      composer.dispose();
      lacquerTexture.dispose();
      opalTexture.dispose();
      solarTexture.dispose();
      sharedRadialTexture.dispose();
      for (const visual of cosmicLandmarkField.visuals) visual.labelTexture.dispose();
      scene.environment?.dispose();
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
      timeNeedle.remove();
      delete mount.__rgDebugState;
      delete mount.__rgTrailPaths;
      visualRuntimeRef.current = null;
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="soundflight-stage"
      data-interaction-mode={props.interactionMode}
      role="application"
      aria-label="Three-dimensional cosmic instrument. Make planets and moons in your star system, touch orbit strings to play them, or use the Cosmic Lens to visit nearby stars, the Milky Way, the Local Group, and the deep universe. Touch any luminous cosmic landmark to hear its voice."
      tabIndex={0}
    />
  );
}
