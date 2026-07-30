import { X } from "@phosphor-icons/react";

import { COSMIC_VOICES } from "../lib/sonification.js";
import { systemVoiceFit, systemVoiceFrequencies, lightCurveBreathSeconds } from "../lib/cosmicAtlas.js";
import { PULSAR_BEAM_DIVISION } from "../lib/variableStars.js";
import { frequencyToNoteName } from "../lib/soundflight.js";
import { findResonanceChains } from "../lib/physicsEngine.js";

/**
 * The honesty lens: every voice in the instrument shows its own number. An
 * orbit's pitch is its period through one formula, a system's chord is fitted
 * by one stated compression, a pulsar is multiplied by exactly one, and a
 * cepheid's breath is compressed by one stated factor — the doctrine has a
 * surface now, not just a promise.
 */
export function SonificationLens({
  open,
  onClose,
  selectedBody,
  visitedSystem,
  guestWorlds,
  physicsFrame,
  resonances,
}) {
  if (!open) return null;

  const periodicBodies = (physicsFrame?.bodies ?? [])
    .filter((body) => Number.isFinite(body?.period) && body.period > 0);
  const chains = findResonanceChains(periodicBodies);
  const ladder = chains.find((chain) => chain.memberIds.length >= 3);
  const liveResonance = physicsFrame?.resonance;

  const oscillation = visitedSystem?.system?.star?.oscillation ?? null;
  const liveLockText = liveResonance?.label
    ? `${liveResonance.label} · LOCK ${(liveResonance.strength * 100).toFixed(0)}%`
    : "NO LIVE LOCK";
  const effectiveBodies = visitedSystem
    ? [...visitedSystem.system.bodies, ...(guestWorlds ?? [])]
      .sort((first, second) => first.periodDays - second.periodDays)
    : [];
  const systemFit = effectiveBodies.length > 0
    ? systemVoiceFit(effectiveBodies.map((body) => body.periodDays))
    : null;
  const systemFrequencies = effectiveBodies.length > 0
    ? systemVoiceFrequencies(effectiveBodies.map((body) => body.periodDays))
    : [];

  return (
    <div
      className="instrument-menu-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="instrument-menu sonification-lens" role="dialog" aria-label="Sonification lens">
        <button
          type="button"
          className="instrument-menu__close"
          aria-label="Close sonification lens"
          onClick={onClose}
        >
          <X aria-hidden="true" weight="thin" />
        </button>
        <strong>SONIFICATION · NOT AIRBORNE SOUND IN VACUUM</strong>
        <p className="sonification-lens__law">
          ORBIT f = 2¹²/T · SYSTEMS FIT BY ONE COMPRESSION · PULSARS ×1 · CEPHEID BREATH ×8640
        </p>

        {selectedBody && !visitedSystem && (
          <section className="sonification-lens__card" aria-label="Selected world">
            <span>SELECTED WORLD</span>
            <strong>{selectedBody.name?.toUpperCase() ?? selectedBody.id.toUpperCase()}</strong>
            <p>
              {`${COSMIC_VOICES[selectedBody.voice]?.label ?? selectedBody.voice} · T = ${selectedBody.period?.toFixed(2)} S`}
            </p>
            <p>
              {`f = 2¹²/${selectedBody.period?.toFixed(2)} = ${selectedBody.frequency?.toFixed(2)} HZ`}
              {Number.isFinite(selectedBody.frequency) ? ` · ${frequencyToNoteName(selectedBody.frequency)}` : ""}
            </p>
            {Number.isFinite(selectedBody.doppler) && selectedBody.doppler !== 1 && (
              <p>{`DOPPLER ×${selectedBody.doppler.toFixed(4)} · PROPER RATE ×${(selectedBody.properRate ?? 1).toFixed(4)}`}</p>
            )}
          </section>
        )}

        {visitedSystem && (
          <section className="sonification-lens__card" aria-label="Visited system">
            <span>{oscillation?.kind === "pulsar" ? "PULSAR SYSTEM" : oscillation?.kind === "cepheid" ? "CEPHEID SYSTEM" : "SYSTEM FIT"}</span>
            <strong>{visitedSystem.name}</strong>
            {oscillation?.kind === "pulsar" && (
              <p>
                {`TICK = ${oscillation.frequencyHz.toFixed(3)} HZ · ×1 ROTATION, NO OCTAVE SHIFT · BEAM DRAWN ÷${PULSAR_BEAM_DIVISION}`}
              </p>
            )}
            {oscillation?.kind === "cepheid" && (
              <p>
                {`BREATH ${lightCurveBreathSeconds(oscillation.periodDays).toFixed(1)} S = ${oscillation.periodDays.toFixed(2)} DAYS ×10 S · CURVE FROM PHOTOMETRY`}
              </p>
            )}
            {systemFit && effectiveBodies.length > 1 && (
              <p>{`ONE COMPRESSION ×${systemFit.squeeze.toFixed(3)} FOR THE WHOLE SYSTEM`}</p>
            )}
            {systemFrequencies.length > 0 && (
              <ul className="sonification-lens__worlds">
                {effectiveBodies.map((body, index) => (
                  <li key={body.id}>
                    <span>{body.name}</span>
                    <span>{`${body.periodDays >= 365 ? `${(body.periodDays / 365.25).toFixed(1)} Y` : `${body.periodDays.toFixed(1)} D`} → ${systemFrequencies[index].toFixed(1)} HZ`}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="sonification-lens__card" aria-label="Resonance seals">
          <span>RESONANCE</span>
          <strong>{liveLockText}</strong>
          {ladder && (
            <p>{`A LADDER OF ${ladder.memberIds.length} WORLDS IS LOCKED · MEAN ${(ladder.meanStrength * 100).toFixed(0)}%`}</p>
          )}
          <p>{resonances?.length > 0 ? `SEALED: ${resonances.join(" · ")}` : "NO SEALS IN THIS UNIVERSE YET"}</p>
        </section>
      </section>
    </div>
  );
}
