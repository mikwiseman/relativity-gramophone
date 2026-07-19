# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

## Durable product decisions

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
