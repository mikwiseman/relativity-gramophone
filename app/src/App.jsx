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
import { hapticPattern, isResonanceChallengeComplete } from "./lib/sonification.js";

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
  const [physicsFrame, setPhysicsFrame] = useState(null);
  const audioRef = useRef(new AudioEngine());
  const lastPhysicsPaintRef = useRef(0);
  const eventCountRef = useRef(composition.events.length);
  const challengeTargetRef = useRef(null);
  const challengeNeedsGestureRef = useRef(true);
  const challengeLockStartedRef = useRef(null);
  const challengeCompletedRef = useRef(false);

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
    audioRef.current.updateField(frame);
    const target = challengeTargetRef.current;
    if (target && !challengeNeedsGestureRef.current && !challengeCompletedRef.current) {
      const lockIsStrong = isResonanceChallengeComplete(frame.resonance, target);
      if (lockIsStrong && challengeLockStartedRef.current === null) challengeLockStartedRef.current = performance.now();
      if (!lockIsStrong) challengeLockStartedRef.current = null;

      if (lockIsStrong && performance.now() - challengeLockStartedRef.current >= 720) {
        challengeCompletedRef.current = true;
        setChallengeStatus(`LOCKED ${target} · THE ORBIT SINGS`);
        audioRef.current.playChallengeSuccess();
        performHaptic({ kind: "resonance", strength: frame.resonance?.strength ?? 0.82 });
      }
    }
    const now = performance.now();
    if (now - lastPhysicsPaintRef.current < 90) return;
    lastPhysicsPaintRef.current = now;
    setPhysicsFrame(frame);
  }, [performHaptic]);

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

  const handleThemeChange = useCallback((nextTheme) => {
    if (isListener) {
      setLocalTheme(nextTheme);
      return;
    }
    setLocalTheme(null);
    setComposition((current) => ({ ...current, preferredTheme: nextTheme }));
  }, [isListener]);

  const handleVoiceSelect = useCallback(async (voiceId) => {
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

  const handleChallengeSelect = useCallback(async (target) => {
    if (isListener) {
      setChallengeStatus("ANSWER WITH ORBIT TO PLAY");
      return;
    }
    challengeTargetRef.current = target;
    challengeNeedsGestureRef.current = true;
    challengeLockStartedRef.current = null;
    challengeCompletedRef.current = false;
    setChallengeTarget(target);
    setChallengeStatus(`DRAG TO SEEK ${target}`);
    setAtlasOpen(false);
    try {
      await audioRef.current.resume();
      setRuntimeError(null);
      setIsPlaying(true);
      setDialogOpen(false);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : "Orbit game audio could not start");
    }
  }, [isListener]);

  const handleBodyGesture = useCallback((event) => {
    if (isListener) return;
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
      await navigator.share({
        title: "Relativity Gramophone",
        text: inscribed?.message || "A recorded orbit",
        url: shareLink,
      });
      setDialogStatus("ORBIT SHARED");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setDialogStatus(`SHARE FAILED — ${error instanceof Error ? error.message.toUpperCase() : "UNKNOWN ERROR"}`);
    }
  }, [inscribed?.message, shareLink]);

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
      challengeTargetRef.current = null;
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

      {challengeTarget && !atlasOpen && !isListener && (
        <button type="button" className="challenge-strip" onClick={() => setAtlasOpen(true)}>
          <span>RESONANCE {challengeTarget}</span>
          <strong>{challengeStatus}</strong>
        </button>
      )}

      <div className="bottom-left-controls">
        <Transport isPlaying={isPlaying} isListener={isListener} onToggle={handleTogglePlayback} onRestart={restart} />
        <CosmicSoundAtlas
          bodies={composition.bodies}
          challengeStatus={challengeStatus}
          challengeTarget={challengeTarget}
          frame={physicsFrame}
          isListener={isListener}
          onBodySelect={setSelectedBodyId}
          onChallengeSelect={handleChallengeSelect}
          onClose={() => setAtlasOpen(false)}
          onToggle={() => {
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
        INSCRIBE
        <span aria-hidden="true" />
      </button>

      {runtimeError && (
        <div className="runtime-message" role="alert">
          {runtimeError}
          <button type="button" onClick={() => setRuntimeError(null)}>DISMISS</button>
        </div>
      )}

      <InscriptionDialog
        link={shareLink}
        message={inscribed?.message ?? composition.message}
        mode={isListener ? "listener" : "composer"}
        open={dialogOpen}
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
