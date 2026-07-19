import { useEffect, useMemo, useRef } from "react";

import {
  FIXED_STEP,
  GRAVITATIONAL_CONSTANT,
  PhysicsEngine,
  createInitialPhysicsState,
} from "../lib/physicsEngine.js";

const TAU = Math.PI * 2;
const MAX_FRAME_DELTA = 0.1;
const TRAIL_HORIZON = 31;
const TRAIL_SAMPLE_STEPS = 8;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function screenScale(width, height) {
  return { x: width, y: width * (width > height ? 0.43 : 0.58) };
}

function toScreen(body, width, height) {
  const scale = screenScale(width, height);
  return {
    x: width / 2 + body.x * scale.x,
    y: height / 2 + body.y * scale.y,
  };
}

function toWorld(pointerX, pointerY, width, height) {
  const scale = screenScale(width, height);
  return {
    x: (pointerX - width / 2) / scale.x,
    y: (pointerY - height / 2) / scale.y,
  };
}

function drawSprite(context, image, quadrant, x, y, size, opacity = 1) {
  if (!image?.complete || !image.naturalWidth) return;
  const cellWidth = image.naturalWidth / 2;
  const cellHeight = image.naturalHeight / 2;
  const sourceX = (quadrant % 2) * cellWidth;
  const sourceY = Math.floor(quadrant / 2) * cellHeight;
  context.save();
  context.globalAlpha = opacity;
  context.drawImage(
    image,
    sourceX,
    sourceY,
    cellWidth,
    cellHeight,
    x - size / 2,
    y - size / 2,
    size,
    size,
  );
  context.restore();
}

function drawTextureCell(context, image, quadrant, x, y, width, height, rotation, opacity) {
  if (!image?.complete || !image.naturalWidth) return;
  const cellWidth = image.naturalWidth / 2;
  const cellHeight = image.naturalHeight / 2;
  const sourceX = (quadrant % 2) * cellWidth;
  const sourceY = Math.floor(quadrant / 2) * cellHeight;
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.globalAlpha = opacity;
  context.globalCompositeOperation = "multiply";
  context.drawImage(
    image,
    sourceX,
    sourceY,
    cellWidth,
    cellHeight,
    -width / 2,
    -height / 2,
    width,
    height,
  );
  context.restore();
}

function predictTrajectories(state) {
  const prediction = new PhysicsEngine(state);
  const trajectories = new Map(
    state.bodies.filter((body) => body.kind === "planet").map((body) => [body.id, [{ x: body.x, y: body.y }]]),
  );
  const steps = Math.round(TRAIL_HORIZON / FIXED_STEP);

  for (let index = 0; index < steps; index += 1) {
    prediction.step();
    if (index % TRAIL_SAMPLE_STEPS !== 0) continue;
    for (const body of prediction.state.bodies) {
      if (body.kind !== "planet") continue;
      trajectories.get(body.id)?.push({ x: body.x, y: body.y });
    }
  }

  return trajectories;
}

function pathFromTrajectory(context, points, width, height, offsetX = 0, offsetY = 0) {
  context.beginPath();
  for (let index = 0; index < points.length; index += 1) {
    const point = toScreen(points[index], width, height);
    if (index === 0) context.moveTo(point.x + offsetX, point.y + offsetY);
    else context.lineTo(point.x + offsetX, point.y + offsetY);
  }
}

function drawInkTrajectory(context, points, width, height, brush, body) {
  if (!brush?.complete || !brush.naturalWidth || points.length < 2) return;
  const stride = width < 620 ? 4 : 3;
  for (let index = stride; index < points.length; index += stride) {
    const previous = toScreen(points[index - stride], width, height);
    const point = toScreen(points[index], width, height);
    const tangent = Math.atan2(point.y - previous.y, point.x - previous.x);
    const noise = Math.sin(index * 12.9898 + body.displayMass * 78.233) * 43758.5453;
    const fraction = noise - Math.floor(noise);
    const dryHairline = index % 17 === 0;
    drawTextureCell(
      context,
      brush,
      dryHairline ? 3 : 0,
      point.x,
      point.y,
      (dryHairline ? 78 : 98) + fraction * 28,
      dryHairline ? 38 : 50 + fraction * 10,
      tangent,
      dryHairline ? 0.13 : 0.075 + fraction * 0.04,
    );
  }

  for (let index = 0; index < 3; index += 1) {
    const pointIndex = Math.min(points.length - 1, Math.round((points.length - 1) * ((index + 0.72) / 3.8)));
    const previousIndex = Math.max(0, pointIndex - 2);
    const previous = toScreen(points[previousIndex], width, height);
    const point = toScreen(points[pointIndex], width, height);
    drawTextureCell(
      context,
      brush,
      0,
      point.x,
      point.y,
      174 + body.displayMass * 32,
      78 + index * 6,
      Math.atan2(point.y - previous.y, point.x - previous.x),
      0.12,
    );
  }
}

