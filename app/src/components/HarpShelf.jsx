import { useEffect, useRef, useState } from "react";
import { Planet } from "@phosphor-icons/react";

import { HARPS, HARP_ORDER } from "../lib/starHarps.js";

export function HarpShelf({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div className="harp-shelf" ref={rootRef}>
      {open && (
        <div className="harp-menu" role="radiogroup" aria-label="Choose a star harp">
          {HARP_ORDER.map((harpId) => (
            <button
              type="button"
              role="radio"
              aria-checked={value === harpId}
              className="harp-option"
              key={harpId}
              onClick={() => {
                onChange(harpId);
                setOpen(false);
              }}
            >
              <strong>{HARPS[harpId].name}</strong>
              <span>{HARPS[harpId].motto}</span>
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className="icon-button harp-trigger"
        aria-label="Choose a star harp"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Planet aria-hidden="true" weight="thin" />
      </button>
    </div>
  );
}
