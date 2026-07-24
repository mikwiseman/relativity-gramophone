import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pause,
  Play,
  ShareNetwork,
  Trash,
} from "@phosphor-icons/react";

import { InscriptionDialog } from "./components/InscriptionDialog.jsx";
import { SoundflightStage } from "./components/SoundflightStage.jsx";
import { AudioEngine } from "./lib/audioEngine.js";
import {
  createBlankComposition,
  createReplyComposition,
  createShareUrl,
  getPresentationTheme,
  MAX_SCORE_EVENTS,
  readCompositionFromHash,
  resolveScoreRoster,
} from "./lib/composition.js";
import { THEMES } from "./lib/themes.js";
import { copyOrbitLink, shareOrbit } from "./lib/sharing.js";
import { COSMIC_VOICES, hapticPattern, voiceParameters } from "./lib/sonification.js";
import {
  frequencyToNoteName,
  INITIAL_PLAYBACK,
  instrumentHint,
  shouldApplyGestationUpdate,
  voiceVisual,
} from "./lib/soundflight.js";

function readInitialScore() {
  try {
    return { score: readCompositionFromHash(), error: null };
  } catch (error) {
    return { score: null, error: error instanceof Error ? error.message : "Invalid score" };
  }
}

function bodyLabel(body) {
  if (!body) return "";
  const number = body.id.match(/\d+$/u)?.[0] ?? "";
  return `${body.kind === "moon" ? "MOON" : "PLANET"}${number ? ` ${number}` : ""}`;
}

