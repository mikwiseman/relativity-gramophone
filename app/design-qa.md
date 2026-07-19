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
- Spacing and layout rhythm: title, timer, observer line, orbital field, edge controls, and `SHARE DANCE` retain the sparse full-bleed hierarchy. The implementation deliberately keeps one control layout across all themes.
- Colors and visual tokens: lacquer is warm near-black and aged gold; white is gallery-white graphite with pearl/cyan/coral; Sumi is warm washi and diluted carbon. No CSS gradients or decorative color overlays replace the generated materials.
- Image quality and asset fidelity: backgrounds, celestial bodies, and Sumi brush textures are GPT-Image raster assets sized for their slots. Desktop captures show no missing images, hard transparency boxes, stretching, or visible chroma fringe.
- Copy and content: above the fold is restricted to `RELATIVITY GRAMOPHONE`, time, `3:2`, `SHARE DANCE`, and the transient first-use interaction whisper. The White Time concept's Japanese descriptive line was intentionally omitted so the three selectable appearances do not change product meaning or copy density.
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

## Planet dance loop — 2026-07-19

### Verified flow

1. Touched a visible world at `390 × 844`; the first-use whisper disappeared, Web Audio started from the gesture, the transport changed to Pause, and the simulation clock advanced.
2. Opened the atlas and confirmed explicit Earth, Moon, Light, and Alpha Centauri sonification cards plus per-orbit voice assignments.
3. Selected `3:2`, dragged a live body, observed continuous ratio guidance, and earned `SEALED 3:2 · 1/3` only after the measured period ratio remained above the real 82% lock threshold.
4. Opened `SHARE DANCE`; the record summarized `EARTH · MOON · LIGHT`, the `3:2` seal, duration, deterministic score link, and dedicated copy/native-share actions.
5. Opened that generated link in a second tab, verified the received voices, resonance seal and duration, then started recipient playback and observed the clock advance to `00:01` with no runtime alert.
6. Rechecked `390 × 844`, `320 × 568`, and `844 × 390`: zero horizontal overflow, every core/dialog action is at least `44 px`, compact controls do not collide, and the landscape dialog remains fully inside the viewport.
7. Checked composer and recipient browser warning/error logs: none.

### Evidence

- Direct first-use loop: `qa/after-mobile-390x844.png`
- Sound atlas and resonance collection: `qa/atlas-mobile-390x844.png`
- Composer's shareable record: `qa/share-dialog-final-390x844.png`
- Recipient at standard mobile: `qa/recipient-final-390x844.png`
- Recipient at compact mobile: `qa/recipient-compact-final-320x568.png`
- Recipient in landscape: `qa/recipient-landscape-final-844x390.png`

### Result

- Fixed [P1]: touching a world selected it but did not directly reveal its physical voice.
- Fixed [P1]: the resonance challenge lacked a legible approach signal and durable progression.
- Fixed [P1]: the primary share affordance and the contents of the received dance were too implicit.
- Passed: the shared `tau-record/3` remains backward-compatible with older links that have no resonance seals.

## Star-birth release verification — 2026-07-19

Verified live in the Claude in-app Browser pane against the Vite dev server, then re-run through the node test suite (49 passing) and a production build.

### Interaction sequence checked

1. Pressed empty lacquer sky: the gestation seed appeared with the growing mass ring, the circular ghost orbit, and playback engaged for the gestation tone; the canvas cursor switched to conceiving.
2. Held ~1.5 s and dragged: mass ring completed, the ghost switched to the thrown ellipse, the dashed aim arrow tracked the pointer.
3. Released: `nova-1` was born at the pressed radius with the birth halo, joined the N-body ensemble, drew its predicted trajectory, and recorded an `add-body` event at score time.
4. Dragged the newborn into the star core: the world was consumed with the coral collapse flash, its voice left the ensemble, and a `remove-body` event was recorded.
5. Opened `SHARE DANCE`, decoded the link: `tau-record/4`, `cosmic-voices/2`, events `add-body, add-body, set-body-state, remove-body` — the full performed history, 2 055 URL characters.
6. Opened the link as a listener: the record dialog showed voices and duration; playback replayed the births with halos at their recorded moments.
7. `ANSWER WITH ORBIT` from the heard state produced a valid reply roster (from-heard-state semantics: unplayed births do not join the reply).
8. Switched all three themes mid-session with a live nova: physics uninterrupted; light themes conceive in ink (no grey glow smudge), lacquer conceives in cyan light.
9. Viewports `375 × 812`, `844 × 390`, `320 × 568`, desktop: no overflow, controls clear of the safe edges.
10. Console: no warnings or errors across the whole session.

### Fixed while verifying

- Fixed [P1]: restart (↺) now begins a fresh take — previously events recorded after a restart went non-monotonic and broke the share encoder mid-render.
- Fixed [P2]: the gestation glow read as a grey smudge on White Time and Sumi; birth accents are now surface-aware (dark → cyan, light → ink).
- Fixed [P2]: raw velocity aiming made small drags plunge and medium drags near-escape; throws now scale around the local circular speed, so every drag lands a musical orbit.
- Fixed [P3]: the sound atlas showed `undefined` labels for born worlds; novas now display as `N1…` and state that a born world keeps its birth voice.

## Star-harp release verification — 2026-07-20

Verified live in the Claude in-app Browser pane against the Vite dev server; 63 node tests passing; production build clean.

### Interaction sequence checked

1. Clicked directly on an orbit line in QUINTA: the string sounded its Kepler pitch with a plucked envelope and the whole orbit rang — a traveling transverse wave with a bright contact glint at the pluck point.
2. Swept radially across the system: each crossed string plucked in spatial order (strum), with per-string cooldown; two strings rang simultaneously with independent ripples.
3. Opened the harp shelf (Planet icon): QUINTA/OCTAVA/PENTA/COMETA listed with mottos; loading PENTA brought five concentric strings and an immediate `4:3` resonance readout; the switch is a fresh take and keeps the current theme.
4. Inscribed and decoded the share link: `tau-record/5`, seed `harp-penta`, five roster bodies, strummed `pluck` events recorded with offsets and strengths.
5. Opened the link as a listener: the replay rang the recorded strums at their score times; the listener plucked the received harp directly (sound + ripple, record untouched).
6. Switched the listener to White Time and plucked: the ripple renders in ink on paper (surface-aware accents), matching the birth-visual rule.
7. Fixed while verifying: the fifth control button pushed the theme and harp menus past the right edge at 375 px — both menus now pin to the viewport edge on compact screens (and the harp options meet 44 px targets).
8. Console: no warnings or errors across composer, strum, harp switching, listener replay, and listener plucking.

### Result

- The instrument layer reads as intended: strings are visible objects, plucking is discoverable from the hover glint and the whisper, and music events flow back into the image as string vibrations.
- Gesture arbitration held in play: world grab, then string pluck, then void birth; a missed strum starting off-string conceives a seed (visible warning) rather than silently doing nothing.
