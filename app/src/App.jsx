import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CrosshairSimple,
  House,
  Minus,
  NavigationArrow,
  Pause,
  Play,
  Plus,
  ShareNetwork,
  Trash,
} from "@phosphor-icons/react";

import { InscriptionDialog } from "./components/InscriptionDialog.jsx";
import { SoundflightStage } from "./components/SoundflightStage.jsx";
import { AudioEngine } from "./lib/audioEngine.js";
import {
  createBlankComposition,
  createReplyComposition,
  getPresentationTheme,
  MAX_SCORE_EVENTS,
  readCompositionFromHash,
  recordingDuration,
  resolveScoreRoster,
} from "./lib/composition.js";
import {
  createShortScoreUrl,
  fetchStoredComposition,
  persistComposition,
  readStoredScoreId,
} from "./lib/scoreStore.js";
import { THEMES } from "./lib/themes.js";
import { copyOrbitLink, shareOrbit } from "./lib/sharing.js";
import {
  COSMIC_DESTINATIONS,
  cosmicDestination,
  cosmicJourneyForScale,
  cosmicLandmarkById,
  cosmicScaleForDistance,
} from "./lib/cosmicInstrument.js";
import { COSMIC_VOICES, hapticPattern, voiceParameters } from "./lib/sonification.js";
import { MAX_WORLDS } from "./lib/physicsEngine.js";
import {
  frequencyToNoteName,
  INITIAL_PLAYBACK,
  INSTRUMENT_TITLE,
  instrumentGuidanceDetail,
  instrumentHint,
  instrumentLesson,
  playbackControl,
  shouldApplyGestationUpdate,
  shouldApplyThereminRelease,
  shouldCelebrateThereminEnd,
  voiceVisual,
} from "./lib/soundflight.js";

