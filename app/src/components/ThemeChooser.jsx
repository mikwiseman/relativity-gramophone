import { useEffect, useRef, useState } from "react";
import { CircleHalfTilt } from "@phosphor-icons/react";

import { THEME_ORDER, THEMES } from "../lib/themes.js";

export function ThemeChooser({ value, onChange }) {
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
    <div className="theme-chooser" ref={rootRef}>
      {open && (
        <div className="theme-menu" role="radiogroup" aria-label="Choose appearance">
          {THEME_ORDER.map((themeId) => (
            <button
              type="button"
              role="radio"
              aria-checked={value === themeId}
              className="theme-option"
              data-theme-option={themeId}
              key={themeId}
              onClick={() => {
                onChange(themeId);
                setOpen(false);
              }}
            >
              <span
                className="theme-sample"
                aria-hidden="true"
                style={{ backgroundImage: `url(${THEMES[themeId].background})` }}
              />
              <span>{THEMES[themeId].label}</span>
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className="icon-button theme-trigger"
        aria-label="Choose appearance"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <CircleHalfTilt aria-hidden="true" weight="thin" />
      </button>
    </div>
  );
}
