import { Copy, ShareNetwork, X } from "@phosphor-icons/react";
import { COSMIC_VOICES } from "../lib/sonification.js";

function formatTime(value) {
  const seconds = Math.max(0, Math.floor(value));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function InscriptionDialog({
  bodies,
  duration,
  link,
  message,
  mode,
  open,
  resonances,
  onClose,
  onCopy,
  onEnterOrbit,
  onMessageChange,
  onShare,
  status,
}) {
  if (!open) return null;
  const voices = bodies.map((body) => COSMIC_VOICES[body.voice].label).join(" · ");

  return (
    <section className="inscription-dialog" role="dialog" aria-modal="true" aria-labelledby="inscription-title">
      <button type="button" className="icon-button close-button" aria-label="Close" onClick={onClose}>
        <X aria-hidden="true" weight="thin" />
      </button>
      <h2 id="inscription-title">{mode === "listener" ? "A PLANETARY DANCE" : "INSCRIBE & SHARE THE DANCE"}</h2>
      <div className="dance-signature" aria-label="Dance record summary">
        <p><span>VOICES</span><strong>{voices}</strong></p>
        <p><span>RESONANCE SEALS</span><strong>{resonances.length ? resonances.join(" · ") : "OPEN ORBIT"}</strong></p>
        <p><span>DURATION</span><strong>{formatTime(duration)}</strong></p>
      </div>
      {mode === "composer" ? (
        <label className="message-field">
          <span>MESSAGE</span>
          <input
            value={message}
            maxLength={120}
            placeholder="A quiet note across time"
            onChange={(event) => onMessageChange(event.target.value)}
          />
        </label>
      ) : (
        message && <p className="received-message">“{message}”</p>
      )}
      <label className="link-field">
        <span>TAU RECORD</span>
        <input readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
      </label>
      <div className="dialog-actions">
        <button type="button" className="text-action" onClick={onCopy}>
          <Copy aria-hidden="true" weight="thin" />
          COPY DANCE LINK
        </button>
        <button type="button" className="text-action" onClick={onShare}>
          <ShareNetwork aria-hidden="true" weight="thin" />
          SHARE DANCE
        </button>
        {mode === "listener" && (
          <button type="button" className="text-action enter-action" onClick={onEnterOrbit}>
            ANSWER WITH ORBIT
          </button>
        )}
      </div>
      {status && <p className="dialog-status" role="status">{status}</p>}
    </section>
  );
}
