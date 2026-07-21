import { Atom, X } from "@phosphor-icons/react";

function signedPercent(value) {
  const percent = (value - 1) * 100;
  return `${percent >= 0 ? "+" : ""}${percent.toFixed(2)}%`;
}

function clockLag(rate) {
  return `${((1 - rate) * 1000).toFixed(1)} ms/s`;
}

export function RelativityLens({ frame, open, onClose, onToggle, showTrigger = true }) {
  return (
    <div className="relativity-control">
      {showTrigger && (
        <button
          type="button"
          className="icon-button relativity-trigger"
          aria-controls="relativity-lens"
          aria-expanded={open}
          aria-label={open ? "Close relativity lens" : "Open relativity lens"}
          onClick={onToggle}
        >
          <Atom aria-hidden="true" weight="thin" />
        </button>
      )}

      {open && (
        <aside id="relativity-lens" className="relativity-lens" aria-label="Live relativity measurements">
          <div className="lens-heading">
            <div>
              <span>RELATIVITY LENS</span>
              <strong>t {frame?.time.toFixed(2) ?? "0.00"}</strong>
            </div>
            <button type="button" className="lens-close" aria-label="Close relativity lens" onClick={onClose}>
              <X aria-hidden="true" weight="thin" />
            </button>
          </div>

          <div className="lens-column-labels" aria-hidden="true">
            <span>BODY</span>
            <span>τ</span>
            <span>LAG</span>
            <span>Δf</span>
          </div>
          <div className="lens-readings">
            {(frame?.bodies ?? []).map((body) => (
              <div className="lens-reading" key={body.id}>
                <strong>{body.id}</strong>
                <span>{body.properTime.toFixed(2)}</span>
                <span>{clockLag(body.properRate)}</span>
                <span className={body.doppler >= 1 ? "is-blue" : "is-red"}>{signedPercent(body.doppler)}</span>
              </div>
            ))}
          </div>

          <div className="lens-resonance">
            <span>RESONANCE</span>
            <strong>{frame?.resonance?.label ?? "—"}</strong>
            <span>{frame?.resonance ? `${Math.round(frame.resonance.strength * 100)}% LOCK` : "DRIFTING"}</span>
          </div>

          <p>Weak-field clock · relativistic Doppler · velocity-Verlet N-body. Time contrast is sonified at ×1.18.</p>
        </aside>
      )}
    </div>
  );
}
