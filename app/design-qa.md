# Relativity Gramophone mechanics design QA

**Source visual truth**

- The user selected the current production styling rather than one of the generated redesigns.
- Production URL: `https://waiwai.is/relativity`
- Source screenshot: `~/.codex/visualizations/2026/07/21/019f8516-a6d2-79c2-9955-fda99417f8e6/relativity-qa/source-current-805x1000.png`

**Rendered implementation**

- Local surface: Vite preview
- Screenshot: `~/.codex/visualizations/2026/07/21/019f8516-a6d2-79c2-9955-fda99417f8e6/relativity-qa/implementation-latest-1280x720.png`
- Viewport: 1280 × 720 CSS px at DPR 2 for both source and implementation
- State: lacquer theme, Quinta, paused, systems closed, editorial composition camera
- Full-view comparison: `~/.codex/visualizations/2026/07/21/019f8516-a6d2-79c2-9955-fda99417f8e6/relativity-qa/comparison-full.png`
- Focused left controls: `~/.codex/visualizations/2026/07/21/019f8516-a6d2-79c2-9955-fda99417f8e6/relativity-qa/comparison-left-controls.png`
- Focused right controls: `~/.codex/visualizations/2026/07/21/019f8516-a6d2-79c2-9955-fda99417f8e6/relativity-qa/comparison-right-controls.png`
- Note-pulse evidence: `~/.codex/visualizations/2026/07/21/019f8516-a6d2-79c2-9955-fda99417f8e6/relativity-qa/11-latest-pulse.png`
- Explore-return evidence: `~/.codex/visualizations/2026/07/21/019f8516-a6d2-79c2-9955-fda99417f8e6/relativity-qa/08-returned-compose.png`
- Integrated `wai-web` launch evidence: `~/.codex/visualizations/2026/07/21/019f8516-a6d2-79c2-9955-fda99417f8e6/relativity-qa/wai-web-local-launch-1280x720.png`

**Findings**

- No actionable P0/P1/P2 findings remain at the selected 1280 × 720 visual target.
- Fonts and typography: Avenir Next / Helvetica Neue uppercase tracking, Iowan/Baskerville supporting copy, weights, title scale, and the sparse optical hierarchy remain faithful to production. `ADD PLANET` fits the existing circular action and communicates the changed mechanic without increasing density.
- Spacing and layout rhythm: title, systems control, transport, and lower edge alignment remain on the original perimeter. The new thread legend replaces the ambiguous flight cue in the same footprint. The ensemble is intentionally smaller and centered so all planets and their colored relations are simultaneously legible.
- Colors and visual tokens: lacquer black, aged gold, opalescent texture, and amber solar bloom are unchanged. Cyan, amber, magenta, and mint are now semantic voice colors rather than a decorative braid; labels prevent color-only meaning.
- Image quality and asset fidelity: the implementation reuses the exact production lacquer, opal, and solar texture assets. They remain sharp at DPR 2 with no placeholder, masking, compression, or transparency artifacts. No source imagery was replaced with CSS or SVG approximations.
- Copy and content: `ADD PLANET → DRAG FROM THE STAR → DISTANCE CHOOSES THE PITCH → RELEASE TO HEAR IT` forms one coherent flow. `MUSICAL THREADS · N VOICES`, `PULSE = NOTE`, the named color/voice legend, note names, and join cue explain what the generated color means.
- Icons and controls: existing Phosphor thin-line icons are retained. Play/Pause, Add Planet, Systems, Explore, Return to Composition, zoom, Cancel, Dismiss, and panel actions remain semantic buttons with accessible names and visible focus states.
- Behavior and accessibility: audio starts only from a user gesture. An off-star launch is rejected with `START AT THE STAR — THEN DRAG OUTWARD`; no hidden fallback birth occurs. The canvas application label describes the entire mechanic. Reduced motion keeps the core composition and disables automatic camera drift.
- Responsive note: the existing responsive CSS was preserved and the intermediate ≤960 px thread-legend placement removes the collision found during the first pass. Exact 390 × 844 verification is pending the separately requested Codex Actual Size confirmation and is not used as evidence for this desktop visual-target pass.

**Comparison history**

1. Initial audit found a P1 causality gap: a birth displayed only `NOVA-N JOINS`, while the multicolor trail did not state which voice or note it represented. It also found a P1 interaction collision: drag controlled both creation and free camera flight.
2. First implementation added fixed voice colors, musical links, a radial star launch, and explicit Explore mode. Browser evidence then exposed a P1 visual hierarchy issue: the old bright multicolor selected trail overpowered the new causal links. At narrow portrait width, the selected planet also collided with the new legend (P2).
3. Fixed those issues by making trails single-color and event-driven, hiding decorative motion while paused, promoting musical links to stable screen-space colored lines, and moving the legend at ≤960 px. Post-fix evidence: `10-latest-default.png` and `11-latest-pulse.png`.
4. Explore testing exposed a P1 return-state issue: leaving free flight disabled controls but retained the rotated camera. Fixed with a damped reset to the editorial camera and cancellation of reset if Explore is immediately re-entered. Post-fix evidence: `08-returned-compose.png`.
5. Final same-viewport full and focused comparisons preserve the selected art direction while making planets, voice colors, causal pulses, and the single launch action legible. No P0/P1/P2 findings remain.

**Primary interactions tested in the in-app browser**

- Add Planet opens the three-step guide.
- Dragging from the visible star, including an exact hit on the star mesh, previews pitch, releases a stable circular musical orbit, starts audio, adds `NOVA-1`, and increments the live voice count.
- Birth and later observer-crossing notes produce the matching named cue and colored link pulse.
- Off-star drag shows a recoverable explicit error and creates no planet.
- Cancel returns to composition.
- Explore enables orbit/pan; Return to Composition smoothly restores the editorial camera.
- Zoom in/out updates the AU scale from 1.5 to 1.3 and back.
- Systems opens with presets and the existing Voices, Physics, and Share actions.
- Browser console warnings/errors after the final interaction pass: none.
- The production-shaped local `wai-web` build loads its JS, CSS, and generated textures from `/relativity/assets`, completes the same launch flow, and has no browser console warnings or errors.

**Implementation checklist**

- [x] Preserve the current lacquer/opalescent production art direction
- [x] Replace hold/aim/throw with one radial star launch
- [x] Snap launches to deterministic stable musical orbit radii
- [x] Give every voice a persistent named color
- [x] Connect the ensemble with stable colored Three.js links
- [x] Drive link pulses and note cues from the same sound event
- [x] Separate calm composition camera from explicit Explore flight
- [x] Preserve Systems, sharing, score events, replay, physics, and Web Audio
- [x] Pass unit tests, production build, desktop browser flow, visual comparison, and console checks

**Follow-up polish**

- P3: repeat the exact 390 × 844 and compact-landscape evidence after Codex is confirmed at Actual Size.

final result: passed
