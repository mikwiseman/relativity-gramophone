# Soundflight design QA

**Source visual truth**

- `/Users/mikwiseman/Documents/Code/relativity-gramophone/assets/concepts/soundflight-luminous.png`
- Target normalized with center crop to the rendered viewport: `/Users/mikwiseman/.codex/visualizations/2026/07/21/019f8516-a6d2-79c2-9955-fda99417f8e6/soundflight-target-normalized.png`

**Rendered implementation**

- URL: `http://127.0.0.1:4173/`
- Screenshot: `/Users/mikwiseman/.codex/visualizations/2026/07/21/019f8516-a6d2-79c2-9955-fda99417f8e6/soundflight-implementation-final.png`
- Browser viewport: 1280 × 720 CSS px at DPR 2
- State: dark lacquer, Quinta, playing, systems closed, following Europa
- Full-view comparison: `/Users/mikwiseman/.codex/visualizations/2026/07/21/019f8516-a6d2-79c2-9955-fda99417f8e6/soundflight-design-qa-full-pass-4.png`
- Focused scene comparison: `/Users/mikwiseman/.codex/visualizations/2026/07/21/019f8516-a6d2-79c2-9955-fda99417f8e6/soundflight-design-qa-focus-pass-4.png`
- Launch-mode evidence: `/Users/mikwiseman/.codex/visualizations/2026/07/21/019f8516-a6d2-79c2-9955-fda99417f8e6/soundflight-launch-guide.png`
- Mobile launch-mode evidence: `/Users/mikwiseman/.codex/visualizations/2026/07/21/019f8516-a6d2-79c2-9955-fda99417f8e6/soundflight-launch-guide-mobile.png`

**Findings**

- No actionable P0/P1/P2 findings remain.
- Typography: the wide-tracked editorial title, restrained uppercase labels, and serif launch choreography preserve the target hierarchy without crowding the base scene. `CREATE WORLD` fits the circular action without an orphaned word.
- Spacing and layout: controls remain at the perimeter and the followed body owns the field. Launch help appears only while creation is armed, dims unrelated controls, and disappears immediately after birth.
- Colors and tokens: lacquer black, warm gold UI, opal cyan/amber body, and cyan/amber/magenta event trails match the selected direction. Brightness is concentrated around live bodies, resonances, and notes.
- Image quality: generated opal, solar, and lacquer textures are sharp at rendered size, integrated as real texture assets, and show no visible transparency halos or placeholder artifacts.
- Copy and icons: app-specific labels are concise and coherent; Phosphor icons use one light-stroke family and keep accessible button names. The unfamiliar gesture is explained as `HOLD → AIM → RELEASE` in the same order it is performed.
- Behavior and accessibility: Play/Pause, Systems, Create World, preset radios, zoom, and follow controls are semantic and keyboard-addressable. Launch guidance is an `aria-live` region; the canvas application label describes the full gesture; reduced motion selects a bounded render profile.
- Responsiveness: the exact 390 × 844 CSS px mobile viewport at DPR 1 activated the mobile layout with no horizontal or vertical document overflow. The same create-world gesture produced `NOVA-1`, closed guidance, and no console warnings/errors.

**Comparison history**

1. Pass 1 found a P1 energy mismatch: the selected trail was too dim and the orange star bloom dominated the followed body. It also found a P2 hierarchy mismatch: the star read nearly as large as Europa.
2. Fixed the first pass by increasing selected braid/particle brightness, adding cyan/amber/magenta separation, enlarging the followed planet, and reducing the star core/corona. Pass 2 evidence: `soundflight-design-qa-full-pass-2.png` and `soundflight-design-qa-focus-pass-2.png`.
3. User testing then exposed a P1 comprehension problem: `LAUNCH` named an action but did not explain where to act or how hold, drag, and release affected the world. The first replacement label also wrapped awkwardly at the desktop viewport, a P2 typography issue.
4. Fixed launch comprehension with a transient three-state choreography: `PRESS EMPTY SPACE`, `HOLD · THEN DRAG`, `RELEASE TO HEAR IT`; existing worlds recede during creation; cancellation is explicit; pointer cancellation never births a body; successful release starts the sound and follows the newborn. Visual evidence: `soundflight-launch-guide.png` and `soundflight-launch-guide-mobile.png`.
5. Pass 3 at the exact 1280 × 720 comparison found the followed body and musical braid still materially smaller/thinner than the visual target (P2). Fixed with Three.js `Line2` screen-space ribbons, separated colored strands, bounded particles, and a larger selected-body scale.
6. Pass 4 full-view and focused comparisons show the opal world as the primary subject, a continuous colored musical braid, a supporting rather than dominant star, and a sparser overall composition than the reference by deliberate product choice. No P0/P1/P2 differences remain.

**Primary interactions tested**

- Play and pause audio transport.
- Drag to leave follow mode and enter free flight.
- Explicit zoom in/out updates the AU scale.
- Touching a luminous orbit strand produces `ORBIT PLUCK · EUROPA`, records the gesture, and leaves camera follow intact; sweeping can strum adjacent strands.
- `CREATE WORLD` opens an explicit three-step guide.
- Press/hold/drag/release births a world, starts audio, closes guidance, and follows `NOVA-1`.
- The complete create-world flow also passes at 390 × 844.
- Systems opens and closes; selecting Penta resets the work to a five-voice universe.
- Fresh browser navigations after the implementation changes produced no console warnings or errors.

**Implementation checklist**

- [x] Sparse full-bleed Three.js art scene
- [x] Event-driven luminous motion and screen-space color ribbons
- [x] Fly, orbit, follow, scroll/pinch, and explicit zoom
- [x] Guided creation of sounding worlds
- [x] Starting universes and existing instrument views
- [x] Responsive and reduced-motion render profiles
- [x] Desktop/mobile browser evidence and console checks

final result: passed
