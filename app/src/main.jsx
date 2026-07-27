import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./styles.css";

// The picture can be measured rather than argued about: ink coverage, tonal
// range, banding, hue count, edge ripple. The measurements are pure and tested
// in `frameBeauty.test.js`; this only hands them the live drawing buffer.
// Development only — Vite drops the whole branch from a production build.
if (import.meta.env.DEV) {
  import("./lib/frameBeautyProbe.js").then(({ frameBeautyProbe }) => {
    window.__rgBeauty = frameBeautyProbe;
  });
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
