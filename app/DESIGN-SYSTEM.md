# Relativity Gramophone design system

## Source visual truth

- Black lacquer: `../assets/concepts/black-lacquer-orbit.png`
- White time: `../assets/concepts/white-time.png`
- Sumi gravity: `../assets/concepts/sumi-gravity.png`
- Native reference frame: `1487 × 1058` (1.4055:1).

## Shared composition

- Full-bleed orbital canvas; no enclosing card or dashboard shell.
- Title at the top-left; time and recording state at the top-right.
- A single vertical observer/stylus line crosses the simulation.
- One central star and three orbiting bodies.
- `INSCRIBE` is the single dominant completion/share action at the lower edge.
- Theme selection is a compact edge control that collapses after use.
- Playback controls are quiet, icon-led, and subordinate to the orbital field.

## Visible-copy lock

Above the fold may show only:

- `RELATIVITY GRAMOPHONE`
- `00:00`–`01:04` composition time
- `3:2`
- `INSCRIBE`
- Theme names while the theme chooser is open: `LACQUER`, `WHITE TIME`, `SUMI`
- Action state when needed: `LINK COPIED`, `PLAY AGAIN`, `ANSWER WITH ORBIT`
- Scientific values only while the optional `RELATIVITY LENS` is open.
- Cosmic voice descriptions and resonance targets only while the optional sound atlas is open.
- A compact `RESONANCE 3:2 · SEEKING/LOCKED` strip only while the player has explicitly started an orbit challenge.

No explanatory hero copy, badges, feature descriptions, fake metrics, or scientific jargon is visible by default.

## Theme tokens

### Lacquer

- Base: warm near-black `#070706`; absolutely not blue-black.
- Primary line/type: aged gold `#c49b52`.
- Secondary line: dim bronze `#5e482b`.
- Bodies: warm pearl and graphite, with tiny cyan/coral motion glints.
- Texture: deep urushi depth, subtle horizontal grain, almost invisible potential contours.

### White time

- Base: true warm gallery white `#f7f5f0`, sampled from the concept rather than beige.
- Primary line/type: graphite `#242625`.
- Secondary line: cool gray `#a9aaa6`.
- Accents: pale coral `#d98e78`, icy cyan `#76b9c1`, pearl.
- Texture: fibrous paper with embossed gravitational contours and shallow relief.

### Sumi

- Base: warm washi `#f3efe5`.
- Primary line/type: carbon `#191a18`.
- Secondary line: diluted ink `#6e706b`.
- Accents: restrained cinnabar `#cf674d`, mineral blue `#5da9c4`, dry gold `#bf9344`.
- Texture: visible paper fibers and capillary ink accumulation along trajectories.

## Typography

- UI/display: `Avenir Next`, `Helvetica Neue`, system sans; uppercase tracking `0.34em` for title and actions.
- Numeric/resonance accent: `Iowan Old Style`, `Baskerville`, serif.
- Title: 12–14 px desktop, 10–11 px mobile, weight 500.
- Action/control: 11–13 px desktop, never browser-default text sizing.

## Interaction and motion

- Drag a body radially to change its orbital scale and period.
- Drag tangentially to change phase and eccentricity.
- Crossing the observer line triggers a note and a short wave bloom.
- The theme transition is 450–700 ms and affects only rendering tokens/assets.
- Respect `prefers-reduced-motion`; physics can continue while decorative trails shorten.
- Audio starts or resumes only from a user action.

## Component ownership

- `App`: composition and state coordination only.
- `OrbitalStage`: canvas renderer, N-body loop, hit testing and recorded drag gestures.
- `AudioEngine`: Web Audio voices and observer-crossing scheduling.
- `CosmicSoundAtlas`: body selection, scientific timbre imprinting, audition and real-resonance challenges.
- `RelativityLens`: optional live physical readings, visually subordinate to the field.
- `ThemeChooser`: accessible three-theme selector.
- `Transport`: play/pause and record state.
- `InscriptionDialog`: immutable payload, share/copy, passive listen and enter-orbit states.
- `composition`: validated `tau-record/3`, v1/v2 migration, lineage and hash-safe URL payload.

## Intentional functional extension

The mockups did not show an explicit theme chooser. The user requested it after selection, so the chooser is a necessary addition. It must remain visually subordinate and disappear when closed.
