# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

## Durable product decisions

- The current Soundflight direction supersedes the earlier multi-theme landing composition for the default experience. Its visual truth is `../assets/concepts/soundflight-luminous.png`: black lacquer, luminous opalescent worlds, event-driven colored light, and only the minimum floating controls. The user explicitly reaffirmed this styling on 2026-07-21.
- Render the primary scene directly with Three.js. Camera orbit/pan/zoom, smooth body following, launch gestures, bloom, particles, and resonance lines belong to the WebGL scene; React owns accessible controls, drawers, status, and existing score/audio workflows.
- Brightness must communicate musical energy. Keep the resting sky dark and sparse, then intensify the selected world's opal emission, cyan/amber/magenta trail braid, particles, birth bloom, and resonance knot from real physics/audio events. Avoid permanent orbit grids and decorative noise.
- `ADD PLANET` is the single creation entry. It arms a radial gesture that starts at the star, moves outward to preview a pitch, snaps to a stable musical orbit, and releases the new voice into the score. Do not reintroduce hold-to-grow or empty-sky throwing in the primary flow. A successful release starts audio but keeps the editorial composition camera stable. Always provide visible `+` / `−` zoom controls in addition to scroll and pinch.
- Composition mode has no auto-rotation, camera following, or drag-to-fly. Zoom stays available; orbit/pan flight is an explicit secondary `EXPLORE` mode with a clear return to composition.
- Every cosmic voice has one persistent named color. A visible colored thread joins each planet to the ensemble, and a light pulse travels along that thread from the same note event that drives Web Audio. Color must always be paired with the voice label and note cue.
- Preserve deterministic physics, Kepler sonification, recorded birth/removal/pluck events, preset systems, listener replies, and share payload compatibility beneath the new surface.
- Adapt GPU load instead of silently changing the artwork: cap pixel ratio, trail samples, and particle counts by device metrics; honor reduced motion by disabling auto-drift and reducing particles while retaining the core composition.
- The accepted visual targets are concepts 1, 2, and 5: `black-lacquer-orbit.png`, `white-time.png`, and `sumi-gravity.png` in `../assets/concepts/`.
- All three are selectable presentations of one shared physical simulation and musical score. Switching theme must never change bodies, orbits, time, notes, playback position, or the shared composition payload.
- The author may save a preferred theme, while the recipient may override it locally without mutating the recording.
- Keep the primary screen sparse and full-bleed. Recording, sharing, and theme selection must not turn the experience into a dashboard.
- Balance felt play with inspectable physics: optional panels may explain or challenge, while the default scene stays an art object.
- Cosmic voices must be labelled as sonifications, never literal airborne recordings from vacuum. A voice imprint is part of the shared score and must reproduce for the recipient.
- Resonance challenges must use the real unsnapped N-body state; never auto-correct an orbit to manufacture success.
- Touching a visible world must immediately reveal its assigned voice from the current live physical state; dragging the same world changes the orbit, time flow, color, and music.
- Treat sharing as the end of the play loop, not a utility action. The dance record must carry orbit gestures, voice imprints, and earned resonance seals, and the recipient must be able to replay or answer with a new orbit.
- Mobile is a primary performance surface. Keep core touch targets at least 44 px and verify portrait, compact portrait, and landscape without document overflow.
- While `ADD PLANET` is armed, dragging outward from the star is the only birth gesture. Distance chooses one of the authored musical orbit radii, the gestation tone previews its exact Kepler pitch, and release commits it. A short or off-star gesture must surface a clear error and never silently birth a world.
- Pitch is honest Kepler sonification: a world's fundamental is its live orbital frequency raised exactly twelve octaves, so resonance ratios are heard as just intervals. The authored `frequency` field is only a fallback for bodies without a bound period.
- Births and consumptions are score events (`add-body`/`remove-body`) so a shared dance replays the universe being made. Born worlds keep their birth voice everywhere, including replies; only the core trio accepts voice imprints.
- Feeding a born world to the star is the only removal gesture; the core trio is permanent. The sky holds at most 12 worlds.
- Birth visuals follow the surface: dark themes conceive in cyan light, light themes conceive in ink. Consumption always flashes warm coral.
- The composer's dance never loops or resets on its own; only the listener replay loops at the recorded duration. Restart (↺) begins a fresh take: it clears recorded events so timestamps stay monotonic.
- Every drawn orbit is a harp string. Touching the line (not the world, not the void) plucks it at its live Kepler pitch; sweeping across lines strums them with per-string cooldown. Pluck position sets timbre (near the world dark and long, far bright), swipe speed sets strength. Gesture priority is fixed: world grab, then string pluck, then void birth.
- Plucks are recorded as `pluck` events and replay for the listener; listeners may also pluck the received harp locally without touching the record. Plucking never changes physics — strings sound the orbit, they do not push it.
- The harp shelf loads authored star systems (quinta, octava, penta, cometa) as fresh takes; presets keep the io/europa/callisto trio as the first three strings (extra strings are roster novas in the initial state), keep the player's current theme, and are hidden from listeners.
- String ripples and hover glints use the same surface rule as births: cyan light on dark themes, ink on light themes.
