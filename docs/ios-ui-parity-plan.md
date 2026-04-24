# iOS UI Parity Plan

## Audit Source

This audit is based on the current repository code, primarily:

- Web login/player gate: `app/page.tsx`, `app/home-player-gate.tsx`, `app/globals.css`
- Web reader: `app/(player)/play/page.tsx`, `app/(player)/play/player-story-reader.tsx`
- Web motion/cinematic helpers: `app/(player)/play/player-story-reader-motion.ts`, `app/(player)/play/player-scene-lighting.ts`, `app/(player)/play/chapter-card-handwriting.tsx`
- Web boundary model: `app/(player)/play/player-story-reader-boundary.ts`, `packages/story-core/src/boundary.ts`
- Native app before this pass: `apps/ios/src/screens/SignInScreen.tsx`, `apps/ios/src/screens/BootstrapScreen.tsx`, `apps/ios/src/screens/ReaderScreen.tsx`, `apps/ios/src/reader/readerPresentation.ts`, `apps/ios/src/reader/boundaryPresentation.ts`, `apps/ios/src/audio/AudioControls.tsx`

## Web Player Experience

### Login / Gate

The web entry point redirects signed-in players to `/play`. Signed-out players see a minimal fullscreen gate:

- dark radial background with cyan/blue glows
- low-opacity animated grid
- centered rounded password pill
- collapsed circular arrow button that expands to reveal the password input
- white circular submit button
- red shake/color feedback on invalid attempts

### Home / Continue / Restart / Profile

The web player does not currently have a separate rich player home screen after sign-in. `/play` loads runtime data and resumes from saved progress inside the reader. Continue/restart/profile management currently exists on iOS, not as a matching web screen.

### Reader Shell

The web reader is a cinematic stage:

- black root background
- centered portrait-ratio stage using the active background image aspect ratio
- stage fills `100dvh`
- desktop-only temporary nav gutters can appear when there is enough side space
- normal mobile experience keeps the story stage dominant and uncluttered

### Background / Layering

The web stage renders the scene background image as full-cover media. It samples image luminance and builds a dark vertical overlay that becomes heavier toward the bottom. This protects dialogue readability without replacing the artwork.

### Character Staging

The web player uses the runtime visible-stage asset rules:

- character lines show only the active speaker portrait on the speaker side
- narrator and dress-prompt lines do not show extra inactive portraits
- cat-name prompt shows the prompt character on the right side, even when sourced from the left stage slot or character pool
- portraits sit behind the dialogue card in the lower 72-78% of the stage
- portraits animate from their side and use scene-lighting filters/drop shadows

### Dialogue Card

The dialogue card is a bottom glass surface:

- rounded `28px`
- `border-white/10`
- `bg-slate-950/82`
- backdrop blur
- `p-5`
- positioned opposite character speakers when possible
- centered for narrator and dress-prompt lines
- cat-name prompt card is left-biased to leave the right prompt character visible

Character names are uppercase and widely tracked, except `Ocnoer`, which uses a large script-like character-name font. Dialogue text uses the dialogue serif font. Continue is a small circular arrow that appears only after typing is ready.

### Narrator vs Character

Narrator entries do not show a speaker label in the web dialogue card. Character entries show a speaker label and active portrait staging. The card motion direction changes based on speaker side.

### Cat-Name Prompt

The web prompt:

- uses the left-biased card placement
- labels the card "Name your cat"
- hides normal dialogue text while the input is active
- validates and saves via the continue arrow
- locks cat name into branch flags and later server sync

### Dress Prompt

The web dress prompt:

- uses a centered card
- renders prompt text in a large script-like dress-prompt font
- shows one outfit preview card at a time
- has circular previous/next arrow controls
- selecting the visible outfit advances the story

### Boundary / Transition Cards

The web player has multiple boundary presentations:

- chapter opening card: fullscreen black with handwriting reveal
- chapter ending card: fullscreen black with handwriting reveal, optional delayed music intro
- chapter break card: top glass panel with chapter title/meta and begin action
- scene transition: black overlay, asset preload, optional music fade, then reveal
- story-finished state: black terminal state after the ending card

### Motion / Cinematics

Important web motion patterns:

- dialogue enter/exit from side or bottom
- per-character typing delay with punctuation pauses
- chapter-card handwriting reveal with pause markers
- opening scene fade from black
- scene-change blackout with preload timeout and post-swap hold
- short inline-music blackout when music cues change
- map overlay fade/scale
- reduced-motion fallbacks

### Audio Controls

The web reader controls background music through an HTML audio element and transition helpers. There is not a prominent in-reader audio control panel in the web UI. The iOS app keeps a visible mute/preference control because native audio state and user preference need a reachable control.