function readInitialScore() {
  try {
    const storedId = readStoredScoreId();
    return {
      score: storedId ? null : readCompositionFromHash(),
      storedId,
      error: null,
    };
  } catch (error) {
    return {
      score: null,
      storedId: null,
      error: error instanceof Error ? error.message : "Invalid score",
    };
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
  const [isPlaying, setIsPlaying] = useState(
    initial.score || initial.storedId ? false : INITIAL_PLAYBACK,
  );
  const [audioState, setAudioState] = useState("locked");
  const [elapsed, setElapsed] = useState(0);
  const [resetToken, setResetToken] = useState(0);
  const [inscribed, setInscribed] = useState(initial.score);
  const [dialogOpen, setDialogOpen] = useState(Boolean(initial.score));
  const [dialogStatus, setDialogStatus] = useState("");
  const [shareLink, setShareLink] = useState(() => (
    initial.storedId ? createShortScoreUrl(initial.storedId) : ""
  ));
  const [storedScoreState, setStoredScoreState] = useState(
    initial.storedId ? "loading" : initial.error ? "error" : "idle",
  );
  const [runtimeError, setRuntimeError] = useState(initial.error);
  const [selectedBodyId, setSelectedBodyId] = useState(null);
  const [physicsFrame, setPhysicsFrame] = useState(null);
  const [sonicCue, setSonicCue] = useState("");
  const [removeCommand, setRemoveCommand] = useState({ id: 0, bodyId: null });
  const [cameraCommand, setCameraCommand] = useState({ id: 0, type: "reset" });
  const [cameraScale, setCameraScale] = useState("1.2 AU");
  const [cosmicScale, setCosmicScale] = useState(() => cosmicScaleForDistance(10));
  const [journeyTarget, setJourneyTarget] = useState(null);
  const [arrivalTarget, setArrivalTarget] = useState(null);
  const [interactionMode, setInteractionMode] = useState("compose");
  const [hasPluckedOrbit, setHasPluckedOrbit] = useState(false);
  const [thereminPhase, setThereminPhase] = useState("idle");
  const [hasPlayedTheremin, setHasPlayedTheremin] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [interactionCancelToken, setInteractionCancelToken] = useState(0);

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
  const thereminEngagedRef = useRef(false);
  const thereminSoundedRef = useRef(false);
  const thereminRequestRef = useRef(0);
  const thereminReleaseTimeoutRef = useRef(null);
  const intentionalPauseRef = useRef(false);
  const audioStartPromiseRef = useRef(null);
  const shareRequestRef = useRef(0);
  const journeyTargetRef = useRef(null);
  const arrivalTimeoutRef = useRef(null);
  const guideTriggerRef = useRef(null);
  const guideDialogRef = useRef(null);

  const cancelTheremin = useCallback(() => {
    thereminEngagedRef.current = false;
    thereminSoundedRef.current = false;
    thereminRequestRef.current += 1;
    window.clearTimeout(thereminReleaseTimeoutRef.current);
    audioRef.current.endTheremin();
    setThereminPhase("idle");
  }, []);

  const cancelDirectGestures = useCallback(() => {
    gestationEngagedRef.current = false;
    gestationReadyRef.current = false;
    gestationResumeRef.current = null;
    gestationRequestRef.current += 1;
    audioRef.current.endGestation();
    cancelTheremin();
    setInteractionCancelToken((current) => current + 1);
  }, [cancelTheremin]);

  const openGuide = useCallback(() => {
    cancelDirectGestures();
    setGuideOpen(true);
  }, [cancelDirectGestures]);

  const closeGuide = useCallback(() => {
    setGuideOpen(false);
  }, []);

  const openListenerShare = useCallback(() => {
    cancelDirectGestures();
    setDialogOpen(true);
  }, [cancelDirectGestures]);

  const loadScore = useCallback((score, { link = "" } = {}) => {
    const nextComposition = score ?? createBlankComposition();
    shareRequestRef.current += 1;
    gestationEngagedRef.current = false;
    gestationReadyRef.current = false;
    intentionalPauseRef.current = false;
    cancelDirectGestures();
    setComposition(nextComposition);
    setIsListener(Boolean(score));
    setIsPlaying(score ? false : INITIAL_PLAYBACK);
    setAudioState(audioRef.current.getState() === "running" ? "running" : "locked");
    setElapsed(0);
    setInscribed(score);
    setDialogOpen(Boolean(score));
    setDialogStatus("");
    setShareLink(link);
    setRuntimeError(null);
    setSelectedBodyId(null);
    setPhysicsFrame(null);
    physicsFrameRef.current = null;
    eventCountRef.current = nextComposition.events.length;
    setSonicCue("");
    setJourneyTarget(null);
    journeyTargetRef.current = null;
    window.clearTimeout(arrivalTimeoutRef.current);
    setArrivalTarget(null);
    setInteractionMode("compose");
    setHasPluckedOrbit(false);
    setHasPlayedTheremin(false);
    setGuideOpen(false);
    setCameraScale("1.2 AU");
    setCosmicScale(cosmicScaleForDistance(10));
    setCameraCommand((current) => ({ id: current.id + 1, type: "reset" }));
    setResetToken((current) => current + 1);
  }, [cancelDirectGestures]);

  const themeId = getPresentationTheme(composition, null);
  const theme = THEMES.lacquer;
  const shareScore = inscribed ?? composition;
  const recordedBodies = useMemo(() => resolveScoreRoster(shareScore), [shareScore]);
  const liveBodies = physicsFrame?.bodies ?? [];
  const planets = liveBodies.filter((body) => body.kind === "planet");
  const selectedBody = liveBodies.find((body) => body.id === selectedBodyId) ?? null;
  const selectedMoonCount = selectedBody?.kind === "planet"
    ? liveBodies.filter((body) => body.kind === "moon" && body.parentId === selectedBody.id).length
    : 0;
  const selectedVoice = selectedBody ? voiceVisual(selectedBody.voice) : null;
  const currentDestination = cosmicDestination(
    cosmicScale.id === "orbit" ? "system" : cosmicScale.id,
  );
  const hasCosmicScore = isListener
    && composition.events.some((event) => event.kind === "cosmic-landmark");
  const isAwaitingCosmicScore = hasCosmicScore
    && liveBodies.length === 0
    && (cosmicScale.id === "orbit" || cosmicScale.id === "system")
    && !journeyTarget;
  const cosmicDestinations = Object.values(COSMIC_DESTINATIONS);
  const currentDestinationIndex = cosmicDestinations.findIndex(
    (destination) => destination.id === currentDestination.id,
  );
  const cosmicJourney = cosmicJourneyForScale(currentDestination.id);
  const nextDestination = cosmicJourney.outward;
  const guidance = instrumentHint({
    planetCount: planets.length,
    selectedBody,
    selectedMoonCount,
    isListener,
    hasPluckedOrbit,
    thereminPhase,
    hasPlayedTheremin,
  });
  const guidanceDetail = instrumentGuidanceDetail({
    planetCount: planets.length,
    selectedBody,
    selectedMoonCount,
    isListener,
    hasPluckedOrbit,
    thereminPhase,
    hasPlayedTheremin,
  });
  const lesson = instrumentLesson({
    planetCount: planets.length,
    hasPluckedOrbit,
    thereminPhase,
    hasPlayedTheremin,
  });
  const showInstrumentLesson = Boolean(
    lesson
    && !isListener
    && currentDestination.id === "system"
    && interactionMode === "compose"
    && !journeyTarget,
  );
  const activeGuidance = journeyTarget
    ? `FLYING TO ${cosmicDestination(journeyTarget).label}`
    : arrivalTarget
      ? `YOU ARE IN ${cosmicDestination(arrivalTarget).label}`
    : interactionMode === "explore"
      ? `LOOK AROUND ${currentDestination.label}`
      : interactionMode === "moon" && selectedBody?.kind === "planet"
        ? `DRAG FROM ${bodyLabel(selectedBody)}`
      : isAwaitingCosmicScore
        ? "A SHARED UNIVERSE IS READY"
      : cosmicScale.id === "orbit" || cosmicScale.id === "system"
        ? guidance
        : currentDestination.guidance;
  const activeGuidanceDetail = journeyTarget
    ? "YOUR CURRENT WORLD IS BECOMING ONE LIGHT"
    : arrivalTarget
      ? arrivalTarget === "system"
        ? planets.length > 0
          ? "TOUCH A GLOWING ORBIT TO PLAY IT"
          : "HOLD THE STAR · PULL OUTWARD · RELEASE"
        : "TOUCH A BRIGHT REGION TO HEAR IT"
    : interactionMode === "explore"
      ? "DRAG TO LOOK AROUND · PINCH TO FLY CLOSER OR FARTHER"
      : interactionMode === "moon" && selectedBody?.kind === "planet"
        ? "PULL OUTWARD · RELEASE INSIDE THE GLOWING HALO"
      : isAwaitingCosmicScore
        ? "LISTEN · THE CAMERA FOLLOWS EACH COSMIC VOICE"
      : cosmicScale.id === "orbit" || cosmicScale.id === "system"
        ? guidanceDetail
        : currentDestination.guidanceDetail;
  const playback = playbackControl({ audioState, isPlaying });

  const loadStoredScore = useCallback(async (id) => {
    setStoredScoreState("loading");
    setRuntimeError(null);
    try {
      const score = await fetchStoredComposition(id);
      loadScore(score, { link: createShortScoreUrl(id) });
      setStoredScoreState("idle");
    } catch (error) {
      setStoredScoreState("error");
      setRuntimeError(error instanceof Error ? error.message : "The shared universe could not open");
    }
  }, [loadScore]);

  useEffect(() => {
    document.documentElement.style.colorScheme = "dark";
  }, []);

  useEffect(() => {
    if (initial.storedId) loadStoredScore(initial.storedId);
  }, [initial.storedId, loadStoredScore]);

  useEffect(() => audioRef.current.subscribeState((state) => {
    if (state === "running") {
      setAudioState("running");
      return;
    }
    setAudioState(state === "suspended" && intentionalPauseRef.current ? "paused" : "locked");
  }), []);

  useEffect(() => {
    const handleHashChange = () => {
      try {
        if (readStoredScoreId()) return;
        loadScore(readCompositionFromHash());
        setStoredScoreState("idle");
      } catch (error) {
        setStoredScoreState("error");
        setRuntimeError(error instanceof Error ? error.message : "Invalid score");
      }
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [loadScore]);

  useEffect(() => {
    const handleHistoryChange = () => {
      try {
        const storedId = readStoredScoreId();
        if (storedId) {
          loadStoredScore(storedId);
          return;
        }
        loadScore(readCompositionFromHash());
        setStoredScoreState("idle");
      } catch (error) {
        setStoredScoreState("error");
        setRuntimeError(error instanceof Error ? error.message : "Invalid score");
      }
    };
    window.addEventListener("popstate", handleHistoryChange);
    return () => window.removeEventListener("popstate", handleHistoryChange);
  }, [loadScore, loadStoredScore]);

  useEffect(() => () => {
    window.clearTimeout(sonicCueTimeoutRef.current);
    window.clearTimeout(arrivalTimeoutRef.current);
    window.clearTimeout(thereminReleaseTimeoutRef.current);
    gestationEngagedRef.current = false;
    gestationReadyRef.current = false;
    gestationResumeRef.current = null;
    gestationRequestRef.current += 1;
    audioRef.current.endGestation();
    thereminEngagedRef.current = false;
    thereminSoundedRef.current = false;
    thereminRequestRef.current += 1;
    audioRef.current.endTheremin();
  }, []);

  useEffect(() => {
    if (!guideOpen) return undefined;
    const dialog = guideDialogRef.current;
    const returnTarget = guideTriggerRef.current;
    if (!dialog) throw new Error("How to play dialog did not mount");
    const focusable = [...dialog.querySelectorAll(
      "button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex='-1'])",
    )];
    if (focusable.length === 0) throw new Error("How to play dialog has no focusable controls");
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    last.focus();

    const trapFocus = (event) => {
      if (event.key !== "Tab") return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
        return;
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trapFocus, true);
    return () => {
      document.removeEventListener("keydown", trapFocus, true);
      if (returnTarget?.isConnected) returnTarget.focus();
    };
  }, [guideOpen]);

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

  const startAudio = useCallback((activateField = true) => {
    intentionalPauseRef.current = false;
    if (audioStartPromiseRef.current) return audioStartPromiseRef.current;
    let request;
    request = audioRef.current.resume(activateField)
      .then((state) => {
        setAudioState("running");
        return state;
      })
      .finally(() => {
        if (audioStartPromiseRef.current === request) audioStartPromiseRef.current = null;
      });
    audioStartPromiseRef.current = request;
    return request;
  }, []);

  const handleAudioUnlock = useCallback(() => {
    if (audioState !== "locked") return;
    startAudio(true)
      .then(() => {
        setIsPlaying(true);
        setRuntimeError(null);
      })
      .catch((error) => {
        setAudioState("locked");
        setRuntimeError(error instanceof Error ? error.message : "Audio could not start");
      });
  }, [audioState, startAudio]);

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

  const handleCosmicScale = useCallback((nextScale) => {
    audioRef.current.setCosmicPerspective(nextScale);
    setCosmicScale((current) => (
      current.id === nextScale.id
        && Math.abs(current.neighborhoodMix - nextScale.neighborhoodMix) < 0.025
        && Math.abs(current.galaxyMix - nextScale.galaxyMix) < 0.025
        && Math.abs(current.localGroupMix - nextScale.localGroupMix) < 0.025
        && Math.abs(current.universeMix - nextScale.universeMix) < 0.025
        ? current
        : nextScale
    ));
  }, []);

  const handleCameraNavigate = useCallback((event) => {
    if (event?.type === "manual") {
      journeyTargetRef.current = null;
      setJourneyTarget(null);
      window.clearTimeout(arrivalTimeoutRef.current);
      setArrivalTarget(null);
      return;
    }
    if (event?.type !== "settled" || journeyTargetRef.current !== event.targetId) return;
    journeyTargetRef.current = null;
    setJourneyTarget(null);
    setArrivalTarget(event.targetId);
    window.clearTimeout(arrivalTimeoutRef.current);
    arrivalTimeoutRef.current = window.setTimeout(() => setArrivalTarget(null), 2400);
    announceSonicCue(`ARRIVED · ${cosmicDestination(event.targetId).label}`, 2400);
  }, [announceSonicCue]);

  const handleTheremin = useCallback(async ({ phase, parameters }) => {
    if (phase === "arming") {
      thereminEngagedRef.current = false;
      thereminSoundedRef.current = false;
      thereminRequestRef.current += 1;
      window.clearTimeout(thereminReleaseTimeoutRef.current);
      audioRef.current.endTheremin();
      setThereminPhase("arming");
      return;
    }
    if (phase === "cancel") {
      cancelTheremin();
      return;
    }
    if (phase === "release") {
      setThereminPhase("idle");
      const requestId = thereminRequestRef.current + 1;
      thereminRequestRef.current = requestId;
      try {
        await startAudio(true);
        if (!shouldApplyThereminRelease({
          requestId,
          currentRequestId: thereminRequestRef.current,
        })) return;
        setIsPlaying(true);
        setDialogOpen(false);
        setRuntimeError(null);
        audioRef.current.updateTheremin(parameters);
        thereminSoundedRef.current = true;
        window.clearTimeout(thereminReleaseTimeoutRef.current);
        thereminReleaseTimeoutRef.current = window.setTimeout(() => {
          if (!shouldApplyThereminRelease({
            requestId,
            currentRequestId: thereminRequestRef.current,
          })) return;
          audioRef.current.endTheremin();
        }, 420);
        setHasPlayedTheremin(true);
        protectCueUntilRef.current = performance.now() + 2400;
        announceSonicCue("YOU PLAYED THE LIGHT THEREMIN", 2400);
      } catch (error) {
        if (!shouldApplyThereminRelease({
          requestId,
          currentRequestId: thereminRequestRef.current,
        })) return;
        cancelTheremin();
        setAudioState(audioRef.current.getState() === "running" ? "running" : "locked");
        setRuntimeError(error instanceof Error ? error.message : "The theremin could not start");
      }
      return;
    }
    if (phase === "end") {
      const sounded = thereminSoundedRef.current;
      cancelTheremin();
      if (shouldCelebrateThereminEnd({ sounded })) {
        setHasPlayedTheremin(true);
        protectCueUntilRef.current = performance.now() + 2400;
        announceSonicCue("YOU PLAYED THE LIGHT THEREMIN", 2400);
      }
      return;
    }
    if (parameters?.deferAudio && audioState !== "running") return;

    const requestId = phase === "prepare"
      ? thereminRequestRef.current + 1
      : thereminRequestRef.current;
    if (phase === "prepare") {
      window.clearTimeout(thereminReleaseTimeoutRef.current);
      thereminRequestRef.current = requestId;
      thereminEngagedRef.current = true;
      thereminSoundedRef.current = false;
      setThereminPhase("active");
    }
    try {
      await startAudio(true);
      if (!thereminEngagedRef.current || requestId !== thereminRequestRef.current) return;
      setIsPlaying(true);
      setDialogOpen(false);
      setRuntimeError(null);
      if ((phase === "prepare" || phase === "update") && parameters) {
        audioRef.current.updateTheremin(parameters);
        thereminSoundedRef.current = true;
        if (performance.now() >= protectCueUntilRef.current) {
          protectCueUntilRef.current = performance.now() + 1600;
          announceSonicCue("BEND THE NOTE · MOVE LEFT, RIGHT, UP, DOWN", 2000);
        }
      }
    } catch (error) {
      if (!thereminEngagedRef.current || requestId !== thereminRequestRef.current) return;
      cancelDirectGestures();
      setAudioState(audioRef.current.getState() === "running" ? "running" : "locked");
      setRuntimeError(error instanceof Error ? error.message : "The theremin could not start");
    }
  }, [
    announceSonicCue,
    audioState,
    cancelDirectGestures,
    cancelTheremin,
    startAudio,
  ]);

  const handleToggleExplore = useCallback(() => {
    cancelDirectGestures();
    if (interactionMode === "explore") {
      setCameraCommand((command) => ({
        id: command.id + 1,
        type: "travel",
        targetId: currentDestination.id,
        distance: currentDestination.distance,
      }));
      setInteractionMode("compose");
    } else {
      setSelectedBodyId(null);
      setInteractionMode("explore");
    }
  }, [cancelDirectGestures, currentDestination, interactionMode]);

  const handleCosmicTravel = useCallback((targetId) => {
    if (journeyTargetRef.current) return;
    cancelDirectGestures();
    const destination = cosmicDestination(targetId);
    setSelectedBodyId(null);
    window.clearTimeout(arrivalTimeoutRef.current);
    setArrivalTarget(null);
    journeyTargetRef.current = targetId;
    setJourneyTarget(targetId);
    setInteractionMode("compose");
    setCameraCommand((current) => ({
      id: current.id + 1,
      type: "travel",
      targetId,
      distance: destination.distance,
    }));
  }, [cancelDirectGestures]);

  const handleZoom = useCallback((direction) => {
    if (journeyTargetRef.current) return;
    cancelDirectGestures();
    setJourneyTarget(null);
    window.clearTimeout(arrivalTimeoutRef.current);
    setArrivalTarget(null);
    setCameraCommand((current) => ({
      id: current.id + 1,
      type: "zoom",
      direction,
    }));
  }, [cancelDirectGestures]);

  const handleTogglePlayback = useCallback(async () => {
    if (audioState === "running" && isPlaying) {
      cancelDirectGestures();
      intentionalPauseRef.current = true;
      setIsPlaying(false);
      await audioRef.current.suspend();
      setAudioState("paused");
      return;
    }
    try {
      await startAudio();
      setRuntimeError(null);
      setIsPlaying(true);
      setDialogOpen(false);
    } catch (error) {
      setAudioState("locked");
      setRuntimeError(error instanceof Error ? error.message : "Audio could not start");
    }
  }, [audioState, cancelDirectGestures, isPlaying, startAudio]);

  const handleCosmicAudition = useCallback(async (landmark) => {
    try {
      await startAudio(true);
      audioRef.current.playCosmicLandmark(landmark);
      setIsPlaying(true);
      setDialogOpen(false);
      setRuntimeError(null);
      announceSonicCue(`${landmark.name} · ${landmark.detail}`, 2800);
    } catch (error) {
      setAudioState("locked");
      setRuntimeError(error instanceof Error ? error.message : "The cosmic voice could not start");
    }
  }, [announceSonicCue, startAudio]);

  useEffect(() => {
    const onEscape = (event) => {
      if (event.key !== "Escape") return;
      if (guideOpen) {
        setGuideOpen(false);
        return;
      }
      if (dialogOpen) return;
      if (interactionMode === "moon") {
        cancelDirectGestures();
        setInteractionMode("compose");
        return;
      }
      if (interactionMode === "explore") {
        handleToggleExplore();
        return;
      }
      if (currentDestination.id !== "system") handleCosmicTravel("system");
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [
    currentDestination.id,
    cancelDirectGestures,
    dialogOpen,
    guideOpen,
    handleCosmicTravel,
    handleToggleExplore,
    interactionMode,
  ]);

  const closeDialog = useCallback(async () => {
    setDialogOpen(false);
    if (!isPlaying) return;
    try {
      await startAudio(true);
      setRuntimeError(null);
    } catch (error) {
      setAudioState("locked");
      setRuntimeError(error instanceof Error ? error.message : "Audio could not start");
    }
  }, [isPlaying, startAudio]);

  const startListenerPlayback = useCallback(async () => {
    setDialogOpen(false);
    try {
      await startAudio(true);
      setIsPlaying(true);
      setRuntimeError(null);
    } catch (error) {
      setAudioState("locked");
      setRuntimeError(error instanceof Error ? error.message : "Audio could not start");
    }
  }, [startAudio]);

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
      await startAudio(true);
      setRuntimeError(null);
      setIsPlaying(true);
      setDialogOpen(false);
      audioRef.current.playOrbitNote(body);
      const visual = voiceVisual(body.voice);
      announceSonicCue(`${bodyLabel(body)} · ${visual.colorName} ${visual.label}`);
      performHaptic({ kind: "audition", strength: body.displayMass ?? 0.5 });
    } catch (error) {
      setAudioState("locked");
      setRuntimeError(error instanceof Error ? error.message : "Planetary voice could not start");
    }
  }, [announceSonicCue, performHaptic, startAudio]);

  const handleBirthBloom = useCallback(async (body) => {
    try {
      await startAudio(true);
      setRuntimeError(null);
      setIsPlaying(true);
      setDialogOpen(false);
      audioRef.current.playBirthBloom(body);
      performHaptic({ kind: "birth", strength: body.displayMass ?? body.mass ?? 0.5 });
      protectCueUntilRef.current = performance.now() + 2400;
      announceSonicCue(`${bodyLabel(body)} JOINS THE MUSIC`, 2400);
    } catch (error) {
      setAudioState("locked");
      setRuntimeError(error instanceof Error ? error.message : "The newborn voice could not start");
    }
  }, [announceSonicCue, performHaptic, startAudio]);

  const handleMoonBloom = useCallback(async (moon, parent) => {
    try {
      await startAudio(true);
      setRuntimeError(null);
      setIsPlaying(true);
      setDialogOpen(false);
      audioRef.current.playMoonBloom(moon, parent);
      performHaptic({ kind: "birth", strength: moon.displayMass ?? moon.mass ?? 0.2 });
      protectCueUntilRef.current = performance.now() + 2600;
      announceSonicCue(`${bodyLabel(moon)} HARMONIZES WITH ${bodyLabel(parent)}`, 2600);
    } catch (error) {
      setAudioState("locked");
      setRuntimeError(error instanceof Error ? error.message : "The moon overtone could not start");
    }
  }, [announceSonicCue, performHaptic, startAudio]);

  const handleConsumptionBloom = useCallback((body) => {
    audioRef.current.playConsumption(body);
    performHaptic({ kind: "consumption", strength: body.displayMass ?? body.mass ?? 0.5 });
    announceSonicCue(`${bodyLabel(body)} FADES INTO LIGHT`);
  }, [announceSonicCue, performHaptic]);

  const handlePluckBloom = useCallback(async (body, pluck) => {
    try {
      await startAudio(isPlaying);
      setRuntimeError(null);
      audioRef.current.playPluck(body, pluck);
      setHasPluckedOrbit(true);
      performHaptic({ kind: "pluck", strength: pluck.strength });
      announceSonicCue(`${bodyLabel(body)} ORBIT`);
    } catch (error) {
      setAudioState("locked");
      setRuntimeError(error instanceof Error ? error.message : "The orbit could not sound");
    }
  }, [announceSonicCue, isPlaying, performHaptic, startAudio]);

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
    if (candidate.deferAudio && audioState !== "running") return;
    try {
      if (!gestationEngagedRef.current) {
        gestationEngagedRef.current = true;
        gestationReadyRef.current = false;
      }
      if (!gestationReadyRef.current) {
        if (!gestationResumeRef.current) gestationResumeRef.current = startAudio(true);
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
      setAudioState("locked");
      audioRef.current.endGestation();
      setRuntimeError(error instanceof Error ? error.message : "The forming voice could not start");
    }
  }, [audioState, startAudio]);

  const handleBodyGesture = useCallback((event) => {
    if (isListener) return;
    if (eventCountRef.current >= MAX_SCORE_EVENTS) {
      setRuntimeError("This performance is full. Share it, then begin a new one.");
      return;
    }
    if (event.at > 3600) {
      setRuntimeError("This performance has reached one hour");
      return;
    }
    eventCountRef.current += 1;
    shareRequestRef.current += 1;
    setShareLink("");
    setInscribed(null);
    setComposition((current) => ({ ...current, events: [...current.events, event] }));
  }, [isListener]);

  const saveShareScore = useCallback(async (score) => {
    const requestId = shareRequestRef.current + 1;
    shareRequestRef.current = requestId;
    setShareLink("");
    setDialogStatus("SAVING UNIVERSE");
    try {
      const link = await persistComposition(score);
      if (shareRequestRef.current !== requestId) return null;
      setShareLink(link);
      setDialogStatus("SHORT LINK READY");
      return link;
    } catch (error) {
      if (shareRequestRef.current !== requestId) return null;
      setDialogStatus("UNIVERSE COULD NOT BE SAVED");
      setRuntimeError(error instanceof Error ? error.message : "The universe could not be saved");
      throw error;
    }
  }, []);

  useEffect(() => {
    if (!isListener
      || !inscribed
      || !dialogOpen
      || shareLink
      || storedScoreState !== "idle") return;
    saveShareScore(inscribed).catch(() => {
      // The dialog keeps the failed state and offers another explicit share attempt.
    });
  }, [
    dialogOpen,
    inscribed,
    isListener,
    saveShareScore,
    shareLink,
    storedScoreState,
  ]);

  const handleInscribe = useCallback(async () => {
    cancelDirectGestures();
    setIsPlaying(false);
    intentionalPauseRef.current = true;
    await audioRef.current.suspend();
    setAudioState("paused");
    const next = {
      ...composition,
      createdAt: new Date().toISOString(),
      duration: recordingDuration(elapsed, composition.events),
      preferredTheme: themeId,
    };
    setComposition(next);
    setInscribed(next);
    setDialogStatus("");
    setDialogOpen(true);
    try {
      await saveShareScore(next);
    } catch {
      // saveShareScore exposes the failure in both the dialog and the live alert.
    }
  }, [cancelDirectGestures, composition, elapsed, saveShareScore, themeId]);

  const updateMessage = useCallback((message) => {
    shareRequestRef.current += 1;
    setShareLink("");
    setDialogStatus("NOTE CHANGED · SAVE A NEW LINK");
    setComposition((current) => ({ ...current, message }));
    setInscribed((current) => ({ ...(current ?? composition), message }));
  }, [composition]);

  const copyLink = useCallback(async () => {
    if (!shareLink) {
      setDialogStatus("SAVE A SHORT LINK FIRST");
      return;
    }
    const result = await copyOrbitLink(shareLink);
    setDialogStatus(result.kind === "copied" ? "LINK COPIED" : "SELECT THE LINK, THEN COPY IT");
  }, [shareLink]);

  const share = useCallback(async () => {
    if (!shareLink) {
      setDialogStatus("SAVE A SHORT LINK FIRST");
      return;
    }
    const voices = recordedBodies
      .map((body) => COSMIC_VOICES[body.voice]?.label)
      .filter(Boolean)
      .join(" · ");
    const cosmicVoices = [...new Set(
      shareScore.events
        .filter((event) => event.kind === "cosmic-landmark")
        .map((event) => cosmicLandmarkById(event.landmarkId).name),
    )].join(" · ");
    const result = await shareOrbit({
      title: INSTRUMENT_TITLE,
      text: [
        shareScore.message,
        voices && `Planetary voices: ${voices}.`,
        cosmicVoices && `Cosmic voices: ${cosmicVoices}.`,
      ].filter(Boolean).join("\n"),
      url: shareLink,
    });
    if (result.kind === "cancelled") {
      setDialogStatus("");
      return;
    }
    setDialogStatus(result.kind === "shared"
      ? "UNIVERSE SHARED"
      : result.kind === "copied"
        ? "LINK COPIED. READY TO PASTE"
        : "SELECT THE LINK, THEN COPY IT");
  }, [recordedBodies, shareLink, shareScore]);

  const prepareShareLink = useCallback(async () => {
    try {
      await saveShareScore(shareScore);
    } catch {
      // saveShareScore exposes the durable storage error in the dialog.
    }
  }, [saveShareScore, shareScore]);

  const enterOrbit = useCallback(async () => {
    try {
      cancelDirectGestures();
      setIsPlaying(false);
      intentionalPauseRef.current = true;
      await audioRef.current.suspend();
      setAudioState("paused");
      const next = createReplyComposition(composition, physicsFrameRef.current, themeId);
      window.history.replaceState(null, "", window.location.pathname);
      shareRequestRef.current += 1;
      setShareLink("");
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
  }, [cancelDirectGestures, composition, themeId]);

  const deleteSelected = useCallback(() => {
    if (!selectedBodyId || isListener) return;
    cancelDirectGestures();
    setInteractionMode("compose");
    setRemoveCommand((current) => ({ id: current.id + 1, bodyId: selectedBodyId }));
  }, [cancelDirectGestures, isListener, selectedBodyId]);

  const toggleMoonCreation = useCallback(() => {
    if (isListener || selectedBody?.kind !== "planet" || selectedMoonCount >= 2) return;
    if (liveBodies.length >= MAX_WORLDS) {
      setRuntimeError("The sky is full. Remove a world before adding another.");
      return;
    }
    cancelDirectGestures();
    setInteractionMode((current) => (current === "moon" ? "compose" : "moon"));
  }, [
    cancelDirectGestures,
    isListener,
    liveBodies.length,
    selectedBody,
    selectedMoonCount,
  ]);

  const retryStoredScore = useCallback(() => {
    try {
      const id = readStoredScoreId();
      if (!id) throw new Error("This page has no shared universe id");
      loadStoredScore(id);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : "The shared universe could not open");
    }
  }, [loadStoredScore]);

  const startFreshUniverse = useCallback(() => {
    window.history.replaceState(null, "", window.location.pathname);
    loadScore(null);
    setStoredScoreState("idle");
    setRuntimeError(null);
  }, [loadScore]);

  return (
    <main
      className="app-shell simple-instrument"
      data-theme="lacquer"
      data-live-body-count={liveBodies.length}
      data-live-moon-count={liveBodies.filter((body) => body.kind === "moon").length}
      data-playing={isPlaying}
      data-audio-state={audioState}
      data-camera-scale={cameraScale}
      data-cosmic-scale={cosmicScale.id}
      data-interaction-mode={interactionMode}
      data-journey-state={journeyTarget ? "travelling" : arrivalTarget ? "arrived" : "idle"}
      data-theremin-phase={thereminPhase}
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
        interactionCancelToken={interactionCancelToken}
        interactionMode={interactionMode}
        isPlaying={isPlaying}
        isListener={isListener}
        thereminBeaconVisible={
          showInstrumentLesson && lesson.showBeacon && lesson.step === 2
        }
        playbackEvents={composition.events}
        removeCommand={removeCommand}
        resetToken={resetToken}
        selectedBodyId={selectedBodyId}
        onBirthBloom={handleBirthBloom}
        onBirthRefused={setRuntimeError}
        onAudioUnlock={handleAudioUnlock}
        onBodyAudition={handleBodyAudition}
        onBodyGesture={handleBodyGesture}
        onBodySelect={setSelectedBodyId}
        onCameraNavigate={handleCameraNavigate}
        onCameraScale={setCameraScale}
        onCosmicAudition={handleCosmicAudition}
        onCosmicScale={handleCosmicScale}
        onConsumptionBloom={handleConsumptionBloom}
        onElapsed={handleElapsed}
        onGestationTone={handleGestationTone}
        onHaptic={performHaptic}
        onLaunchComplete={setSelectedBodyId}
        onLaunchPhase={() => {}}
        onMoonBloom={handleMoonBloom}
        onMoonComplete={(_bodyId, parentId) => {
          setInteractionMode("compose");
          setSelectedBodyId(parentId);
        }}
        onMoonPhase={() => {}}
        onNote={handleNote}
        onPhysicsFrame={handlePhysicsFrame}
        onPluckBloom={handlePluckBloom}
        onTheremin={handleTheremin}
      />

      <header className="soundflight-title simple-title">
        <h1>WAI<br />GRAMOPHONE</h1>
        <p>DRAW ORBITS · HEAR GRAVITY</p>
      </header>

      {!dialogOpen && storedScoreState === "idle" && (
        <button
          type="button"
          className="playing-guide-trigger"
          ref={guideTriggerRef}
          aria-expanded={guideOpen}
          aria-controls="playing-guide"
          onClick={openGuide}
        >
          <i aria-hidden="true">?</i>
          <span>HOW TO PLAY</span>
        </button>
      )}

      {storedScoreState !== "idle" && (
        <section
          className="stored-score-state"
          role={storedScoreState === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          <small>SHARED UNIVERSE</small>
          <strong>{storedScoreState === "loading"
            ? "OPENING THE ORBIT"
            : "THIS UNIVERSE COULD NOT ARRIVE"}</strong>
          <span>{storedScoreState === "loading"
            ? "Restoring every world, moon, silence and cosmic voice"
            : "Check the link or try opening it again"}</span>
          {storedScoreState === "error" && (
            <div>
              <button type="button" onClick={retryStoredScore}>TRY AGAIN</button>
              <button type="button" onClick={startFreshUniverse}>NEW UNIVERSE</button>
            </div>
          )}
        </section>
      )}

      {!dialogOpen && storedScoreState === "idle" && (
        <>
          <section className="instrument-guidance" aria-live="polite">
            {showInstrumentLesson && (
              <small>
                PLAY LESSON {lesson.step} OF {lesson.total} · {lesson.label}
              </small>
            )}
            <strong>{activeGuidance}</strong>
            <span>{activeGuidanceDetail}</span>
          </section>

          {showInstrumentLesson && lesson.showBeacon && lesson.step === 2 && (
            <div className="theremin-beacon" aria-hidden="true">
              <i />
              <span>
                <small>LIGHT THEREMIN</small>
                <strong>HOLD HERE</strong>
              </span>
              <b>POWER ↑</b>
              <em>PITCH →</em>
            </div>
          )}

          {selectedBody && !isListener && interactionMode !== "explore" && (
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
              {selectedBody.kind === "planet" && selectedMoonCount < 2 && (
                <button
                  type="button"
                  className="instrument-selection__moon"
                  aria-label={interactionMode === "moon"
                    ? `Cancel moon creation for ${bodyLabel(selectedBody)}`
                    : `Add moon to ${bodyLabel(selectedBody)}`}
                  aria-pressed={interactionMode === "moon"}
                  onClick={toggleMoonCreation}
                >
                  <Plus aria-hidden="true" weight="thin" />
                  <span>{interactionMode === "moon" ? "CANCEL" : "ADD MOON"}</span>
                </button>
              )}
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
              aria-label={playback.ariaLabel}
              aria-pressed={playback.pressed}
              onClick={handleTogglePlayback}
            >
              {playback.icon === "pause"
                ? <Pause aria-hidden="true" weight="fill" />
                : <Play aria-hidden="true" weight="fill" />}
              <span>{playback.label}</span>
            </button>
            <button
              type="button"
              className="instrument-share"
              onClick={isListener ? openListenerShare : handleInscribe}
              disabled={!isListener && liveBodies.length === 0 && composition.events.length === 0}
            >
              <ShareNetwork aria-hidden="true" weight="thin" />
              <span>SHARE</span>
            </button>
            <button
              type="button"
              className="instrument-flight"
              aria-label={interactionMode === "explore"
                ? "Return to the music"
                : "Look around the current world"}
              aria-pressed={interactionMode === "explore"}
              onClick={handleToggleExplore}
              disabled={interactionMode === "moon" || Boolean(journeyTarget)}
            >
              {interactionMode === "explore"
                ? <CrosshairSimple aria-hidden="true" weight="thin" />
                : <NavigationArrow aria-hidden="true" weight="thin" />}
              <span>{interactionMode === "explore" ? "BACK TO MUSIC" : "LOOK AROUND"}</span>
            </button>
          </nav>

          <aside
            className="cosmic-lens"
            aria-label="Cosmic lens"
            aria-busy={Boolean(journeyTarget)}
          >
            <header>
              <span>UNIVERSE MAP · {currentDestinationIndex + 1} OF {cosmicDestinations.length}</span>
              <strong>{journeyTarget ? "IN FLIGHT" : currentDestination.label}</strong>
            </header>
            {(journeyTarget || nextDestination || cosmicJourney.home) && (
              <button
                type="button"
                className="cosmic-lens__next"
                aria-label={`Travel to ${
                  journeyTarget
                    ? cosmicDestination(journeyTarget).label
                    : (nextDestination ?? cosmicJourney.home).label
                }`}
                disabled={Boolean(journeyTarget)}
                onClick={() => handleCosmicTravel((nextDestination ?? cosmicJourney.home).id)}
              >
                <span>{journeyTarget
                  ? "FLYING TO"
                  : nextDestination
                    ? "NEXT FLIGHT"
                    : "RETURN HOME"}</span>
                <strong>{journeyTarget
                  ? cosmicDestination(journeyTarget).label
                  : (nextDestination ?? cosmicJourney.home).label}</strong>
                {nextDestination
                  ? <ArrowRight aria-hidden="true" weight="thin" />
                  : <House aria-hidden="true" weight="thin" />}
              </button>
            )}
            <nav className="cosmic-lens__stops" aria-label="Choose a cosmic scale">
              {cosmicDestinations.map((destination, index) => {
                const active = !journeyTarget && currentDestination.id === destination.id;
                const invited = destination.id === nextDestination?.id;
                const isJourneyTarget = journeyTarget === destination.id;
                return (
                  <button
                    key={destination.id}
                    type="button"
                    aria-current={active ? "location" : undefined}
                    aria-label={`Travel to ${destination.label}`}
                    className={[
                      active ? "is-active" : "",
                      isJourneyTarget ? "is-journey-target" : "",
                    ].filter(Boolean).join(" ")}
                    data-invited={invited || undefined}
                    disabled={Boolean(journeyTarget)}
                    onClick={() => handleCosmicTravel(destination.id)}
                  >
                    <i aria-hidden="true">{String(index + 1).padStart(2, "0")}</i>
                    <span>{destination.id === "system" ? "MY SYSTEM" : destination.label}</span>
                    {destination.id === "system"
                      ? <House aria-hidden="true" weight="thin" />
                      : <ArrowRight aria-hidden="true" weight="thin" />}
                  </button>
                );
              })}
            </nav>
            <footer>
              <span>{currentDestination.measure}</span>
              <nav className="cosmic-zoom" aria-label="Fine cosmic zoom">
                <button
                  type="button"
                  onClick={() => handleZoom(-1)}
                  aria-label="Zoom closer"
                  disabled={Boolean(journeyTarget)}
                >
                  <Plus aria-hidden="true" weight="thin" />
                </button>
                <button
                  type="button"
                  onClick={() => handleZoom(1)}
                  aria-label="Zoom farther"
                  disabled={Boolean(journeyTarget)}
                >
                  <Minus aria-hidden="true" weight="thin" />
                </button>
              </nav>
            </footer>
          </aside>

          <nav
            className="cosmic-zoom cosmic-zoom--mobile"
            aria-label="Fine cosmic zoom"
          >
            <button
              type="button"
              onClick={() => handleZoom(-1)}
              aria-label="Zoom closer"
              disabled={Boolean(journeyTarget)}
            >
              <Plus aria-hidden="true" weight="thin" />
            </button>
            <button
              type="button"
              onClick={() => handleZoom(1)}
              aria-label="Zoom farther"
              disabled={Boolean(journeyTarget)}
            >
              <Minus aria-hidden="true" weight="thin" />
            </button>
          </nav>

          <div
            className={`soundflight-voice-breath simple-voice-breath${sonicCue ? " is-cue" : ""}`}
            aria-live="polite"
          >
            <span>{sonicCue || (audioState !== "running"
              ? "SOUND OFF · TAP START SOUND"
              : isPlaying
              ? liveBodies.length > 0
                ? `${liveBodies.length} VOICES · ${cosmicScale.label}`
                : cosmicScale.id === "orbit" || cosmicScale.id === "system"
                  ? "SOLAR DRONE · LIVE"
                  : `${currentDestination.label} · CHOIR LIVE`
              : "PINCH OR SCROLL TO CROSS SCALES")}</span>
          </div>
        </>
      )}

      {guideOpen && (
        <div
          className="playing-guide-backdrop"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) closeGuide();
          }}
        >
          <section
            ref={guideDialogRef}
            id="playing-guide"
            className="playing-guide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="playing-guide-title"
            tabIndex={-1}
          >
            <button
              type="button"
              className="playing-guide__close"
              aria-label="Close how to play"
              onClick={closeGuide}
            >
              ×
            </button>
            <small>HOW TO PLAY</small>
            <h2 id="playing-guide-title">FOUR MOVES. ONE UNIVERSE.</h2>
            <ol>
              <li>
                <span>01</span>
                <div>
                  <strong>MAKE A WORLD</strong>
                  <p>Hold the star. Pull outward. Release. Select a planet and tap ADD MOON when you want a satellite.</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>PLAY AN ORBIT</strong>
                  <p>Swipe across a glowing orbit. It is a string, and every planet gives it a different voice.</p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>PLAY THE LIGHT THEREMIN</strong>
                  <p>Hold the pulsing light. Keep holding, then move: left and right change pitch, up and down change power.</p>
                </div>
              </li>
              <li>
                <span>04</span>
                <div>
                  <strong>FLY</strong>
                  <p>Tap NEXT FLIGHT to move outward one world at a time. MY SYSTEM always brings you home.</p>
                </div>
              </li>
            </ol>
            <button
              type="button"
              className="playing-guide__start"
              autoFocus
              onClick={closeGuide}
            >
              START PLAYING
            </button>
          </section>
        </div>
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
        soundLocked={audioState !== "running"}
        resonances={shareScore.resonances}
        onClose={closeDialog}
        onCopy={copyLink}
        onEnterOrbit={enterOrbit}
        onListen={startListenerPlayback}
        onMessageChange={updateMessage}
        onSave={prepareShareLink}
        onShare={share}
        status={dialogStatus}
      />
    </main>
  );
}
