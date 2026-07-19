import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { InscriptionDialog } from "./components/InscriptionDialog.jsx";
import { CosmicSoundAtlas } from "./components/CosmicSoundAtlas.jsx";
import { OrbitalStage } from "./components/OrbitalStage.jsx";
import { RelativityLens } from "./components/RelativityLens.jsx";
import { ThemeChooser } from "./components/ThemeChooser.jsx";
import { Transport } from "./components/Transport.jsx";
import { AudioEngine } from "./lib/audioEngine.js";
import {
  createDefaultComposition,
  createReplyComposition,
  createShareUrl,
  getPresentationTheme,
  MAX_SCORE_EVENTS,
  readCompositionFromHash,
} from "./lib/composition.js";
import { THEMES } from "./lib/themes.js";
import { captureResonance, measureTargetResonance, RESONANCE_TARGETS } from "./lib/gameProgress.js";
import { COSMIC_VOICES, hapticPattern, isResonanceChallengeComplete } from "./lib/sonification.js";

function formatTime(value) {
  const seconds = Math.max(0, Math.floor(value));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function readInitialScore() {
  try {
    return { score: readCompositionFromHash(), error: null };
  } catch (error) {
    return { score: null, error: error instanceof Error ? error.message : "Invalid score" };
  }
}

export function App() {
  const initial = useMemo(readInitialScore, []);
  const [composition, setComposition] = useState(initial.score ?? createDefaultComposition);
  const [isListener, setIsListener] = useState(Boolean(initial.score));
  const [localTheme, setLocalTheme] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [resetToken, setResetToken] = useState(0);
  const [inscribed, setInscribed] = useState(initial.score);
  const [dialogOpen, setDialogOpen] = useState(Boolean(initial.score));
  const [dialogStatus, setDialogStatus] = useState("");
  const [runtimeError, setRuntimeError] = useState(initial.error);
  const [lensOpen, setLensOpen] = useState(false);
  const [atlasOpen, setAtlasOpen] = useState(false);
  const [selectedBodyId, setSelectedBodyId] = useState("io");
  const [challengeTarget, setChallengeTarget] = useState(null);
  const [challengeStatus, setChallengeStatus] = useState("CHOOSE A RATIO");
  const [challengeGuide, setChallengeGuide] = useState(null);
  const [physicsFrame, setPhysicsFrame] = useState(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const audioRef = useRef(new AudioEngine());
  const physicsFrameRef = useRef(null);
  const lastPhysicsPaintRef = useRef(0);
  const eventCountRef = useRef(composition.events.length);
  const challengeTargetRef = useRef(null);
  const challengeNeedsGestureRef = useRef(true);
  const challengeLockStartedRef = useRef(null);
  const challengeCompletedRef = useRef(false);
  const resonanceSealsRef = useRef(composition.resonances);

  const themeId = getPresentationTheme(composition, localTheme);
  const theme = THEMES[themeId];
  const shareScore = inscribed ?? composition;
  const shareLink = useMemo(() => createShareUrl(shareScore), [shareScore]);

  useEffect(() => {
    document.documentElement.style.colorScheme = themeId === "lacquer" ? "dark" : "light";
  }, [themeId]);

  const handleElapsed = useCallback((next) => {
    setElapsed((current) => (Math.floor(current * 10) === Math.floor(next * 10) ? current : next));
  }, []);

  const performHaptic = useCallback((event) => {
    if (!navigator.vibrate || !window.matchMedia("(pointer: coarse)").matches) return;
    const pattern = hapticPattern(event);
    if (pattern.length) navigator.vibrate(pattern);
  }, []);

  const handleNote = useCallback((note) => {
    audioRef.current.playOrbitNote(note);
    performHaptic({ kind: "crossing", strength: note.displayMass ?? note.mass });
  }, [performHaptic]);

  const handlePhysicsFrame = useCallback((frame) => {
    physicsFrameRef.current = frame;
    const target = challengeTargetRef.current;
    const guide = target ? measureTargetResonance(frame.bodies, target) : null;
    audioRef.current.updateField({ ...frame, challengeProximity: guide?.proximity ?? 0 });
    if (target && !challengeNeedsGestureRef.current && !challengeCompletedRef.current) {
      const lockIsStrong = isResonanceChallengeComplete({ label: target, strength: guide.lockStrength }, target);
      if (lockIsStrong && challengeLockStartedRef.current === null) challengeLockStartedRef.current = performance.now();
      if (!lockIsStrong) challengeLockStartedRef.current = null;

      if (lockIsStrong && performance.now() - challengeLockStartedRef.current >= 720) {
        challengeCompletedRef.current = true;
        const nextSeals = captureResonance(resonanceSealsRef.current, target);
        resonanceSealsRef.current = nextSeals;
        setComposition((current) => ({ ...current, resonances: nextSeals }));
        setInscribed(null);
        setChallengeStatus(nextSeals.length === RESONANCE_TARGETS.length
          ? "CONSTELLATION COMPLETE · 3/3"
          : `SEALED ${target} · ${nextSeals.length}/3`);
        audioRef.current.playChallengeSuccess();
        performHaptic({ kind: "resonance", strength: guide.lockStrength });
      }
    }
    const now = performance.now();
    if (now - lastPhysicsPaintRef.current < 90) return;
    lastPhysicsPaintRef.current = now;
    setPhysicsFrame(frame);
    setChallengeGuide(guide);
    if (target && !challengeNeedsGestureRef.current && !challengeCompletedRef.current) {
      setChallengeStatus(`${Math.round(guide.proximity * 100)}% · ${guide.direction}`);
    }
  }, [performHaptic]);

  const handleTogglePlayback = useCallback(async () => {
    setHasInteracted(true);
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

  const handleThemeChange = useCallback((nextTheme) => {
    if (isListener) {
      setLocalTheme(nextTheme);
      return;
    }
    setLocalTheme(null);
    setComposition((current) => ({ ...current, preferredTheme: nextTheme }));
  }, [isListener]);

  const handleVoiceSelect = useCallback(async (voiceId) => {
    setHasInteracted(true);
    try {
      await audioRef.current.resume(isPlaying);
      audioRef.current.playVoicePreview(voiceId);
      setRuntimeError(null);
      if (isListener) return;
      setInscribed(null);
      setComposition((current) => ({
        ...current,
        bodies: current.bodies.map((body) => (body.id === selectedBodyId ? { ...body, voice: voiceId } : body)),
      }));
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : "Cosmic voice could not start");
    }
  }, [isListener, isPlaying, selectedBodyId]);

  const handleBodyAudition = useCallback(async (bodyId) => {
    setSelectedBodyId(bodyId);
    setHasInteracted(true);
    const authoredBody = composition.bodies.find((body) => body.id === bodyId);
    const liveBody = physicsFrameRef.current?.bodies.find((body) => body.id === bodyId);
    if (!authoredBody) return;
    setIsPlaying(true);
    setDialogOpen(false);
    try {
      await audioRef.current.resume(true);
      setRuntimeError(null);
      audioRef.current.playOrbitNote({
        x: authoredBody.semiMajor,
        y: 0,
        properRate: 1,
        doppler: 1,
        displayMass: authoredBody.mass,
        ...authoredBody,
        ...liveBody,
        voice: authoredBody.voice,
      });
      performHaptic({ kind: "audition", strength: authoredBody.mass });
    } catch (error) {
      setIsPlaying(false);
      setRuntimeError(error instanceof Error ? error.message : "Planetary voice could not start");
    }
  }, [composition.bodies, performHaptic]);

  const handleChallengeSelect = useCallback(async (target) => {
    if (isListener) {
      setChallengeStatus("ANSWER WITH ORBIT TO PLAY");
      return;
    }
    challengeTargetRef.current = target;
    challengeNeedsGestureRef.current = true;
    challengeLockStartedRef.current = null;
    challengeCompletedRef.current = false;
    setHasInteracted(true);
    setChallengeTarget(target);
    setChallengeGuide(null);
    setChallengeStatus(`${composition.resonances.includes(target) ? "REPLAY" : "DRAG TO SEEK"} ${target}`);
    setAtlasOpen(false);
    try {
      await audioRef.current.resume();
      setRuntimeError(null);
      setIsPlaying(true);
      setDialogOpen(false);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : "Orbit game audio could not start");
    }
  }, [composition.resonances, isListener]);

  const handleBodyGesture = useCallback((event) => {
    if (isListener) return;
    setHasInteracted(true);
    if (challengeTargetRef.current) {
      challengeNeedsGestureRef.current = false;
      challengeCompletedRef.current = false;
      challengeLockStartedRef.current = null;
      setChallengeStatus(`SEEKING ${challengeTargetRef.current}`);
    }
    if (eventCountRef.current >= MAX_SCORE_EVENTS) {
      setRuntimeError("TAU RECORD LIMIT REACHED — INSCRIBE THIS ORBIT BEFORE CONTINUING");
      return;
    }
    eventCountRef.current += 1;
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
    if (!navigator.clipboard?.writeText) {
      setDialogStatus("COPY UNAVAILABLE — SELECT THE LINK MANUALLY");
      return;
    }
    try {
      await navigator.clipboard.writeText(shareLink);
      setDialogStatus("LINK COPIED");
    } catch (error) {
      setDialogStatus(`COPY FAILED — ${error instanceof Error ? error.message.toUpperCase() : "UNKNOWN ERROR"}`);
    }
  }, [shareLink]);

  const share = useCallback(async () => {
    if (!navigator.share) {
      setDialogStatus("SYSTEM SHARE UNAVAILABLE — USE COPY LINK");
      return;
    }
    try {
      const voices = shareScore.bodies.map((body) => COSMIC_VOICES[body.voice].label).join(" · ");
      const resonance = shareScore.resonances.length ? `Resonance seals: ${shareScore.resonances.join(" · ")}.` : "A free orbit.";
      await navigator.share({
        title: "Relativity Gramophone",
        text: [shareScore.message, `Planetary dance: ${voices}. ${resonance}`].filter(Boolean).join("\n"),
        url: shareLink,
      });
      setDialogStatus("ORBIT SHARED");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setDialogStatus(`SHARE FAILED — ${error instanceof Error ? error.message.toUpperCase() : "UNKNOWN ERROR"}`);
    }
  }, [shareLink, shareScore]);

  const restart = useCallback(async () => {
    setIsPlaying(false);
    await audioRef.current.suspend();
    setElapsed(0);
    setResetToken((current) => current + 1);
    setDialogOpen(false);
  }, []);

  const openListenerRecord = useCallback(async () => {
    setIsPlaying(false);
    await audioRef.current.suspend();
    setDialogOpen(true);
  }, []);

  const enterOrbit = useCallback(async () => {
    try {
      setIsPlaying(false);
      await audioRef.current.suspend();
      const next = createReplyComposition(composition, physicsFrame, themeId);
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      setComposition(next);
      eventCountRef.current = 0;
      setInscribed(null);
      setIsListener(false);
      setLocalTheme(null);
      setDialogOpen(false);
      setElapsed(0);
      setRuntimeError(null);
      setSelectedBodyId("io");
      setChallengeTarget(null);
      setChallengeStatus("CHOOSE A RATIO");
      setChallengeGuide(null);
      setHasInteracted(false);
      challengeTargetRef.current = null;
      resonanceSealsRef.current = [];
      challengeNeedsGestureRef.current = true;
      challengeLockStartedRef.current = null;
      challengeCompletedRef.current = false;
      setResetToken((current) => current + 1);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : "Reply orbit could not begin");
      setDialogOpen(false);
    }
  }, [composition, physicsFrame, themeId]);

  return (
    <main
      className="app-shell"
      data-theme={themeId}
      style={{
        "--paper": theme.paper,
        "--ink": theme.ink,
        "--muted": theme.muted,
        "--faint": theme.faint,
        "--coral": theme.coral,
        "--cyan": theme.cyan,
      }}
    >
      <img key={theme.background} className="theme-backdrop" src={theme.background} alt="" aria-hidden="true" />
      <OrbitalStage
        bodies={composition.bodies}
        duration={composition.duration}
        initialState={composition.initialState}
        isPlaying={isPlaying}
        isListener={isListener}
        playbackEvents={composition.events}
        resetToken={resetToken}
        theme={theme}
        onBodyGesture={handleBodyGesture}
        onBodyAudition={handleBodyAudition}
        onBodySelect={setSelectedBodyId}
        onElapsed={handleElapsed}
        onHaptic={performHaptic}
        onNote={handleNote}
        onPhysicsFrame={handlePhysicsFrame}
        selectedBodyId={selectedBodyId}
      />

      <header className="topline">
        <h1>RELATIVITY GRAMOPHONE</h1>
        <div className="time-state" aria-live="off">
          <span className={isPlaying ? "record-light is-live" : "record-light"} aria-hidden="true" />
          <time>{formatTime(elapsed)}</time>
        </div>
      </header>

      {challengeTarget && !atlasOpen && !isListener && !dialogOpen && (
        <button type="button" className="challenge-strip" onClick={() => setAtlasOpen(true)}>
          <span>RESONANCE {challengeTarget} · SEALS {composition.resonances.length}/3</span>
          <strong>{challengeStatus}</strong>
        </button>
      )}

      {!hasInteracted && !dialogOpen && !atlasOpen && !lensOpen && (
        <p className="play-whisper">
          <span>{isListener ? "PLAY THE DANCE" : "TOUCH A WORLD — HEAR ITS VOICE"}</span>
          <strong>{isListener ? "TOUCH ANY WORLD TO SOLO IT" : "DRAG — BEND TIME + ORBIT"}</strong>
        </p>
      )}

      {!dialogOpen && (
        <>
          <div className="bottom-left-controls">
            <Transport isPlaying={isPlaying} isListener={isListener} onToggle={handleTogglePlayback} onRestart={restart} />
            <CosmicSoundAtlas
              bodies={composition.bodies}
              capturedResonances={composition.resonances}
              challengeGuide={challengeGuide}
              challengeStatus={challengeStatus}
              challengeTarget={challengeTarget}
              isListener={isListener}
              onBodySelect={setSelectedBodyId}
              onChallengeSelect={handleChallengeSelect}
              onClose={() => setAtlasOpen(false)}
              onToggle={() => {
                setHasInteracted(true);
                setLensOpen(false);
                setAtlasOpen((current) => !current);
              }}
              onVoiceSelect={handleVoiceSelect}
              open={atlasOpen}
              selectedBodyId={selectedBodyId}
            />
            <ThemeChooser value={themeId} onChange={handleThemeChange} />
            <RelativityLens
              frame={physicsFrame}
              open={lensOpen}
              onClose={() => setLensOpen(false)}
              onToggle={() => {
                setAtlasOpen(false);
                setLensOpen((current) => !current);
              }}
            />
          </div>

          <button type="button" className="inscribe-action" onClick={isListener ? openListenerRecord : handleInscribe}>
            {isListener ? "OPEN DANCE" : "SHARE DANCE"}
            <span aria-hidden="true" />
          </button>
        </>
      )}

      {runtimeError && (
        <div className="runtime-message" role="alert">
          {runtimeError}
          <button type="button" onClick={() => setRuntimeError(null)}>DISMISS</button>
        </div>
      )}

      <InscriptionDialog
        bodies={shareScore.bodies}
        duration={shareScore.duration}
        link={shareLink}
        message={inscribed?.message ?? composition.message}
        mode={isListener ? "listener" : "composer"}
        open={dialogOpen}
        resonances={shareScore.resonances}
        onClose={() => setDialogOpen(false)}
        onCopy={copyLink}
        onEnterOrbit={enterOrbit}
        onMessageChange={updateMessage}
        onShare={share}
        status={dialogStatus}
      />
    </main>
  );
}
