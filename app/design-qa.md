# WAI Gramophone design QA

## Approved direction

- Preserve the black-lacquer, opalescent, sparse editorial style.
- Make one continuous sounding universe rather than a dashboard or a separate galaxy screen.
- Keep four direct gestures: star → planet, planet → moon, orbit → pluck, empty space → theremin.
- Put free rotation and pan behind the explicit `FLY` / `RETURN` control.
- Let abundance come from physical or musical causes, never from permanently flashing decoration.

## Local browser verification

Surface: `http://127.0.0.1:4173/`

Browser Use viewport: 390 × 844 CSS px at DPR 1.

Verified:

- Initial state is already visually playing and exposes `PAUSE`, not a dormant launch screen.
- A deliberate drag from the star creates one planet, starts its voice, selects it, and creates no moon.
- A deliberate drag from the selected planet creates exactly one moon. The moon orbit does not exist before that gesture.
- Orbit contact creates a note cue and the single memory-comet event without changing the physical orbit.
- `FLY` enables free camera movement; `RETURN` restores composition mode.
- Explicit `+` / `−` controls cross `STAR SYSTEM` → `MILKY WAY` → `DEEP UNIVERSE`.
- Distance copy changes from AU to KLY and MLY at the semantic boundaries.
- At galaxy scale, local strings recede while the three-arm stellar field, record grooves, warm center, and cyan memory thread become dominant.
- Sharing a one-world score reports `WORLDS 1`, `MOONS 0`, copies a valid `#score=` URL, and a new browser tab replays the received world.
- No document-level horizontal overflow.
- Fresh-tab browser console errors: none.

## Automated verification

- Unit tests cover semantic zoom mixes, continuous bounded theremin mapping, resonance-cathedral gating, memory-comet envelope, semantic distance labels, and the extended camera envelope.
- The full repository suite and production build must pass before deployment.

## Known verification boundary

The Codex Computer Use runtime refused to control `com.openai.codex`, so it could not enlarge the host window for a trustworthy new 1280 × 720 Browser Use screenshot. The desktop DOM/interaction path was exercised, but only the correctly sized 390 × 844 capture is treated as current visual evidence. Production desktop verification is performed separately after deployment.

## Production verification

Surface: `https://waiwai.is/relativity`

- WaiWeb production commit: `e5a058bfcdc9028bf28aaeebb2cc90c61eb2c8f7`
- Loaded asset: `/relativity/assets/index-BjQCRk2m.js`
- Initial state: `WAI GRAMOPHONE`, `PAUSE`, `STAR SYSTEM`, playback active.
- Production planet birth: one live planet, zero moons.
- Production share: `WORLDS 1`, `MOONS 0`, copied link reports `LINK COPIED`.
- A fresh production tab opens the received record and births the recorded planet at its preserved event timestamp.
- Production browser console errors: none.
- Production HTTP response: `200 text/html`.

final result: passed locally and in production