function drawTrajectory(context, theme, points, width, height, brush, body) {
  if (!points?.length) return;

  if (theme.orbitMode === "ink") {
    context.save();
    context.strokeStyle = theme.faint;
    context.lineWidth = 0.65;
    context.setLineDash([7, 5]);
    pathFromTrajectory(context, points, width, height);
    context.stroke();
    context.restore();
    drawInkTrajectory(context, points, width, height, brush, body);
    return;
  }

  if (theme.orbitMode === "emboss") {
    context.save();
    context.strokeStyle = "rgba(255,255,255,0.9)";
    context.lineWidth = 1.55;
    pathFromTrajectory(context, points, width, height, -0.55, -0.85);
    context.stroke();
    context.strokeStyle = theme.muted;
    context.lineWidth = 1.05;
    pathFromTrajectory(context, points, width, height, 0.65, 0.85);
    context.stroke();
    context.restore();
    return;
  }

  context.save();
  context.strokeStyle = theme.muted;
  context.lineWidth = 1.05;
  context.setLineDash(body.id === "europa" ? [3, 3] : []);
  pathFromTrajectory(context, points, width, height);
  context.stroke();
  context.restore();
}

function drawField(context, theme, center, width, height, time) {
  const maxRadius = Math.min(width, height) * 0.18;
  for (let index = 1; index <= 12; index += 1) {
    const wobble = Math.sin(time * 0.24 + index * 0.74) * 1.4;
    const radius = (index / 12) * maxRadius + wobble;
    context.save();
    context.strokeStyle = theme.orbitMode === "emboss" ? "rgba(78,78,72,0.09)" : theme.faint;
    context.lineWidth = 0.72;
    context.beginPath();
    context.ellipse(center.x, center.y, radius * 1.16, radius * 0.62, 0, 0, TAU);
    context.stroke();
    context.restore();
  }
}

function drawObserver(context, theme, width, height, pulses) {
  const x = width / 2;
  context.save();
  context.strokeStyle = theme.observer;
  context.lineWidth = 0.85;
  context.beginPath();
  context.moveTo(x, 0);
  context.lineTo(x, height);
  context.stroke();

  for (let y = height * 0.08; y < height; y += height * 0.18) {
    context.fillStyle = theme.ink;
    context.beginPath();
    context.arc(x, y, 1.8, 0, TAU);
    context.fill();
  }

  for (const pulse of pulses) {
    const radius = 8 + pulse.life * 48;
    context.globalAlpha = Math.max(0, 0.68 * (1 - pulse.life));
    context.strokeStyle = pulse.color;
    context.lineWidth = 1.1;
    context.beginPath();
    context.arc(pulse.x, pulse.y, radius, 0, TAU);
    context.stroke();
    context.beginPath();
    context.arc(pulse.x, pulse.y, radius * 0.58, 0, TAU);
    context.stroke();
  }
  context.restore();
}

function drawClockRing(context, theme, position, body, selected) {
  const size = 24 + body.displayMass * 12;
  const shift = clamp((body.doppler - 1) / 0.06, -1, 1);
  const spectralColor = shift >= 0 ? theme.cyan : theme.coral;
  context.save();
  context.translate(position.x, position.y);
  context.rotate(body.properTime * 0.14);
  context.strokeStyle = theme.muted;
  context.lineWidth = 0.8;
  context.setLineDash([3, 5]);
  context.beginPath();
  context.arc(0, 0, size, -Math.PI * 0.8, Math.PI * 0.7);
  context.stroke();
  context.setLineDash([]);
  context.globalAlpha = 0.24 + Math.abs(shift) * 0.55;
  context.strokeStyle = spectralColor;
  context.lineWidth = 1.35;
  context.beginPath();
  context.arc(0, 0, size + 2, -Math.PI * 0.18, Math.PI * (0.08 + Math.abs(shift) * 0.42));
  context.stroke();
  if (selected) {
    context.globalAlpha = 0.9;
    context.strokeStyle = theme.cyan;
    context.lineWidth = 1.2;
    context.beginPath();
    context.arc(0, 0, size + 7, -Math.PI * 0.12, Math.PI * 0.15);
    context.stroke();
    context.beginPath();
    context.arc(0, 0, size + 7, Math.PI * 0.88, Math.PI * 1.15);
    context.stroke();
  }
  context.restore();
}