export function App() {
  const initial = useMemo(readInitialScore, []);
  const [composition, setComposition] = useState(initial.score ?? createBlankComposition);
  const [isListener, setIsListener] = useState(Boolean(initial.score));
  const [isPlaying, setIsPlaying] = useState(INITIAL_PLAYBACK);
  const [elapsed, setElapsed] = useState(0);
  const [resetToken, setResetToken] = useState(0);
  const [inscribed, setInscribed] = useState(initial.score);
  const [dialogOpen, setDialogOpen] = useState(Boolean(initial.score));
  const [dialogStatus, setDialogStatus] = useState("");
  const [runtimeError, setRuntimeError] = useState(initial.error);
  const [selectedBodyId, setSelectedBodyId] = useState(null);
  const [physicsFrame, setPhysicsFrame] = useState(null);
  const [sonicCue, setSonicCue] = useState("");
  const [removeCommand, setRemoveCommand] = useState({ id: 0, bodyId: null });
  const [cameraCommand, setCameraCommand] = useState({ id: 0, type: "reset" });
  const [cameraScale, setCameraScale] = useState("1.2 AU");

  const audioRef = useRef(new AudioEngine());
  if (import.meta.env.DEV && typeof window !== "undefined") window.__rgAudio = audioRef.current;
  const physicsFrameRef = useRef(null);
  const lastPhysicsPaintRef = useRef(0);
  const eventCountRef = useRef(composition.events.length);
  const sonicCueTimeoutRef = useRef(null);
  const protectCueUntilRef = useRef(0);
  const gestationEngagedRef = useRef(false);
  const gestationReadyRef = useRef(false);
  const gestationResumeRef = useRef(null);
  const gestationRequestRef = useRef(0);

  const themeId = getPresentationTheme(composition, null);
  const theme = THEMES.lacquer;
  const shareScore = inscribed ?? composition;
  const shareLink = useMemo(() => createShareUrl(shareScore), [shareScore]);
  const recordedBodies = useMemo(() => resolveScoreRoster(shareScore), [shareScore]);
  const liveBodies = physicsFrame?.bodies ?? [];
  const planets = liveBodies.filter((body) => body.kind === "planet");
  const selectedBody = liveBodies.find((body) => body.id === selectedBodyId) ?? null;
  const selectedMoonCount = selectedBody?.kind === "planet"
    ? liveBodies.filter((body) => body.kind === "moon" && body.parentId === selectedBody.id).length
    : 0;
  const selectedVoice = selectedBody ? voiceVisual(selectedBody.voice) : null;
  const guidance = instrumentHint({
    planetCount: planets.length,
    selectedBody,
    selectedMoonCount,
    isListener,
  });
  const guidanceDetail = planets.length === 0 && !isListener
    ? "HOLD THE STAR · PULL OUTWARD · RELEASE"
    : selectedBody?.kind === "planet" && selectedMoonCount < 2 && !isListener
      ? selectedMoonCount === 1
        ? "DRAG AGAIN TO ADD ONE MORE MOON"
        : "THE THIN RING MARKS A STABLE MOON ORBIT"
      : "TAP A PLANET TO HEAR IT · SWIPE ACROSS ITS ORBIT";

  useEffect(() => {
    document.documentElement.style.colorScheme = "dark";
  }, []);

  useEffect(() => () => window.clearTimeout(sonicCueTimeoutRef.current), []);

  useEffect(() => {
    if (!runtimeError) return undefined;
    const timer = window.setTimeout(() => setRuntimeError(null), 6500);
    return () => window.clearTimeout(timer);
  }, [runtimeError]);

  const announceSonicCue = useCallback((message, holdMs = 1800) => {
    window.clearTimeout(sonicCueTimeoutRef.current);
    setSonicCue(message);
    sonicCueTimeoutRef.current = window.setTimeout(() => setSonicCue(""), holdMs);
  }, []);

  const performHaptic = useCallback((event) => {
    if (!navigator.vibrate || !window.matchMedia("(pointer: coarse)").matches) return;
    const pattern = hapticPattern(event);
    if (pattern.length) navigator.vibrate(pattern);
  }, []);

  const handleElapsed = useCallback((next) => {
    setElapsed((current) => (Math.floor(current * 10) === Math.floor(next * 10) ? current : next));
  }, []);

  const handlePhysicsFrame = useCallback((frame) => {
    physicsFrameRef.current = frame;
    audioRef.current.updateField(frame);
    const now = performance.now();
    if (now - lastPhysicsPaintRef.current < 90) return;
    lastPhysicsPaintRef.current = now;
    setPhysicsFrame(frame);
  }, []);

  const handleTogglePlayback = useCallback(async () => {
    if (isPlaying) {
      setIsPlaying(false);
      await audioRef.current.suspend();
      return;
    }
    try {
      await audioRef.current.resume();
      setRuntimeError(null);
      setIsPlaying(true);
      setDialogOpen(false);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : "Audio could not start");
    }
  }, [isPlaying]);

  const closeDialog = useCallback(async () => {
    setDialogOpen(false);
    if (!isPlaying) return;
    try {
      await audioRef.current.resume(true);
      setRuntimeError(null);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : "Audio could not start");
    }
  }, [isPlaying]);

  const handleNote = useCallback((note) => {
    audioRef.current.playOrbitNote(note);
    performHaptic({ kind: "crossing", strength: note.displayMass ?? note.mass });
    if (performance.now() < protectCueUntilRef.current) return;
    const visual = voiceVisual(note.voice);
    announceSonicCue(`${visual.colorName} · ${frequencyToNoteName(voiceParameters(note).frequency)}`);
  }, [announceSonicCue, performHaptic]);

  const handleBodyAudition = useCallback(async (bodyId) => {
    setSelectedBodyId(bodyId);
    const body = physicsFrameRef.current?.bodies.find((candidate) => candidate.id === bodyId);
    if (!body) return;
    try {
      await audioRef.current.resume(true);
      setRuntimeError(null);
      setIsPlaying(true);
      setDialogOpen(false);
      audioRef.current.playOrbitNote(body);
      const visual = voiceVisual(body.voice);
      announceSonicCue(`${bodyLabel(body)} · ${visual.colorName} ${visual.label}`);
      performHaptic({ kind: "audition", strength: body.displayMass ?? 0.5 });
    } catch (error) {
      setIsPlaying(false);
      setRuntimeError(error instanceof Error ? error.message : "Planetary voice could not start");
    }
  }, [announceSonicCue, performHaptic]);

  const handleBirthBloom = useCallback(async (body) => {
    try {
      await audioRef.current.resume(true);
      setRuntimeError(null);
      setIsPlaying(true);
      setDialogOpen(false);
      audioRef.current.playBirthBloom(body);
      performHaptic({ kind: "birth", strength: body.displayMass ?? body.mass ?? 0.5 });
      protectCueUntilRef.current = performance.now() + 2400;
      announceSonicCue(`${bodyLabel(body)} JOINS THE MUSIC`, 2400);
    } catch (error) {
      setIsPlaying(false);
      setRuntimeError(error instanceof Error ? error.message : "The newborn voice could not start");
    }
  }, [announceSonicCue, performHaptic]);

  const handleMoonBloom = useCallback(async (moon, parent) => {
    try {
      await audioRef.current.resume(true);
      setRuntimeError(null);
      setIsPlaying(true);
      setDialogOpen(false);
      audioRef.current.playMoonBloom(moon, parent);
      performHaptic({ kind: "birth", strength: moon.displayMass ?? moon.mass ?? 0.2 });
      protectCueUntilRef.current = performance.now() + 2600;
      announceSonicCue(`${bodyLabel(moon)} HARMONIZES WITH ${bodyLabel(parent)}`, 2600);
    } catch (error) {
      setIsPlaying(false);
      setRuntimeError(error instanceof Error ? error.message : "The moon overtone could not start");
    }
  }, [announceSonicCue, performHaptic]);

  const handleConsumptionBloom = useCallback((body) => {
    audioRef.current.playConsumption(body);
    performHaptic({ kind: "consumption", strength: body.displayMass ?? body.mass ?? 0.5 });
    announceSonicCue(`${bodyLabel(body)} FADES INTO LIGHT`);
  }, [announceSonicCue, performHaptic]);

  const handlePluckBloom = useCallback(async (body, pluck) => {
    try {
      await audioRef.current.resume(isPlaying);
      setRuntimeError(null);
      audioRef.current.playPluck(body, pluck);
      performHaptic({ kind: "pluck", strength: pluck.strength });
      announceSonicCue(`${bodyLabel(body)} ORBIT`);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : "The orbit could not sound");
    }
  }, [announceSonicCue, isPlaying, performHaptic]);

  const handleGestationTone = useCallback(async (candidate) => {
    const requestId = gestationRequestRef.current + 1;
    gestationRequestRef.current = requestId;
    if (!candidate) {
      gestationEngagedRef.current = false;
      gestationReadyRef.current = false;
      gestationResumeRef.current = null;
      audioRef.current.endGestation();
      return;
    }
    try {
      if (!gestationEngagedRef.current) {
        gestationEngagedRef.current = true;
        gestationReadyRef.current = false;
      }
      if (!gestationReadyRef.current) {
        if (!gestationResumeRef.current) gestationResumeRef.current = audioRef.current.resume(true);
        await gestationResumeRef.current;
        if (!shouldApplyGestationUpdate({
          requestId,
          currentRequestId: gestationRequestRef.current,
          engaged: gestationEngagedRef.current,
        })) return;
        gestationReadyRef.current = true;
        gestationResumeRef.current = null;
        setIsPlaying(true);
      }
      if (!shouldApplyGestationUpdate({
        requestId,
        currentRequestId: gestationRequestRef.current,
        engaged: gestationEngagedRef.current,
      })) return;
      audioRef.current.updateGestation({
        frequency: candidate.frequency,
        pan: candidate.pan,
        voice: candidate.voice,
        kind: candidate.kind ?? "planet",
      });
    } catch (error) {
      if (requestId !== gestationRequestRef.current) return;
      gestationEngagedRef.current = false;
      gestationReadyRef.current = false;
      gestationResumeRef.current = null;
      setIsPlaying(false);
      audioRef.current.endGestation();
      setRuntimeError(error instanceof Error ? error.message : "The forming voice could not start");
    }
  }, []);

  const handleBodyGesture = useCallback((event) => {
    if (isListener) return;
    if (eventCountRef.current >= MAX_SCORE_EVENTS) {
      setRuntimeError("This performance is full — share it, then begin a new one");
      return;
    }
    if (event.at > 3600) {
      setRuntimeError("This performance has reached one hour");
      return;
    }
    eventCountRef.current += 1;
    setInscribed(null);
    setComposition((current) => ({ ...current, events: [...current.events, event] }));
  }, [isListener]);

  const handleInscribe = useCallback(async () => {
    setIsPlaying(false);
    await audioRef.current.suspend();
    const next = {
      ...composition,
      createdAt: new Date().toISOString(),
      duration: Math.max(12, Math.min(64, Math.ceil(elapsed + 1))),
      preferredTheme: themeId,
    };
    setComposition(next);
    setInscribed(next);
    setDialogStatus("");
    setDialogOpen(true);
  }, [composition, elapsed, themeId]);

  const updateMessage = useCallback((message) => {
    setComposition((current) => ({ ...current, message }));
    setInscribed((current) => ({ ...(current ?? composition), message }));
  }, [composition]);

  const copyLink = useCallback(async () => {
    const result = await copyOrbitLink(shareLink);
    setDialogStatus(result.kind === "copied" ? "LINK COPIED" : "SELECT THE LINK, THEN COPY IT");
  }, [shareLink]);

  const share = useCallback(async () => {
    const voices = recordedBodies
      .map((body) => COSMIC_VOICES[body.voice]?.label)
      .filter(Boolean)
      .join(" · ");
    const result = await shareOrbit({
      title: "Relativity Gramophone",
      text: [shareScore.message, voices && `A planetary composition: ${voices}.`].filter(Boolean).join("\n"),
      url: shareLink,
    });
    if (result.kind === "cancelled") {
      setDialogStatus("");
      return;
    }
    setDialogStatus(result.kind === "shared"
      ? "ORBIT SHARED"
      : result.kind === "copied"
        ? "LINK COPIED — READY TO PASTE"
        : "SELECT THE LINK, THEN COPY IT");
  }, [recordedBodies, shareLink, shareScore]);

  const enterOrbit = useCallback(async () => {
    try {
      setIsPlaying(false);
      await audioRef.current.suspend();
      const next = createReplyComposition(composition, physicsFrameRef.current, themeId);
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      setComposition(next);
      eventCountRef.current = 0;
      setInscribed(null);
      setIsListener(false);
      setDialogOpen(false);
      setElapsed(0);
      setSelectedBodyId(null);
      setRuntimeError(null);
      setCameraCommand((current) => ({ id: current.id + 1, type: "reset" }));
      setResetToken((current) => current + 1);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : "A new orbit could not begin");
      setDialogOpen(false);
    }
  }, [composition, themeId]);

  const deleteSelected = useCallback(() => {
    if (!selectedBodyId || isListener) return;
    setRemoveCommand((current) => ({ id: current.id + 1, bodyId: selectedBodyId }));
  }, [isListener, selectedBodyId]);

  return (
    <main
      className="app-shell simple-instrument"
      data-theme="lacquer"
      data-live-body-count={liveBodies.length}
      data-live-moon-count={liveBodies.filter((body) => body.kind === "moon").length}
      data-playing={isPlaying}
      data-camera-scale={cameraScale}
      style={{
        "--paper": theme.paper,
        "--ink": theme.ink,
        "--muted": theme.muted,
        "--faint": theme.faint,
        "--coral": theme.coral,
        "--cyan": theme.cyan,
      }}
    >
      <SoundflightStage
        bodies={composition.bodies}
        cameraCommand={cameraCommand}
        duration={composition.duration}
        initialState={composition.initialState}
        interactionMode="compose"
        isPlaying={isPlaying}
        isListener={isListener}
        playbackEvents={composition.events}
        removeCommand={removeCommand}
        resetToken={resetToken}
        selectedBodyId={selectedBodyId}
        onBirthBloom={handleBirthBloom}
        onBirthRefused={setRuntimeError}
        onBodyAudition={handleBodyAudition}
        onBodyGesture={handleBodyGesture}
        onBodySelect={setSelectedBodyId}
        onCameraNavigate={() => {}}
        onCameraScale={setCameraScale}
        onConsumptionBloom={handleConsumptionBloom}
        onElapsed={handleElapsed}
        onGestationTone={handleGestationTone}
        onHaptic={performHaptic}
        onLaunchComplete={setSelectedBodyId}
        onLaunchPhase={() => {}}
        onMoonBloom={handleMoonBloom}
        onMoonComplete={(_bodyId, parentId) => setSelectedBodyId(parentId)}
        onMoonPhase={() => {}}
        onNote={handleNote}
        onPhysicsFrame={handlePhysicsFrame}
        onPluckBloom={handlePluckBloom}
      />

      <header className="soundflight-title simple-title">
        <h1>RELATIVITY<br />GRAMOPHONE</h1>
        <p>DRAW ORBITS · HEAR GRAVITY</p>
      </header>

      {!dialogOpen && (
        <>
          <section className="instrument-guidance" aria-live="polite">
            <strong>{guidance}</strong>
            <span>{guidanceDetail}</span>
          </section>

          {selectedBody && !isListener && (
            <aside
              className="instrument-selection"
              style={{ "--selected-voice": `#${selectedVoice.color.toString(16).padStart(6, "0")}` }}
              aria-label={`Selected ${bodyLabel(selectedBody)}`}
            >
              <i aria-hidden="true" />
              <span>
                <small>SELECTED</small>
                <strong>{bodyLabel(selectedBody)}</strong>
              </span>
              <button type="button" onClick={deleteSelected} aria-label={`Delete ${bodyLabel(selectedBody)}`}>
                <Trash aria-hidden="true" weight="thin" />
                <span>DELETE</span>
              </button>
            </aside>
          )}

          <nav className="instrument-controls" aria-label="Music controls">
            <button
              type="button"
              className="instrument-play"
              aria-label={isPlaying ? "Pause music" : "Play music"}
              aria-pressed={isPlaying}
              onClick={handleTogglePlayback}
            >
              {isPlaying
                ? <Pause aria-hidden="true" weight="fill" />
                : <Play aria-hidden="true" weight="fill" />}
              <span>{isPlaying ? "PAUSE" : "PLAY"}</span>
            </button>
            <button
              type="button"
              className="instrument-share"
              onClick={isListener ? () => setDialogOpen(true) : handleInscribe}
              disabled={!isListener && liveBodies.length === 0}
            >
              <ShareNetwork aria-hidden="true" weight="thin" />
              <span>SHARE</span>
            </button>
          </nav>

          <div className="soundflight-voice-breath simple-voice-breath" aria-live="polite">
            <span>{sonicCue || (isPlaying ? `${liveBodies.length} VOICES · LIVE` : "PINCH OR SCROLL TO ZOOM")}</span>
          </div>
        </>
      )}

      {runtimeError && (
        <div className="runtime-message" role="alert">
          {runtimeError}
          <button type="button" onClick={() => setRuntimeError(null)}>DISMISS</button>
        </div>
      )}

      <InscriptionDialog
        bodies={isListener ? recordedBodies : liveBodies.length ? liveBodies : recordedBodies}
        duration={shareScore.duration}
        link={shareLink}
        message={inscribed?.message ?? composition.message}
        mode={isListener ? "listener" : "composer"}
        open={dialogOpen}
        resonances={shareScore.resonances}
        onClose={closeDialog}
        onCopy={copyLink}
        onEnterOrbit={enterOrbit}
        onMessageChange={updateMessage}
        onShare={share}
        status={dialogStatus}
      />
    </main>
  );
}
