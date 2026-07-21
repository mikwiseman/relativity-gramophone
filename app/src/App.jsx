import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  Atom,
  Minus,
  NavigationArrow,
  Planet,
  Plus,
  ShareNetwork,
  SquaresFour,
  WaveSine,
  X,
} from "@phosphor-icons/react";

import { InscriptionDialog } from "./components/InscriptionDialog.jsx";
import { CosmicSoundAtlas } from "./components/CosmicSoundAtlas.jsx";
import { RelativityLens } from "./components/RelativityLens.jsx";
import { SoundflightStage } from "./components/SoundflightStage.jsx";
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
import { createHarpComposition, HARPS, HARP_ORDER, harpForComposition } from "./lib/starHarps.js";
import { captureResonance, measureTargetResonance, RESONANCE_TARGETS } from "./lib/gameProgress.js";
import { COSMIC_VOICES, hapticPattern, isResonanceChallengeComplete, voiceParameters } from "./lib/sonification.js";
import {
  createSoundflightState,
  frequencyToNoteName,
  launchGuidance,
  reduceSoundflightState,
  shouldApplyGestationUpdate,
  voiceVisual,
} from "./lib/soundflight.js";

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
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [resetToken, setResetToken] = useState(0);
  const [inscribed, setInscribed] = useState(initial.score);
  const [dialogOpen, setDialogOpen] = useState(Boolean(initial.score));
  const [dialogStatus, setDialogStatus] = useState("");
  const [runtimeError, setRuntimeError] = useState(initial.error);
  const [lensOpen, setLensOpen] = useState(false);
  const [atlasOpen, setAtlasOpen] = useState(false);
  const [systemsOpen, setSystemsOpen] = useState(false);
  const [launchPhase, setLaunchPhase] = useState("armed");
  const [cameraScale, setCameraScale] = useState("1.2 AU");
  const [cameraCommand, setCameraCommand] = useState({ id: 0, type: "zoom", direction: -1 });
  const [soundflightState, dispatchSoundflight] = useReducer(reduceSoundflightState, null, createSoundflightState);
  const [selectedBodyId, setSelectedBodyId] = useState("europa");
  const [challengeTarget, setChallengeTarget] = useState(null);
  const [challengeStatus, setChallengeStatus] = useState("CHOOSE A RATIO");
  const [challengeGuide, setChallengeGuide] = useState(null);
  const [physicsFrame, setPhysicsFrame] = useState(null);
  const [sonicCue, setSonicCue] = useState("");
  const audioRef = useRef(new AudioEngine());
  const gestationEngagedRef = useRef(false);
  const gestationReadyRef = useRef(false);
  const gestationResumeRef = useRef(null);
  const gestationRequestRef = useRef(0);
  const physicsFrameRef = useRef(null);
  const lastPhysicsPaintRef = useRef(0);
  const eventCountRef = useRef(composition.events.length);
  const challengeTargetRef = useRef(null);
  const challengeNeedsGestureRef = useRef(true);
  const challengeLockStartedRef = useRef(null);
  const challengeCompletedRef = useRef(false);
  const resonanceSealsRef = useRef(composition.resonances);
  const sonicCueTimeoutRef = useRef(null);

  const themeId = getPresentationTheme(composition, null);
  const theme = THEMES.lacquer;
  const shareScore = inscribed ?? composition;
  const launchCopy = soundflightState.mode === "launch" ? launchGuidance(launchPhase) : null;
  const shareLink = useMemo(() => createShareUrl(shareScore), [shareScore]);
  const atlasBodies = useMemo(() => {
    const rosterIds = new Set(composition.bodies.map((body) => body.id));
    const liveNovas = (physicsFrame?.bodies ?? [])
      .filter((body) => body.created && !rosterIds.has(body.id))
      .map((body) => ({ id: body.id, voice: body.voice }));
    return [...composition.bodies, ...liveNovas];
  }, [composition.bodies, physicsFrame]);
  const voiceLegend = useMemo(() => [...new Set(atlasBodies.map((body) => body.voice))]
    .map((voiceId) => ({ id: voiceId, ...voiceVisual(voiceId) })), [atlasBodies]);

  useEffect(() => {
    document.documentElement.style.colorScheme = "dark";
  }, []);

  useEffect(() => () => window.clearTimeout(sonicCueTimeoutRef.current), []);

  const announceSonicCue = useCallback((message) => {
    window.clearTimeout(sonicCueTimeoutRef.current);
    setSonicCue(message);
    sonicCueTimeoutRef.current = window.setTimeout(() => setSonicCue(""), 1500);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      setSystemsOpen(false);
      setAtlasOpen(false);
      setLensOpen(false);
      if (soundflightState.mode === "launch") {
        setLaunchPhase("armed");
        dispatchSoundflight({ type: "CANCEL" });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [soundflightState.mode]);

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
    const visual = voiceVisual(note.voice);
    announceSonicCue(`${visual.colorName} · ${visual.label} · ${frequencyToNoteName(voiceParameters(note).frequency)}`);
  }, [announceSonicCue, performHaptic]);

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

  const handleVoiceSelect = useCallback(async (voiceId) => {
    try {
      await audioRef.current.resume(isPlaying);
      audioRef.current.playVoicePreview(voiceId);
      setRuntimeError(null);
      if (isListener || selectedBodyId.startsWith("nova-")) return;
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
    const authoredBody = composition.bodies.find((body) => body.id === bodyId) ?? null;
    const liveBody = physicsFrameRef.current?.bodies.find((body) => body.id === bodyId) ?? null;
    if (!authoredBody && !liveBody) return;
    setIsPlaying(true);
    setDialogOpen(false);
    try {
      await audioRef.current.resume(true);
      setRuntimeError(null);
      audioRef.current.playOrbitNote({
        x: authoredBody?.semiMajor ?? liveBody.x,
        y: 0,
        properRate: 1,
        doppler: 1,
        displayMass: authoredBody?.mass ?? liveBody.displayMass,
        ...(authoredBody ?? {}),
        ...(liveBody ?? {}),
        voice: liveBody?.voice ?? authoredBody?.voice,
      });
      performHaptic({ kind: "audition", strength: authoredBody?.mass ?? liveBody?.displayMass ?? 0.5 });
      const voiceId = liveBody?.voice ?? authoredBody?.voice;
      const visual = voiceVisual(voiceId);
      announceSonicCue(`SOLO · ${visual.colorName} ${visual.label}`);
    } catch (error) {
      setIsPlaying(false);
      setRuntimeError(error instanceof Error ? error.message : "Planetary voice could not start");
    }
  }, [announceSonicCue, composition.bodies, performHaptic]);

  const handleBirthBloom = useCallback(async (body) => {
    setIsPlaying(true);
    setDialogOpen(false);
    try {
      await audioRef.current.resume(true);
      setRuntimeError(null);
      audioRef.current.playBirthBloom(body);
      performHaptic({ kind: "birth", strength: body.displayMass ?? body.mass ?? 0.5 });
      const visual = voiceVisual(body.voice);
      announceSonicCue(`${body.id.toUpperCase()} · ${visual.colorName} ${visual.label} JOINS`);
    } catch (error) {
      setIsPlaying(false);
      setRuntimeError(error instanceof Error ? error.message : "The newborn voice could not start");
    }
  }, [announceSonicCue, performHaptic]);

  const handleConsumptionBloom = useCallback((body) => {
    audioRef.current.playConsumption(body);
    performHaptic({ kind: "consumption", strength: body.displayMass ?? body.mass ?? 0.5 });
    announceSonicCue(`${body.id.toUpperCase()} RETURNS TO THE STAR`);
  }, [announceSonicCue, performHaptic]);

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
      audioRef.current.updateGestation({ frequency: candidate.frequency, pan: candidate.pan });
    } catch (error) {
      if (requestId !== gestationRequestRef.current) return;
      gestationEngagedRef.current = false;
      gestationReadyRef.current = false;
      gestationResumeRef.current = null;
      setIsPlaying(false);
      audioRef.current.endGestation();
      setRuntimeError(error instanceof Error ? error.message : "The gestation tone could not start");
    }
  }, []);

  const handleBirthRefused = useCallback((message) => {
    setRuntimeError(message);
  }, []);

  const handlePluckBloom = useCallback(async (body, pluck) => {
    try {
      await audioRef.current.resume(isPlaying);
      setRuntimeError(null);
      audioRef.current.playPluck(body, pluck);
      performHaptic({ kind: "pluck", strength: pluck.strength });
      announceSonicCue(`ORBIT PLUCK · ${body.id.toUpperCase()}`);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : "The string could not sound");
    }
  }, [announceSonicCue, isPlaying, performHaptic]);

  const loadHarp = useCallback(async (harpId) => {
    setIsPlaying(false);
    await audioRef.current.suspend();
    const next = createHarpComposition(harpId);
    next.preferredTheme = themeId;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    setComposition(next);
    eventCountRef.current = 0;
    setInscribed(null);
    setElapsed(0);
    setSelectedBodyId("europa");
    dispatchSoundflight({ type: "CANCEL" });
    setCameraCommand((current) => ({ id: current.id + 1, type: "reset" }));
    setChallengeTarget(null);
    setChallengeStatus("CHOOSE A RATIO");
    setChallengeGuide(null);
    challengeTargetRef.current = null;
    resonanceSealsRef.current = [];
    challengeNeedsGestureRef.current = true;
    challengeLockStartedRef.current = null;
    challengeCompletedRef.current = false;
    setResetToken((current) => current + 1);
    setDialogOpen(false);
    setSystemsOpen(false);
  }, [themeId]);

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
    if (event.kind !== "pluck" && challengeTargetRef.current) {
      challengeNeedsGestureRef.current = false;
      challengeCompletedRef.current = false;
      challengeLockStartedRef.current = null;
      setChallengeStatus(`SEEKING ${challengeTargetRef.current}`);
    }
    if (eventCountRef.current >= MAX_SCORE_EVENTS) {
      setRuntimeError("TAU RECORD LIMIT REACHED — INSCRIBE THIS ORBIT BEFORE CONTINUING");
      return;
    }
    if (event.at > 3600) {
      setRuntimeError("THE TAU RECORD ENDS AT ONE HOUR — INSCRIBE THIS DANCE OR RESTART");
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
    if (!isListener) {
      eventCountRef.current = 0;
      setInscribed(null);
      setComposition((current) => (current.events.length ? { ...current, events: [] } : current));
    }
    setResetToken((current) => current + 1);
    setDialogOpen(false);
  }, [isListener]);

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
      setDialogOpen(false);
      setElapsed(0);
      setRuntimeError(null);
      setSelectedBodyId("europa");
      dispatchSoundflight({ type: "CANCEL" });
      setChallengeTarget(null);
      setChallengeStatus("CHOOSE A RATIO");
      setChallengeGuide(null);
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
      data-theme="lacquer"
      data-launch-mode={soundflightState.mode === "launch"}
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
        interactionMode={soundflightState.mode}
        followingBodyId={soundflightState.followingBodyId}
        isPlaying={isPlaying}
        isListener={isListener}
        playbackEvents={composition.events}
        resetToken={resetToken}
        onBirthBloom={handleBirthBloom}
        onBirthRefused={handleBirthRefused}
        onBodyGesture={handleBodyGesture}
        onBodyAudition={handleBodyAudition}
        onBodySelect={setSelectedBodyId}
        onCameraNavigate={() => dispatchSoundflight({ type: "USER_NAVIGATE" })}
        onCameraScale={setCameraScale}
        onConsumptionBloom={handleConsumptionBloom}
        onElapsed={handleElapsed}
        onGestationTone={handleGestationTone}
        onHaptic={performHaptic}
        onLaunchComplete={(bodyId) => {
          setLaunchPhase("armed");
          dispatchSoundflight({ type: "COMPLETE_LAUNCH", bodyId });
        }}
        onLaunchPhase={setLaunchPhase}
        onNote={handleNote}
        onPhysicsFrame={handlePhysicsFrame}
        onPluckBloom={handlePluckBloom}
        selectedBodyId={selectedBodyId}
      />

      <header className="soundflight-title">
        <h1>RELATIVITY<br />GRAMOPHONE</h1>
        <p>A PLAYABLE N-BODY MUSICAL UNIVERSE</p>
      </header>

      {!dialogOpen && (
        <>
          <button
            type="button"
            className="soundflight-systems-trigger"
            aria-controls="soundflight-systems"
            aria-expanded={systemsOpen}
            onClick={() => {
              if (soundflightState.mode === "launch") dispatchSoundflight({ type: "CANCEL" });
              setLaunchPhase("armed");
              setSystemsOpen((current) => !current);
            }}
          >
            <SquaresFour aria-hidden="true" weight="thin" />
            <span>SYSTEMS</span>
          </button>

          <div className="soundflight-launch-dock">
            <button
              type="button"
              className="soundflight-launch"
              aria-pressed={soundflightState.mode === "launch"}
              onClick={() => {
                setSystemsOpen(false);
                if (isListener) {
                  enterOrbit();
                  return;
                }
                const cancelLaunch = soundflightState.mode === "launch";
                if (!cancelLaunch && soundflightState.mode === "explore") {
                  setCameraCommand((current) => ({ id: current.id + 1, type: "reset" }));
                }
                setLaunchPhase("armed");
                dispatchSoundflight({ type: cancelLaunch ? "CANCEL" : "ARM_LAUNCH" });
              }}
            >
              <Planet aria-hidden="true" weight="thin" />
              <span>
                <strong>{isListener ? "ANSWER" : soundflightState.mode === "launch" ? "CANCEL" : "ADD PLANET"}</strong>
                <small>{isListener ? "Enter this universe" : soundflightState.mode === "launch" ? "Return to composition" : "Drag from the star"}</small>
              </span>
            </button>
            <Transport isPlaying={isPlaying} isListener={isListener} onToggle={handleTogglePlayback} onRestart={restart} />
          </div>

          {launchCopy && (
            <section className="soundflight-launch-guide" data-phase={launchPhase} aria-live="polite" aria-label="Launch instructions">
              <span>{launchCopy.eyebrow}</span>
              <strong>{launchCopy.title}</strong>
              <p>{launchCopy.detail}</p>
              <ol aria-label="Launch steps">
                {["DRAG", "PITCH", "RELEASE"].map((step, index) => (
                  <li key={step} data-state={index < launchCopy.activeStep ? "done" : index === launchCopy.activeStep ? "active" : "next"}>
                    <small>0{index + 1}</small>
                    {step}
                  </li>
                ))}
              </ol>
            </section>
          )}

          <aside className="soundflight-voice-key" aria-label="Musical thread colors">
            <span>MUSICAL THREADS · {atlasBodies.length} VOICES</span>
            <ul>
              {voiceLegend.map((voice) => (
                <li key={voice.id}>
                  <i aria-hidden="true" style={{ "--voice-color": `#${voice.color.toString(16).padStart(6, "0")}` }} />
                  <strong>{voice.colorName}</strong>
                  <small>{voice.label}</small>
                </li>
              ))}
            </ul>
            <p>PULSE = NOTE</p>
            <b>{cameraScale}</b>
            <div className="soundflight-zoom-controls">
              <button type="button" aria-label="Zoom in" onClick={() => {
                dispatchSoundflight({ type: "USER_NAVIGATE" });
                setCameraCommand((current) => ({ id: current.id + 1, type: "zoom", direction: -1 }));
              }}>
                <Plus aria-hidden="true" weight="thin" />
              </button>
              <button type="button" aria-label="Zoom out" onClick={() => {
                dispatchSoundflight({ type: "USER_NAVIGATE" });
                setCameraCommand((current) => ({ id: current.id + 1, type: "zoom", direction: 1 }));
              }}>
                <Minus aria-hidden="true" weight="thin" />
              </button>
            </div>
          </aside>

          <div className="soundflight-voice-breath" aria-live="polite">
            <WaveSine aria-hidden="true" weight="thin" />
            <span>{sonicCue || (challengeTarget ? `RESONANCE ${challengeTarget} · ${challengeStatus}` : "LIVE ORBIT SONIFICATION")}</span>
          </div>

          <button
            type="button"
            className="soundflight-explore"
            aria-pressed={soundflightState.mode === "explore"}
            onClick={() => {
              const leavingExplore = soundflightState.mode === "explore";
              if (leavingExplore) setCameraCommand((current) => ({ id: current.id + 1, type: "reset" }));
              dispatchSoundflight({ type: leavingExplore ? "EXIT_EXPLORE" : "ENTER_EXPLORE" });
            }}
          >
            {soundflightState.mode === "explore" ? "RETURN TO COMPOSITION" : "EXPLORE"}
            {soundflightState.mode === "explore"
              ? <X aria-hidden="true" weight="thin" />
              : <NavigationArrow aria-hidden="true" weight="thin" />}
          </button>

          {systemsOpen && (
            <aside id="soundflight-systems" className="soundflight-systems" aria-label="Systems and instrument">
              <header>
                <div>
                  <span>THE INSTRUMENT</span>
                  <strong>{formatTime(elapsed)} · {atlasBodies.length} VOICES</strong>
                </div>
                <button type="button" aria-label="Close systems" onClick={() => setSystemsOpen(false)}>
                  <X aria-hidden="true" weight="thin" />
                </button>
              </header>

              {!isListener && (
                <section aria-labelledby="system-presets-title">
                  <h2 id="system-presets-title">STARTING UNIVERSES</h2>
                  <div className="soundflight-system-list" role="radiogroup" aria-label="Choose a starting universe">
                    {HARP_ORDER.map((harpId) => (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={harpForComposition(composition) === harpId}
                        key={harpId}
                        onClick={() => loadHarp(harpId)}
                      >
                        <strong>{HARPS[harpId].name}</strong>
                        <span>{HARPS[harpId].motto}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              <nav className="soundflight-panel-actions" aria-label="Instrument views">
                <button type="button" onClick={() => {
                  setSystemsOpen(false);
                  setLensOpen(false);
                  setAtlasOpen(true);
                }}>
                  <WaveSine aria-hidden="true" weight="thin" />
                  <span><strong>VOICES</strong><small>Hear and shape the sonification</small></span>
                </button>
                <button type="button" onClick={() => {
                  setSystemsOpen(false);
                  setAtlasOpen(false);
                  setLensOpen(true);
                }}>
                  <Atom aria-hidden="true" weight="thin" />
                  <span><strong>PHYSICS</strong><small>Open the relativity lens</small></span>
                </button>
                <button type="button" onClick={() => {
                  setSystemsOpen(false);
                  if (isListener) openListenerRecord();
                  else handleInscribe();
                }}>
                  <ShareNetwork aria-hidden="true" weight="thin" />
                  <span><strong>{isListener ? "OPEN DANCE" : "SHARE DANCE"}</strong><small>Preserve and send this universe</small></span>
                </button>
              </nav>
            </aside>
          )}

          <CosmicSoundAtlas
            bodies={atlasBodies}
            capturedResonances={composition.resonances}
            challengeGuide={challengeGuide}
            challengeStatus={challengeStatus}
            challengeTarget={challengeTarget}
            isListener={isListener}
            onBodySelect={setSelectedBodyId}
            onChallengeSelect={handleChallengeSelect}
            onClose={() => setAtlasOpen(false)}
            onToggle={() => setAtlasOpen((current) => !current)}
            onVoiceSelect={handleVoiceSelect}
            open={atlasOpen}
            selectedBodyId={selectedBodyId}
            showTrigger={false}
          />
          <RelativityLens
            frame={physicsFrame}
            open={lensOpen}
            onClose={() => setLensOpen(false)}
            onToggle={() => setLensOpen((current) => !current)}
            showTrigger={false}
          />
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
