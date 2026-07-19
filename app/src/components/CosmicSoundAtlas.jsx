import { useEffect, useRef } from "react";
import { WaveSine, X } from "@phosphor-icons/react";

import { COSMIC_VOICES, COSMIC_VOICE_ORDER } from "../lib/sonification.js";
import { RESONANCE_TARGETS } from "../lib/gameProgress.js";

const BODY_LABELS = Object.freeze({ io: "I", europa: "II", callisto: "III" });

function bodyLabel(bodyId) {
  return BODY_LABELS[bodyId] ?? `N${bodyId.split("-")[1] ?? "?"}`;
}

function isBornWorld(bodyId) {
  return !Object.hasOwn(BODY_LABELS, bodyId);
}

export function CosmicSoundAtlas({
  bodies,
  capturedResonances,
  challengeGuide,
  challengeStatus,
  challengeTarget,
  isListener,
  onBodySelect,
  onChallengeSelect,
  onClose,
  onToggle,
  onVoiceSelect,
  open,
  selectedBodyId,
}) {
  const rootRef = useRef(null);
  const selectedBody = bodies.find((body) => body.id === selectedBodyId) ?? bodies[0];
  const currentLock = challengeGuide?.proximity ?? 0;

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) onClose();
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [onClose, open]);

  return (
    <div className="sound-atlas-control" ref={rootRef}>
      <button
        type="button"
        className="icon-button sound-atlas-trigger"
        aria-controls="cosmic-sound-atlas"
        aria-expanded={open}
        aria-label={open ? "Close cosmic sound atlas" : "Open cosmic sound atlas"}
        onClick={onToggle}
      >
        <WaveSine aria-hidden="true" weight="thin" />
      </button>

      {open && (
        <aside id="cosmic-sound-atlas" className="sound-atlas-panel" aria-label="Cosmic sound atlas">
          <div className="atlas-heading">
            <div>
              <span>COSMIC SONIFICATION</span>
              <strong>ORBIT {bodyLabel(selectedBody.id)} · {COSMIC_VOICES[selectedBody.voice].label}</strong>
            </div>
            <button type="button" className="atlas-close" aria-label="Close cosmic sound atlas" onClick={onClose}>
              <X aria-hidden="true" weight="thin" />
            </button>
          </div>

          <div className="body-selector" role="tablist" aria-label="Select an orbital body">
            {bodies.map((body) => (
              <button
                type="button"
                role="tab"
                aria-selected={selectedBody.id === body.id}
                aria-label={`Orbit ${bodyLabel(body.id)}, voice ${COSMIC_VOICES[body.voice].label}`}
                className="body-selector-option"
                key={body.id}
                onClick={() => onBodySelect(body.id)}
              >
                {bodyLabel(body.id)} · {COSMIC_VOICES[body.voice].label}
              </button>
            ))}
          </div>

          <div className="voice-grid" aria-label="Choose a cosmic voice">
            {COSMIC_VOICE_ORDER.map((voiceId) => {
              const voice = COSMIC_VOICES[voiceId];
              const active = selectedBody.voice === voiceId;
              return (
                <button
                  type="button"
                  className="voice-card"
                  aria-pressed={active}
                  key={voiceId}
                  onClick={() => onVoiceSelect(voiceId)}
                >
                  <span className="voice-card-topline">
                    <strong>{voice.label}</strong>
                    <i aria-hidden="true" />
                  </span>
                  <span>{voice.channel}</span>
                  <small>{voice.explanation}</small>
                </button>
              );
            })}
          </div>

          <p className="atlas-truth">
            {isListener
              ? "AUDITION ONLY · THE RECEIVED RECORD STAYS INTACT"
              : isBornWorld(selectedBody.id)
                ? "AUDITION ONLY · A BORN WORLD KEEPS ITS BIRTH VOICE"
                : "TAP TO AUDITION + IMPRINT"}
            <span>SONIFICATION — NOT AIRBORNE SOUND IN VACUUM.</span>
          </p>

          <section className="orbit-game" aria-labelledby="orbit-game-title">
            <div className="orbit-game-heading">
              <div>
                <span id="orbit-game-title">ORBIT GAME</span>
                <strong>CATCH A RESONANCE</strong>
              </div>
              <output aria-live="polite">{challengeStatus}</output>
            </div>
            <div className="resonance-targets" aria-label="Choose a resonance target">
              {RESONANCE_TARGETS.map((target) => (
                <button
                  type="button"
                  aria-pressed={challengeTarget === target}
                  aria-label={`${target} resonance${capturedResonances.includes(target) ? ", sealed" : ""}`}
                  className={capturedResonances.includes(target) ? "is-captured" : undefined}
                  disabled={isListener}
                  key={target}
                  onClick={() => onChallengeSelect(target)}
                >
                  <span>{target}</span>
                  <small>{capturedResonances.includes(target) ? "SEALED" : "OPEN"}</small>
                </button>
              ))}
            </div>
            <div className="resonance-meter" aria-label={`${Math.round(currentLock * 100)} percent resonance lock`}>
              <span style={{ "--lock": currentLock }} />
            </div>
            <p>{isListener ? "ANSWER WITH ORBIT TO MOVE WORLDS AND PLAY" : "DRAG ANY WORLD · MUSIC BRIGHTENS NEAR THE LIVE PERIOD RATIO · HOLD ABOVE 82% LOCK"}</p>
          </section>
        </aside>
      )}
    </div>
  );
}
