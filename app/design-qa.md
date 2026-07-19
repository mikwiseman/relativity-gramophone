# Design QA — Relativity Gramophone

## Comparison target

- Source visual truth:
  - `../assets/concepts/black-lacquer-orbit.png`
  - `../assets/concepts/white-time.png`
  - `../assets/concepts/sumi-gravity.png`
- Rendered implementation:
  - `qa/lacquer-desktop.png`
  - `qa/white-desktop.png`
  - `qa/sumi-desktop-final.png`
- URL: `http://localhost:4173/`
- Browser: Codex in-app Browser (IAB)
- Desktop viewport: `1487 × 1058` CSS pixels, DPR 2
- Mobile viewport: `390 × 844` CSS pixels, DPR 1
- Comparison state: author mode, paused at `00:00`, theme selected; the source mockups show a representative active instant at `00:42`, so moving-body positions and active pulses are not treated as static mismatches.

## Full-view comparison evidence

- Black lacquer: `qa/compare-lacquer.png`
- White time: `qa/compare-white.png`
- Sumi, final: `qa/compare-sumi-final.png`

Each comparison file places the source on the left and the implementation on the right at the same `1487 × 1058` frame.

## Focused-region comparison evidence

- Typography, timer, controls, and inscription edge: `qa/focus-lacquer-chrome.png`
- White material, bodies, embossed trajectories, and field center: `qa/focus-white-center.png`
- Sumi bodies, brush trajectories, observer line, and field center: `qa/focus-sumi-center.png`

Focused crops were required because the generated body edges, paper/ink material, small uppercase type, and icon weights were not readable enough in a scaled full-frame comparison.

## Findings

No actionable P0, P1, or P2 findings remain.

- [P3] The Sumi concept uses more extreme, calligraphic orbit deformation than the implementation.
  - Location: Sumi orbital field.
  - Evidence: `qa/focus-sumi-center.png` shows the source's broad isolated washes while the implementation keeps the same physical ellipse geometry used by the other two themes and changes its material through generated dry-brush stamps.
  - Impact: a small reduction in expressive exaggeration, but the requested invariant — one composition whose physics and music do not change when appearance changes — is preserved.
  - Follow-up: increase low-frequency brush-width modulation only if greater theme-specific deformation is preferred over exact cross-theme spatial continuity.

## Required fidelity surfaces

- Fonts and typography: uppercase UI uses `Avenir Next`/Avenir/Helvetica fallbacks with the source's wide tracking and quiet optical weight; timer and `3:2` use an old-style serif. No broken wraps or truncation at desktop or mobile.
- Spacing and layout rhythm: title, timer, observer line, orbital field, edge controls, and `INSCRIBE` retain the sparse full-bleed hierarchy. The implementation deliberately keeps one control layout across all themes instead of moving `INSCRIBE` between corners.
- Colors and visual tokens: lacquer is warm near-black and aged gold; white is gallery-white graphite with pearl/cyan/coral; Sumi is warm washi and diluted carbon. No CSS gradients or decorative color overlays replace the generated materials.
- Image quality and asset fidelity: backgrounds, celestial bodies, and Sumi brush textures are GPT-Image raster assets sized for their slots. Desktop captures show no missing images, hard transparency boxes, stretching, or visible chroma fringe.
- Copy and content: above the fold is restricted to `RELATIVITY GRAMOPHONE`, time, `3:2`, `INSCRIBE`, and interaction labels. The White Time concept's Japanese descriptive line was intentionally omitted so the three selectable appearances do not change product meaning or copy density.
- Icons: transport, theme, copy, share, close, and replay use one Phosphor icon family with consistent thin/filled weights and practical hit targets.
- Responsiveness and accessibility: verified `390 × 844` with no horizontal or vertical overflow; the theme menu and inscription dialog remain inside the viewport. Controls are semantic buttons/radios, have accessible names, keyboard focus styles, and reduced-motion handling.

## Comparison history

### Pass 1 — blocked

- Earlier finding: [P2] Sumi trajectories were smooth canvas ellipses and did not carry the source's capillary ink character.
- Evidence: `qa/compare-sumi.png`.
- Fix: generated a dedicated 2×2 Sumi brush texture sheet with GPT-Image, removed the chroma key to real alpha, and rendered the raster brush material tangentially along the physical orbit.
- Post-fix evidence: `qa/sumi-desktop-v2.png`.

### Pass 2 — blocked

- Earlier finding: [P2] the first textured orbit pass exposed a regular dash cadence, reading as a repeated stamp rather than a continuous brush.
- Evidence: `qa/sumi-desktop-v2.png`.
- Fix: increased stamp overlap, introduced deterministic irregular radial drift, mixed dry-hairline and full-bristle cells, lowered per-stamp opacity, and added asymmetric broad brush accumulations.
- Post-fix evidence: `qa/sumi-desktop-v3.png`, then `qa/sumi-desktop-final.png`.