### Map / Overlay UI

The web reader has a tap-revealed top header. That header includes:

- previous dialogue
- world map
- sign out

The map opens as a fullscreen black/blur overlay with the `lore/world-map.jpg` image and a close button.

## iOS Before This Pass

Already working on iOS:

- native sign-in/session restore
- runtime bootstrap loading
- profile cat-name update
- synced progress loading/clearing/restarting
- reader advance/retreat
- cat-name prompt behavior
- dress option selection behavior
- boundary state handling
- native background music playback and mute preference

Parity gaps before this pass:

- sign-in looked like a generic form, not the web gate
- home/bootstrap was a debug-style runtime dashboard
- reader used a stacked header/audio/stage/dialogue layout instead of a fullscreen stage
- cards used small 8px radii and teal utility styling instead of Ocnoer glass surfaces
- iOS showed all staged characters rather than the web-visible active portrait rules
- narrator, character, cat-name, and dress prompt presentation were not visually distinct enough
- boundary cards were plain panels, not cinematic black/chapter cards
- no native transition-layer primitives existed
- map overlay and tap-revealed chrome were missing

## Implemented In This Step

### Native UI Foundation

Added centralized iOS UI foundation:

- `apps/ios/src/ui/theme.ts`
- `apps/ios/src/ui/primitives.tsx`

The foundation includes dark Ocnoer colors, spacing, typography, radii, opacity, shadows, stage constants, reusable background/glow/grid treatment, glass surfaces, pill buttons, icon buttons, text inputs, info rows, and pills.

### Native Reader Presentation Foundation

Added reusable reader pieces:

- `apps/ios/src/reader/components/NativeCinematic.tsx`
- `apps/ios/src/reader/components/NativeReaderStage.tsx`
- `apps/ios/src/reader/components/NativeReaderDialogue.tsx`
- `apps/ios/src/reader/components/NativeReaderBoundaryCard.tsx`

These provide stage scrims, fade-in wrapper, blackout overlay primitive, fullscreen background/portrait staging, bottom dialogue cards, prompt styling, and boundary card presentation.

### Sign-In

The iOS sign-in screen now uses a native approximation of the web gate:

- fullscreen dark Ocnoer background
- glow/grid atmosphere
- centered rounded credential pill
- collapsed-to-expanded credential input
- white circular submit control
- compact error presentation

### Bootstrap / Home

The iOS bootstrap screen now uses the new native theme:

- dark cinematic background
- profile, reading, audio, and runtime sections as glass/quiet surfaces
- clearer continue/start/restart/clear action hierarchy
- retained cat-name edit, progress sync warnings, preview, and sign-out behavior

### Reader

The iOS reader now moves toward the web structure:

- fullscreen stage frame
- full-cover background image
- top/bottom scrim layering
- active visible portrait placement behind dialogue
- compact top reader chrome
- bottom glass dialogue card
- narrator/character/cat-name/dress prompt styling differences
- chapter and story boundary cards use stronger cinematic black/glass presentation
- scene/moving blackout primitive is wired in lightly

### Visible Stage Parity

`apps/ios/src/reader/readerPresentation.ts` now derives native portraits from the same `getPlayerRuntimeAssetUrls` visible-stage rules used by the web player, rather than showing every staged character. This is an important behavioral/visual parity fix.

## Remaining Work For Near-Full Parity

- Exact native equivalent of web typewriter timing and punctuation pauses.
- Exact chapter handwriting reveal and pause-marker behavior.
- Opening scene fade timing that matches the web's chapter-card-to-scene transition.
- Scene-change and inline-music blackout sequencing with asset preload waits and music fade timing.
- Native map overlay using the world map asset.
- Tap-revealed reader chrome matching the web header behavior.
- Dress prompt carousel parity: one visible outfit, arrow navigation, select-to-advance.
- Better native iconography for back/next/audio/map/sign-out controls.
- Native font loading for closer matches to Literata, Tangerine, Imperial Script, and Bad Script.
- Adaptive scene-lighting analysis for portrait filters/shadows.
- More exact safe-area handling around bottom dialogue card and keyboard states.
- Hiding or relocating native audio controls if product decides web parity should outweigh native preference visibility.

## Later-Step Blockers / Dependencies

- Font parity needs bundled native fonts or an Expo font-loading pass.
- Lighting parity likely needs a native image sampling strategy or a precomputed scene-lighting profile in runtime data.
- Full cinematic parity needs a deliberate native transition state machine; this pass only lays down reusable overlay/card primitives.
- Map parity needs asset strategy for `lore/world-map.jpg` in the native bundle or a public runtime URL.
