import { Copy, ShareNetwork, X } from "@phosphor-icons/react";

export function InscriptionDialog({
  link,
  message,
  mode,
  open,
  onClose,
  onCopy,
  onEnterOrbit,
  onMessageChange,
  onShare,
  status,
}) {
  if (!open) return null;

  return (
    <section className="inscription-dialog" role="dialog" aria-modal="true" aria-labelledby="inscription-title">
      <button type="button" className="icon-button close-button" aria-label="Close" onClick={onClose}>
        <X aria-hidden="true" weight="thin" />
      </button>
      <h2 id="inscription-title">{mode === "listener" ? "A RECORDED ORBIT" : "INSCRIBE THIS ORBIT"}</h2>
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
          COPY LINK
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