function drawAttractionThreads(context, theme, planets, width, height) {
  for (let firstIndex = 0; firstIndex < planets.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < planets.length; secondIndex += 1) {
      const first = planets[firstIndex];
      const second = planets[secondIndex];
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      const intensity = clamp((0.48 - distance) / 0.28, 0, 1);
      if (intensity <= 0) continue;
      const firstPoint = toScreen(first, width, height);
      const secondPoint = toScreen(second, width, height);
      context.save();
      context.globalAlpha = intensity * 0.24;
      context.strokeStyle = theme.cyan;
      context.lineWidth = 0.7;
      context.setLineDash([2, 6]);
      context.beginPath();
      context.moveTo(firstPoint.x, firstPoint.y);
      context.lineTo(secondPoint.x, secondPoint.y);
      context.stroke();
      context.restore();
    }
  }
}

function drawResonance(context, theme, resonance, planets, width, height) {
  if (!resonance) return;
  const first = planets.find((body) => body.id === resonance.bodyIds[0]);
  const second = planets.find((body) => body.id === resonance.bodyIds[1]);
  if (!first || !second) return;
  const start = toScreen(first, width, height);
  const end = toScreen(second, width, height);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const normalX = -dy / length;
  const normalY = dx / length;

  context.save();
  context.globalAlpha = 0.16 + resonance.strength * 0.34;
  context.strokeStyle = theme.cyan;
  context.lineWidth = 0.9;
  context.beginPath();
  for (let index = 0; index <= 32; index += 1) {
    const progress = index / 32;
    const standingWave = Math.sin(progress * Math.PI * resonance.numerator * 2) * 4 * resonance.strength;
    const x = start.x + dx * progress + normalX * standingWave;
    const y = start.y + dy * progress + normalY * standingWave;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.stroke();
  context.fillStyle = theme.ink;
  context.globalAlpha = 0.82;
  context.font = `${width < 600 ? 17 : 22}px "Iowan Old Style", Baskerville, serif`;
  context.fillText(resonance.label, start.x + dx * 0.5 + 18, start.y + dy * 0.5 - 15);
  context.restore();
}

function applyPlaybackEvent(engine, event) {
  if (event.kind === "set-body-state") {
    engine.applyEvent(event);
    return;
  }

  if (Number.isFinite(event.semiMajor)) {
    const star = engine.getBody("star");
    const body = engine.getBody(event.bodyId);
    if (!star || !body) return;
    const angle = Number.isFinite(event.phase) ? event.phase : Math.atan2(body.y - star.y, body.x - star.x);
    const expectedPeriod = TAU * Math.sqrt((event.semiMajor ** 3) / (GRAVITATIONAL_CONSTANT * (star.mass + body.mass)));
    const velocityScale = Number.isFinite(event.period) ? clamp(expectedPeriod / event.period, 0.72, 1.22) : 1;
    engine.setOrbitFromGesture(event.bodyId, {
      x: star.x + Math.cos(angle) * event.semiMajor,
      y: star.y + Math.sin(angle) * event.semiMajor,
      velocityScale,
    });
  }
}

export function OrbitalStage({
  bodies,
  duration,
  initialState,
  isPlaying,
  isListener,
  playbackEvents,
  resetToken,
  theme,
  onBodyAudition,
  onBodyGesture,
  onBodySelect,
  onElapsed,
  onHaptic,
  onNote,
  onPhysicsFrame,
  selectedBodyId,
}) {
  const canvasRef = useRef(null);
  const spriteRef = useRef(null);
  const brushRef = useRef(null);
  const engineRef = useRef(null);
  const initialStateRef = useRef(null);
  const trajectoriesRef = useRef(new Map());
  const accumulatorRef = useRef(0);
  const previousFrameRef = useRef(performance.now());
  const previousSideRef = useRef(new Map());
  const previousRadialVelocityRef = useRef(new Map());
  const pulsesRef = useRef([]);
  const appliedEventIndexRef = useRef(0);
  const dragRef = useRef(null);
  const latestGestureRef = useRef(null);
  const lastGestureEmitRef = useRef(0);
  const physicalBodiesSignature = useMemo(() => JSON.stringify(
    bodies.map(({ voice: _voice, ...body }) => body),
  ), [bodies]);

  if (!engineRef.current) {
    initialStateRef.current = initialState ? structuredClone(initialState) : createInitialPhysicsState(bodies);
    engineRef.current = new PhysicsEngine(initialStateRef.current);
    trajectoriesRef.current = predictTrajectories(initialStateRef.current);
  }

  useEffect(() => {
    const sprite = new Image();
    sprite.src = theme.sprites;
    spriteRef.current = sprite;
  }, [theme.sprites]);

  useEffect(() => {
    if (!theme.brush) {
      brushRef.current = null;
      return;
    }
    const brush = new Image();
    brush.src = theme.brush;
    brushRef.current = brush;
  }, [theme.brush]);

  useEffect(() => {
    initialStateRef.current = initialState ? structuredClone(initialState) : createInitialPhysicsState(bodies);
    engineRef.current.reset(initialStateRef.current);
    trajectoriesRef.current = predictTrajectories(initialStateRef.current);
    accumulatorRef.current = 0;
    appliedEventIndexRef.current = 0;
    previousSideRef.current = new Map(
      engineRef.current.state.bodies
        .filter((body) => body.kind === "planet")
        .map((body) => [body.id, Math.sign(body.x)]),
    );
    previousRadialVelocityRef.current.clear();
    pulsesRef.current = [];
    onElapsed(0);
  }, [initialState, onElapsed, physicalBodiesSignature, resetToken]);

  useEffect(() => {
    for (const compositionBody of bodies) {
      const physicalBody = engineRef.current.getBody(compositionBody.id);
      if (physicalBody) physicalBody.voice = compositionBody.voice;
    }
  }, [bodies]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    let frameId;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const resetLoop = () => {
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
      if (isListener) {
        while (
          appliedEventIndexRef.current < playbackEvents.length &&
          playbackEvents[appliedEventIndexRef.current].at <= engine.state.time + FIXED_STEP / 2
        ) {
          applyPlaybackEvent(engine, playbackEvents[appliedEventIndexRef.current]);
          appliedEventIndexRef.current += 1;
        }
      }

      engine.step();
      const star = engine.getBody("star");
      for (const body of engine.state.bodies) {
        if (body.kind !== "planet") continue;
        const side = Math.sign(body.x);
        const previousSide = previousSideRef.current.get(body.id);
        if (previousSide && side && previousSide !== side && !dragRef.current) {
          const position = toScreen(body, canvas.clientWidth, canvas.clientHeight);
          const color = body.doppler >= 1 ? theme.cyan : theme.coral;
          pulsesRef.current.push({ x: canvas.clientWidth / 2, y: position.y, life: 0, color });
          onNote({
            ...body,
            mass: body.displayMass,
            velocityX: body.vx - (star?.vx ?? 0),
          });
        }
        if (side) previousSideRef.current.set(body.id, side);

        if (star) {
          const dx = body.x - star.x;
          const dy = body.y - star.y;
          const radialVelocity = (dx * (body.vx - star.vx) + dy * (body.vy - star.vy)) / Math.max(0.001, Math.hypot(dx, dy));
          const previous = previousRadialVelocityRef.current.get(body.id);
          if (previous < 0 && radialVelocity >= 0) onHaptic({ kind: "pericenter", strength: body.displayMass });
          previousRadialVelocityRef.current.set(body.id, radialVelocity);
        }
      }
    };

    const render = (now) => {
      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      const delta = Math.min(MAX_FRAME_DELTA, Math.max(0, (now - previousFrameRef.current) / 1000));
      previousFrameRef.current = now;

      if (isPlaying) {
        accumulatorRef.current += delta;
        while (accumulatorRef.current >= FIXED_STEP) {
          stepPhysics();
          accumulatorRef.current -= FIXED_STEP;
          if (engineRef.current.state.time >= duration) resetLoop();
        }
        onElapsed(engineRef.current.state.time);
      }

      const snapshot = engineRef.current.snapshot();
      const star = snapshot.bodies.find((body) => body.kind === "star");
      const planets = snapshot.bodies.filter((body) => body.kind === "planet");
      const resonance = engineRef.current.getResonance();
      onPhysicsFrame({ time: snapshot.time, bodies: planets, star, resonance });

      context.clearRect(0, 0, width, height);
      const starPosition = toScreen(star, width, height);
      drawField(context, theme, starPosition, width, height, snapshot.time);
      for (const body of planets) {
        drawTrajectory(context, theme, trajectoriesRef.current.get(body.id), width, height, brushRef.current, body);
      }
      drawAttractionThreads(context, theme, planets, width, height);
      drawResonance(context, theme, resonance, planets, width, height);

      pulsesRef.current = pulsesRef.current
        .map((pulse) => ({ ...pulse, life: pulse.life + delta * 0.72 }))
        .filter((pulse) => pulse.life < 1);
      drawObserver(context, theme, width, height, pulsesRef.current);

      const starSize = clamp(Math.min(width, height) * 0.075, 50, 86);
      drawSprite(context, spriteRef.current, 0, starPosition.x, starPosition.y, starSize, 0.98);

      for (const body of planets) {
        const position = toScreen(body, width, height);
        drawClockRing(context, theme, position, body, body.id === selectedBodyId);
        const bodySize = clamp(Math.min(width, height) * (0.039 + body.displayMass * 0.01), 34, 58);
        drawSprite(context, spriteRef.current, body.sprite, position.x, position.y, bodySize, 0.98);
      }

      frameId = requestAnimationFrame(render);
    };

    frameId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [duration, isListener, isPlaying, onElapsed, onHaptic, onNote, onPhysicsFrame, playbackEvents, selectedBodyId, theme]);

  const pointerPosition = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top, width: rect.width, height: rect.height };
  };

  const handlePointerDown = (event) => {
    const pointer = pointerPosition(event);
    const target = engineRef.current.state.bodies
      .filter((body) => body.kind === "planet")
      .map((body) => {
        const position = toScreen(body, pointer.width, pointer.height);
        return { body, position, distance: Math.hypot(pointer.x - position.x, pointer.y - position.y) };
      })
      .sort((first, second) => first.distance - second.distance)[0];

    if (!target || target.distance > 58) return;
    onBodySelect(target.body.id);
    onBodyAudition(target.body.id);
    if (isListener) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id: target.body.id, startX: pointer.x, startY: pointer.y };
    latestGestureRef.current = null;
    event.currentTarget.classList.add("is-dragging");
  };

  const handlePointerMove = (event) => {
    if (!dragRef.current || isListener) return;
    const pointer = pointerPosition(event);
    const engine = engineRef.current;
    const star = engine.getBody("star");
    const body = engine.getBody(dragRef.current.id);
    if (!star || !body) return;
    const world = toWorld(pointer.x, pointer.y, pointer.width, pointer.height);
    const bodyPosition = toScreen(body, pointer.width, pointer.height);
    const starPosition = toScreen(star, pointer.width, pointer.height);
    const radiusX = bodyPosition.x - starPosition.x;
    const radiusY = bodyPosition.y - starPosition.y;
    const radiusLength = Math.max(1, Math.hypot(radiusX, radiusY));
    const tangentX = -radiusY / radiusLength;
    const tangentY = radiusX / radiusLength;
    const travelX = pointer.x - dragRef.current.startX;
    const travelY = pointer.y - dragRef.current.startY;
    const tangentialTravel = travelX * tangentX + travelY * tangentY;
    const eventRecord = engine.setOrbitFromGesture(body.id, {
      x: world.x,
      y: world.y,
      velocityScale: 1 + tangentialTravel / 420,
    });
    latestGestureRef.current = eventRecord;

    const now = performance.now();
    if (now - lastGestureEmitRef.current > 55) {
      lastGestureEmitRef.current = now;
      onBodyGesture(eventRecord);
      latestGestureRef.current = null;
    }
  };

  const handlePointerUp = (event) => {
    if (latestGestureRef.current) onBodyGesture(latestGestureRef.current);
    latestGestureRef.current = null;
    dragRef.current = null;
    trajectoriesRef.current = predictTrajectories(engineRef.current.snapshot());
    event.currentTarget.classList.remove("is-dragging");
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <canvas
      ref={canvasRef}
      className="orbital-canvas"
      aria-label="Interactive N-body musical instrument. Touch a world to hear it; drag it to change orbit and music."
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    />
  );
}
