import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DotsThree,
  House,
  NavigationArrow,
  Pause,
  Play,
  ShareNetwork,
  Trash,
  Waveform,
  X,
} from "@phosphor-icons/react";

import { InscriptionDialog } from "./components/InscriptionDialog.jsx";
import { SoundflightStage } from "./components/SoundflightStage.jsx";
import { AudioEngine } from "./lib/audioEngine.js";
import {
  createBlankComposition,
  createDefaultComposition,
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
  cosmicDestination,
  cosmicJourneyForScale,
  cosmicLandmarkById,
  cosmicScaleForDistance,
  NEIGHBOURHOOD_SHELLS,
  thereminParameters,
} from "./lib/cosmicInstrument.js";
import { periodFromReference } from "./lib/cosmicAtlas.js";
import { COSMIC_VOICES, hapticPattern, voiceParameters } from "./lib/sonification.js";
import {
  frequencyToNoteName,
  INITIAL_PLAYBACK,
  INSTRUMENT_TITLE,
  instrumentGuidanceDetail,
  instrumentHint,
  instrumentLesson,
  playbackControl,
  reconcileAudioState,
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
  // The instrument opens with worlds already turning. A star alone is not an
  // instrument: it has no strings to pluck, no orbits to touch and nothing to
  // hear, and "there is effectively only one planetary system" is a fair
  // description of that first frame. The core trio AGENTS.md calls permanent
  // is what the blank variant was deleting.
  const [composition, setComposition] = useState(initial.score ?? createDefaultComposition);
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
  const [visitedSystemId, setVisitedSystemId] = useState(null);
  const [shellIndex, setShellIndex] = useState(0);
  const [guestWorlds, setGuestWorlds] = useState(() => new Map());
  const [guestPreview, setGuestPreview] = useState(null);
  const [journeyTarget, setJourneyTarget] = useState(null);
  const [arrivalTarget, setArrivalTarget] = useState(null);
  const [interactionMode, setInteractionMode] = useState("compose");
  const [hasPluckedOrbit, setHasPluckedOrbit] = useState(false);
  const [thereminPhase, setThereminPhase] = useState("idle");
  const [hasPlayedTheremin, setHasPlayedTheremin] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [lightOpen, setLightOpen] = useState(false);
  const [utilityOpen, setUtilityOpen] = useState(false);
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
  const thereminPadPointerRef = useRef(null);

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
    setUtilityOpen(false);
    setGuideOpen(true);
  }, [cancelDirectGestures]);

  const closeGuide = useCallback(() => {
    setGuideOpen(false);
  }, []);

  const openListenerShare = useCallback(() => {
    cancelDirectGestures();
    setUtilityOpen(false);
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
    setLightOpen(false);
    setUtilityOpen(false);
    setCameraScale("1.2 AU");
    setCosmicScale(cosmicScaleForDistance(10));
    setVisitedSystemId(null);
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
  const currentDestination = cosmicDestination(
    cosmicScale.id === "orbit" ? "system" : cosmicScale.id,
  );
  const visitedSystem = visitedSystemId ? cosmicLandmarkById(visitedSystemId) : null;
  const hasCosmicScore = isListener
    && composition.events.some((event) => event.kind === "cosmic-landmark");
  const isAwaitingCosmicScore = hasCosmicScore
    && liveBodies.length === 0
    && (cosmicScale.id === "orbit" || cosmicScale.id === "system")
    && !journeyTarget;
  const shell = NEIGHBOURHOOD_SHELLS[shellIndex] ?? NEIGHBOURHOOD_SHELLS[0];
  const inNeighbourhood = currentDestination.id === "neighborhood" && !visitedSystem;
  const cosmicJourney = cosmicJourneyForScale(currentDestination.id);
  const nextDestination = visitedSystem
    ? cosmicDestination("galaxy")
    : cosmicJourney.outward;
  const nextShell = inNeighbourhood && shellIndex < NEIGHBOURHOOD_SHELLS.length - 1
    ? NEIGHBOURHOOD_SHELLS[shellIndex + 1]
    : null;
  const flightLabel = nextShell
    ? nextShell.label.replace(/^THE /u, "")
    : nextDestination
      ? {
          neighborhood: "STARS",
          galaxy: "MILKY WAY",
          localGroup: "GALAXIES",
          universe: "UNIVERSE",
        }[nextDestination.id] ?? nextDestination.label
      : "";
  const guidance = instrumentHint({
    planetCount: planets.length,
    selectedBody,
    isListener,
    hasPluckedOrbit,
    thereminPhase,
    hasPlayedTheremin,
  });
  const guidanceDetail = instrumentGuidanceDetail({
    planetCount: planets.length,
    selectedBody,
    isListener,
    hasPluckedOrbit,
    thereminPhase,
    hasPlayedTheremin,
  });
  const lesson = instrumentLesson({
    audioState,
    planetCount: planets.length,
    hasPluckedOrbit,
    thereminPhase,
    hasPlayedTheremin,
  });
  const showInstrumentLesson = Boolean(
    lesson
    && !isListener
    && currentDestination.id === "system"
    && !visitedSystem
    && interactionMode === "compose"
    && !journeyTarget,
  );
  const onboardingComplete = isListener || !lesson;
  const activeGuidance = showInstrumentLesson
    ? lesson.instruction
    : journeyTarget
    ? `FLYING TO ${cosmicDestination(journeyTarget).label}`
    : arrivalTarget
      ? `YOU ARE IN ${arrivalTarget === "neighborhood" ? shell.label : cosmicDestination(arrivalTarget).label}`
    : visitedSystem
      ? visitedSystem.name
    : isAwaitingCosmicScore
        ? "A SHARED UNIVERSE IS READY"
      : inNeighbourhood
        ? shell.guidance
    : cosmicScale.id === "orbit" || cosmicScale.id === "system"
        ? guidance
        : currentDestination.guidance;
  const activeGuidanceDetail = showInstrumentLesson
    ? lesson.detail
    : journeyTarget
    ? "YOUR CURRENT WORLD IS BECOMING ONE LIGHT"
    : arrivalTarget
      ? arrivalTarget === "system"
        ? planets.length > 0
          ? "TOUCH A GLOWING ORBIT TO PLAY IT"
          : "HOLD THE STAR · PULL OUTWARD · RELEASE"
        : "TOUCH A BRIGHT REGION TO HEAR IT"
    : visitedSystem
      ? guestPreview
        ? `YOUR WORLD AT ${guestPreview.orbitAu < 0.1
            ? guestPreview.orbitAu.toFixed(3)
            : guestPreview.orbitAu.toFixed(2)} AU · RELEASE TO HEAR IT`
        : `TOUCH A WORLD TO HEAR ITS YEAR · DRAG FROM THE STAR TO ADD YOUR OWN`
    : isAwaitingCosmicScore
        ? "LISTEN · THE CAMERA FOLLOWS EACH COSMIC VOICE"
      : inNeighbourhood
        ? `${shell.measure} · ${shell.guidanceDetail}`
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
    const reconciliation = reconcileAudioState({
      engineState: state,
      intentionalPause: intentionalPauseRef.current,
    });
    setAudioState(reconciliation.audioState);
    if (reconciliation.shouldSuspend) {
      audioRef.current.suspend().catch(() => setAudioState("locked"));
    }
  }), []);

  useEffect(() => {
    const recoverSound = async () => {
      if (document.visibilityState !== "visible"
        || intentionalPauseRef.current
        || !isPlaying
        || audioRef.current.getState() === "uninitialized") return;
      try {
        await audioRef.current.resume(true);
        setAudioState("running");
        setRuntimeError(null);
      } catch {
        setAudioState("locked");
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (!intentionalPauseRef.current && isPlaying) {
          audioRef.current.suspend().catch(() => setAudioState("locked"));
        }
        return;
      }
      recoverSound();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pageshow", recoverSound);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pageshow", recoverSound);
    };
  }, [isPlaying]);

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
    // Sound that is already running does not need to be started again, and
    // re-running the gesture handshake would put its clock-verification probe
    // in front of every single note. An instrument has to answer immediately.
    // Deliberately does not touch the field: whether the continuous voice of
    // the system is sounding belongs to the transport, and a single note must
    // not switch it on under a paused transport or off under a playing one.
    if (audioRef.current.getState() === "running") return Promise.resolve("running");
    let request;
    request = audioRef.current.activateFromGesture(activateField)
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

  const handleCosmicTravel = useCallback((targetId) => {
    if (journeyTargetRef.current) return;
    cancelDirectGestures();
    const destination = cosmicDestination(targetId);
    setVisitedSystemId(null);
    setSelectedBodyId(null);
    if (targetId !== "neighborhood") setShellIndex(0);
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

  const handlePrimaryFlight = useCallback(() => {
    // The nearby sky is four shells deep. FLY walks outward through them before
    // it leaves for the galaxy, so the ladder stays one button in one
    // direction and every press is honestly "further from home".
    if (
      !visitedSystem
      && currentDestination.id === "neighborhood"
      && shellIndex < NEIGHBOURHOOD_SHELLS.length - 1
    ) {
      cancelDirectGestures();
      setShellIndex((current) => current + 1);
      setSelectedBodyId(null);
      return;
    }
    if (visitedSystem || currentDestination.id !== "neighborhood") setShellIndex(0);
    handleCosmicTravel(nextDestination?.id ?? "system");
  }, [
    cancelDirectGestures,
    currentDestination.id,
    handleCosmicTravel,
    nextDestination,
    shellIndex,
    visitedSystem,
  ]);

  const handleOpenLight = useCallback(() => {
    cancelDirectGestures();
    setUtilityOpen(false);
    setInteractionMode("light");
    startAudio(true)
      .then(() => {
        setIsPlaying(true);
        setLightOpen(true);
        setRuntimeError(null);
      })
      .catch((error) => {
        setAudioState("locked");
        setRuntimeError(error instanceof Error ? error.message : "The light could not sound");
      });
  }, [cancelDirectGestures, startAudio]);

  const handleCloseLight = useCallback(() => {
    thereminPadPointerRef.current = null;
    cancelTheremin();
    setLightOpen(false);
    setInteractionMode("compose");
  }, [cancelTheremin]);

  const thereminPadParameters = useCallback((event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    event.currentTarget.style.setProperty(
      "--theremin-x",
      `${Math.min(92, Math.max(8, (x / bounds.width) * 100))}%`,
    );
    event.currentTarget.style.setProperty(
      "--theremin-y",
      `${Math.min(92, Math.max(8, (y / bounds.height) * 100))}%`,
    );
    return thereminParameters({
      x,
      y,
      width: bounds.width,
      height: bounds.height,
    });
  }, []);

  const handleThereminPadStart = useCallback((event) => {
    if (thereminPadPointerRef.current !== null) return;
    thereminPadPointerRef.current = event.pointerId;
    if (event.pointerType === "mouse") {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    handleTheremin({
      phase: "prepare",
      parameters: thereminPadParameters(event),
    });
  }, [handleTheremin, thereminPadParameters]);

  const handleThereminPadMove = useCallback((event) => {
    if (thereminPadPointerRef.current !== event.pointerId) return;
    handleTheremin({
      phase: "update",
      parameters: thereminPadParameters(event),
    });
  }, [handleTheremin, thereminPadParameters]);

  const handleThereminPadEnd = useCallback((event) => {
    if (thereminPadPointerRef.current !== event.pointerId) return;
    thereminPadPointerRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    handleTheremin({ phase: "end" });
    event.currentTarget.style.setProperty("--theremin-x", "50%");
    event.currentTarget.style.setProperty("--theremin-y", "50%");
  }, [handleTheremin]);

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
      if (landmark.system) {
        setVisitedSystemId(landmark.id);
        setSelectedBodyId(null);
        setCameraCommand((current) => ({
          id: current.id + 1,
          type: "focus-system",
          landmarkId: landmark.id,
        }));
      }
      setIsPlaying(true);
      setDialogOpen(false);
      setRuntimeError(null);
      announceSonicCue(
        landmark.system
          ? `${landmark.name} · ${landmark.system.label}`
          : `${landmark.name} · ${landmark.detail}`,
        2800,
      );
    } catch (error) {
      setAudioState("locked");
      setRuntimeError(error instanceof Error ? error.message : "The cosmic voice could not start");
    }
  }, [announceSonicCue, startAudio]);

  /**
   * A world the player adds to a real system.
   *
   * Its period comes from that system's own Kepler constant, inverted from one
   * of its measured worlds, so no stellar mass is assumed and the answer is
   * exact. It joins the system's chord at the pitch its period earns — which is
   * the whole point: you can hear where a world of your own would sit inside
   * TRAPPIST-1's rhythm.
   */
  const handleGuestWorld = useCallback(async ({ landmark, orbitAu }) => {
    try {
      const reference = landmark.system.bodies[0];
      const periodDays = periodFromReference(orbitAu, reference);
      const index = (guestWorlds.get(landmark.id)?.length ?? 0) + 1;
      const world = Object.freeze({
        id: `${landmark.id}-yours-${index}`,
        name: `YOUR WORLD ${index}`,
        kind: "planet",
        periodDays,
        orbitAu,
        radiusEarth: 1,
        eccentricity: 0,
        guest: true,
      });
      setGuestWorlds((current) => {
        const next = new Map(current);
        next.set(landmark.id, [...(current.get(landmark.id) ?? []), world]);
        return next;
      });
      await startAudio(true);
      const bodies = [...landmark.system.bodies, world]
        .sort((first, second) => first.periodDays - second.periodDays);
      audioRef.current.playSystemWorld(
        { ...landmark, system: { ...landmark.system, bodies } },
        world.id,
      );
      const year = periodDays >= 365
        ? `${(periodDays / 365.25).toFixed(1)} YEARS`
        : `${periodDays >= 10 ? periodDays.toFixed(0) : periodDays.toFixed(1)} DAYS`;
      announceSonicCue(`YOUR WORLD IN ${landmark.name} · ${year}`, 3000);
      performHaptic({ kind: "birth", strength: 0.7 });
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : "That world could not form");
    }
  }, [announceSonicCue, guestWorlds, performHaptic, startAudio]);

  /** One world of a visited system, touched on its own. */
  const handleSystemWorldAudition = useCallback(async ({ landmark, planetId }) => {
    try {
      await startAudio(true);
      const voice = audioRef.current.playSystemWorld(landmark, planetId);
      if (!voice) return;
      const days = voice.planet.periodDays;
      const year = days >= 365
        ? `${(days / 365.25).toFixed(days / 365.25 >= 10 ? 0 : 1)} YEARS`
        : `${days >= 10 ? days.toFixed(0) : days.toFixed(1)} DAYS`;
      announceSonicCue(
        `${voice.planet.name.toUpperCase()} · ${year} · ${voice.appearance.label}`,
        2600,
      );
      performHaptic({ kind: "audition", strength: 0.7 });
    } catch (error) {
      setAudioState("locked");
      setRuntimeError(error instanceof Error ? error.message : "That world could not sound");
    }
  }, [announceSonicCue, performHaptic, startAudio]);

  useEffect(() => {
    const onEscape = (event) => {
      if (event.key !== "Escape") return;
      if (guideOpen) {
        setGuideOpen(false);
        return;
      }
      if (lightOpen) {
        handleCloseLight();
        return;
      }
      if (utilityOpen) {
        setUtilityOpen(false);
        return;
      }
      if (dialogOpen) return;
      if (visitedSystem) {
        handleCosmicTravel("neighborhood");
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
    handleCloseLight,
    handleCosmicTravel,
    lightOpen,
    utilityOpen,
    visitedSystem,
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
    setUtilityOpen(false);
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
    setUtilityOpen(false);
    setInteractionMode("compose");
    setRemoveCommand((current) => ({ id: current.id + 1, bodyId: selectedBodyId }));
  }, [cancelDirectGestures, isListener, selectedBodyId]);

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
      data-focused-system={visitedSystem?.id ?? ""}
      data-interaction-mode={interactionMode}
      data-journey-state={journeyTarget ? "travelling" : arrivalTarget ? "arrived" : "idle"}
      data-theremin-phase={thereminPhase}
      data-onboarding={onboardingComplete ? "complete" : `step-${lesson.step}`}
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
        thereminBeaconVisible={false}
        playbackEvents={composition.events}
        removeCommand={removeCommand}
        shellIndex={shellIndex}
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
        onSystemWorldAudition={handleSystemWorldAudition}
        onGuestWorld={handleGuestWorld}
        onGuestOrbitPreview={setGuestPreview}
        guestWorlds={guestWorlds}
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

      {!dialogOpen && storedScoreState === "idle" && !lightOpen && (
        <div className="instrument-topbar">
          <span className="instrument-location">
            {visitedSystem?.name ?? (inNeighbourhood ? shell.label : currentDestination.label)}
          </span>
          <button
            type="button"
            className="instrument-menu-trigger"
            aria-label="Open instrument menu"
            aria-expanded={utilityOpen}
            onClick={() => setUtilityOpen((current) => !current)}
          >
            <DotsThree aria-hidden="true" weight="bold" />
          </button>
        </div>
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
          {audioState === "locked" && (
            <button
              type="button"
              className="sound-gate"
              onClick={handleTogglePlayback}
              aria-label="Touch to hear the universe"
            >
              <Play aria-hidden="true" weight="fill" />
              <strong>TOUCH TO HEAR</strong>
              <span>ONE TAP STARTS THE UNIVERSE</span>
            </button>
          )}

          {audioState === "running"
            && !lightOpen
            && !utilityOpen
            && (
              showInstrumentLesson
              || Boolean(journeyTarget)
              || Boolean(arrivalTarget)
              || isAwaitingCosmicScore
              || Boolean(visitedSystem)
              || currentDestination.id !== "system"
            ) && (
            <section className="instrument-guidance" aria-live="polite">
              <strong>{activeGuidance}</strong>
              <span>{activeGuidanceDetail}</span>
            </section>
          )}

          {!lightOpen && audioState !== "locked" && (
          <nav className="instrument-controls minimal-controls" aria-label="Music controls">
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
            {currentDestination.id === "system" && !visitedSystem ? (
              <button
                type="button"
                className="instrument-light"
                onClick={handleOpenLight}
              >
                <Waveform aria-hidden="true" weight="thin" />
                <span>LIGHT</span>
              </button>
            ) : (
              <button
                type="button"
                className="instrument-home"
                aria-label={visitedSystem ? "Back to nearby stars" : "Return to my system"}
                onClick={() => handleCosmicTravel(visitedSystem ? "neighborhood" : "system")}
                disabled={Boolean(journeyTarget)}
              >
                <House aria-hidden="true" weight="thin" />
                <span>{visitedSystem ? "STARS" : "HOME"}</span>
              </button>
            )}
            {nextDestination && (
                <button
                  type="button"
                  className="instrument-flight"
                  aria-label={`Fly to ${nextDestination.label}`}
                  onClick={handlePrimaryFlight}
                  disabled={Boolean(journeyTarget)}
                >
                  <NavigationArrow aria-hidden="true" weight="thin" />
                  <span>{journeyTarget ? "FLYING" : flightLabel}</span>
                </button>
            )}
          </nav>
          )}

          {lightOpen && (
            <section className="light-instrument" aria-label="Light Theremin">
              <button
                type="button"
                className="light-instrument__back"
                onClick={handleCloseLight}
              >
                <X aria-hidden="true" weight="thin" />
                <span>BACK</span>
              </button>
              <div className="light-instrument__title">
                <strong>LIGHT</strong>
                <span>MOVE YOUR FINGER THROUGH SOUND</span>
              </div>
              <button
                type="button"
                className="light-instrument__field"
                aria-label="Move left and right for the note. Move up and down for intensity."
                onPointerDown={handleThereminPadStart}
                onPointerMove={handleThereminPadMove}
                onPointerUp={handleThereminPadEnd}
                onPointerCancel={handleThereminPadEnd}
              >
                <i aria-hidden="true" />
                <b>BRIGHTER</b>
                <em>NOTE</em>
              </button>
            </section>
          )}

          {utilityOpen && !lightOpen && (
            <div
              className="instrument-menu-backdrop"
              onPointerDown={(event) => {
                if (event.target === event.currentTarget) setUtilityOpen(false);
              }}
            >
              <section className="instrument-menu" role="dialog" aria-label="Instrument menu">
                <button
                  type="button"
                  className="instrument-menu__close"
                  aria-label="Close instrument menu"
                  onClick={() => setUtilityOpen(false)}
                >
                  <X aria-hidden="true" weight="thin" />
                </button>
                <strong>WAI GRAMOPHONE</strong>
                <button type="button" ref={guideTriggerRef} onClick={openGuide}>
                  <span>HOW TO PLAY</span>
                </button>
                <button
                  type="button"
                  onClick={isListener ? openListenerShare : handleInscribe}
                  disabled={!isListener && liveBodies.length === 0 && composition.events.length === 0}
                >
                  <ShareNetwork aria-hidden="true" weight="thin" />
                  <span>SHARE THIS UNIVERSE</span>
                </button>
                {selectedBody && !isListener && (
                  <button type="button" onClick={deleteSelected}>
                    <Trash aria-hidden="true" weight="thin" />
                    <span>REMOVE {bodyLabel(selectedBody)}</span>
                  </button>
                )}
              </section>
            </div>
          )}

          {sonicCue && !lightOpen && (
            <div className="soundflight-voice-breath simple-voice-breath is-cue" aria-live="polite">
              <span>{sonicCue}</span>
            </div>
          )}
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
            <h2 id="playing-guide-title">PLAY WITH FOUR MOVES.</h2>
            <ol>
              <li>
                <span>01</span>
                <div>
                  <strong>MAKE A PLANET</strong>
                  <p>Pull the star outward and release.</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>PLAY AN ORBIT</strong>
                  <p>Touch or swipe its glowing line like a string.</p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>MAKE A MOON</strong>
                  <p>Pull any planet outward and release.</p>
                </div>
              </li>
              <li>
                <span>04</span>
                <div>
                  <strong>PLAY WITH LIGHT OR FLY</strong>
                  <p>Light opens the theremin. The named flight button and a pinch move through cosmic scales; touch a nearby star to enter it.</p>
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