### Pass 3 — passed

- Evidence: `qa/compare-sumi-final.png` and `qa/focus-sumi-center.png`.
- Result: the remaining difference is the intentional shared physical geometry described as P3 above; no actionable P0/P1/P2 mismatch remains.

## Browser verification

Primary interactions tested in IAB:

1. switched among `LACQUER`, `WHITE TIME`, and `SUMI`;
2. started Web Audio from the explicit Play gesture and observed the running timer;
3. dragged a visible body and verified one recorded gesture in the serialized score;
4. inscribed a score, entered a message, opened the generated link in a second tab, and decoded the `tau-record/2` payload;
5. opened the link as a recipient, confirmed the message and event, played through the recorded event time, and found no runtime error;
6. opened the optional relativity lens and observed live proper time, clock lag, Doppler shift, and unsnapped `3:2` resonance strength;
7. created `ANSWER WITH ORBIT` after listening and verified `generation: 1`, parent fingerprint, embedded physical initial state, and cleared performance events;
8. switched Black Lacquer, White Time, and Sumi Gravity without changing the score, then tested the field and lens at `390 × 844` with zero document overflow;
9. checked a fresh listener/mobile runtime for warning and error logs: none.

Native reference viewport was successfully checked. Desktop and mobile had no document overflow.

## Above-the-fold copy diff

- Intentional omission: the White Time source's Japanese descriptive line and seal.
- Intentional addition: Play and appearance controls required to make the concept a working musical game.
- Dynamic-only difference: source timer `00:42`; initial implementation timer `00:00`.
- No unplanned explanatory copy, badges, metrics, or scientific jargon appears above the fold.

## Implementation checklist

- [x] Three selected appearances are available from one compact chooser.
- [x] Theme choice does not alter recorded physics, notes, or payload events.
- [x] Core compose → inscribe → copy → receive → listen path works.
- [x] Desktop and mobile layouts have no overflow.
- [x] Tests and production build pass.
- [x] Browser console is clean.

final result: passed

## Mobile sound-atlas upgrade — 2026-07-19

### Numbered flow

1. Opened the current production scene at `390 × 844` and captured the initial field, appearance menu and relativity lens.
2. Measured the existing controls: no document overflow, but the main mobile controls were only `38 px` and theme choices `40 px` tall.
3. Opened the new local build at `390 × 844`; all five core actions measured at least `44 px`, with `scrollWidth = innerWidth = 390`.
4. Opened the cosmic sound atlas, selected the Moon voice for Io and verified the pressed voice state with no runtime alert.
5. Started a `3:2` challenge, verified that it explicitly started Web Audio and the moving simulation, dragged Io, then observed `LOCKED 3:2 · THE ORBIT SINGS` only after a sustained real lock.
6. Recorded the result as `tau-record/3`, opened the generated URL in a second tab and verified that the recipient retained Io's Moon voice while challenge controls remained read-only.
7. Repeated layout checks at `320 × 568` and `844 × 390`; the atlas becomes internally scrollable and the document retains zero horizontal overflow.
8. Started Web Audio from the explicit mobile Play gesture and observed the timer advance to `00:01`; composer and listener warning/error logs remained empty.

### Evidence

- Current-production baseline: `qa/audit-mobile-01-start.png`, `qa/audit-mobile-02-themes.png`, `qa/audit-mobile-03-lens.png`
- New default mobile scene: `qa/mobile-upgrade-01-start.png`
- Sound atlas: `qa/mobile-upgrade-02-atlas.png`
- Successful physical challenge: `qa/mobile-upgrade-04-resonance-success.png`, `qa/mobile-upgrade-09-challenge-strip.png`, `qa/mobile-upgrade-10-live-game.png`, `qa/mobile-upgrade-11-live-lock.png`
- Compact and landscape: `qa/mobile-upgrade-05-compact-320.png`, `qa/mobile-upgrade-06-landscape.png`
- Recording and recipient: `qa/mobile-upgrade-07-inscribe-v3.png`, `qa/mobile-upgrade-08-listener-voices.png`

### Findings

- Fixed [P1]: touch targets below the 44 px mobile minimum.
- Fixed [P1]: physics was observable but lacked an explicit, learnable game objective.
- Fixed [P1]: timbre was not yet an authored part of the shareable object.
- Passed: no horizontal document overflow in any tested mobile viewport.
- Passed: the atlas is explicit that its voices are sonifications rather than sound propagating through vacuum.
- Passed: resonance success is driven by the same unsnapped N-body model used by the lens and music.
