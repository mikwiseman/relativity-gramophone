import { Copy, ShareNetwork, X } from "@phosphor-icons/react";

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
  const planets = bodies.filter((body) => body.kind !== "star" && body.kind !== "moon").length;
  const moons = bodies.filter((body) => body.kind === "moon").length;

  return (
    <section
      className="inscription-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="inscription-title"
      aria-describedby="inscription-detail"
    >
      <button type="button" className="icon-button close-button" aria-label="Close" onClick={onClose}>
        <X aria-hidden="true" weight="thin" />
      </button>
      <div className="orbit-record-mark" aria-hidden="true">
        <i />
        <i />
        <i />
        <b />
      </div>
      <h2 id="inscription-title">{mode === "listener" ? "AN ORBIT ARRIVED" : "SHARE THIS ORBIT"}</h2>
      <p id="inscription-detail" className="inscription-detail">
        {mode === "listener"
          ? "Play the system exactly as it was composed."
          : "The link keeps every world, moon, note and silence."}
      </p>
      <div className="dance-signature" aria-label="Dance record summary">
        <p><span>WORLDS</span><strong>{planets}</strong></p>
        <p><span>MOONS</span><strong>{moons}</strong></p>
        <p><span>TIME</span><strong>{formatTime(duration)}</strong></p>
      </div>
      {resonances.length > 0 && (
        <p className="record-resonance">RESONANCE · {resonances.at(-1)}</p>
      )}
      {mode === "composer" ? (
        <label className="message-field">
          <span>NOTE</span>
          <input
            value={message}
            maxLength={120}
            placeholder="A note for the listener"
            onChange={(event) => onMessageChange(event.target.value)}
          />
        </label>
      ) : (
        message && <p className="received-message">“{message}”</p>
      )}
      <label className="link-field">
        <span>ORBIT LINK</span>
        <input readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
      </label>
      <div className="dialog-actions">
        <button type="button" className="text-action copy-action" onClick={onCopy}>
          <Copy aria-hidden="true" weight="thin" />
          {status.startsWith("LINK COPIED") ? "LINK COPIED" : "COPY LINK"}
        </button>
        <button type="button" className="text-action" onClick={onShare}>
          <ShareNetwork aria-hidden="true" weight="thin" />
          SHARE
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
