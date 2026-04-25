# iOS UI Parity Plan

## Source Of Truth Audited

This pass used the current web player code as the reference, not screenshots or guesses:

- Login gate: `app/page.tsx`, `app/home-player-gate.tsx`, `app/globals.css`
- Reader shell: `app/(player)/play/page.tsx`, `app/(player)/play/player-story-reader.tsx`
- Reader motion: `app/(player)/play/player-story-reader-motion.ts`
- Scene lighting: `app/(player)/play/player-scene-lighting.ts`
- Chapter handwriting card: `app/(player)/play/chapter-card-handwriting.tsx`
- Boundary state model: `app/(player)/play/player-story-reader-boundary.ts`, `packages/story-core/src/boundary.ts`
- Shared runtime asset selection: `packages/story-core/src/runtime.ts`

## Extracted Web Rules

### Login / Gate

Exact web structure:

- Fullscreen `home-player-gate` with a dark radial background, cyan/blue glows, and a low-opacity grid.
- One centered pill, collapsed at `72px` square and expanded to `min(26rem, calc(100vw - 2rem))`.
- Pill height `72px`, `rounded-full`, `border-white/10`, `bg-black/35`, heavy dark shadow, backdrop blur.
- Inner expanded layout uses `gap-2 pl-5 pr-2`; collapsed layout centers a `56px` white circular arrow.
- Submit arrow is white background, slate-950 foreground, and no visible label text.

Native match:

- `SignInScreen` now uses the same collapsed/expanded structure, `72px` shell, `56px` white arrow, `rgba(0,0,0,0.35)` pill, `white/10` border, and dark gate atmosphere.

Native approximation:

- React Native does not provide the same CSS radial gradients, blur filters, or Framer spring/shake behavior without extra dependencies. The glow/grid background is approximated with native layers.

### Home / Continue / Restart

Exact web structure:

- There is no separate web home screen after login. Signed-in players redirect directly to `/play`; resume and runtime loading happen inside the reader.

Native match:

- The native home keeps required iOS-only controls, but uses the web reader/gate visual language: black stage field, top utility chrome, bottom `bg-slate-950/82` glass panel, and the same primary continue/restart/clear hierarchy.

Native approximation:

- Profile, progress reset, preview, and audio preference controls are native-only surfaces because the web player does not currently expose an equivalent home screen.

### Reader Shell / Stage

Exact web structure:

- Root is black and centers a stage with `h-[100dvh] w-screen`, `overflow-hidden`, and `bg-slate-950`.
- Stage max width is `calc(100dvh * stageAspectRatio)`, where web reads the active background image dimensions and updates `stageAspectRatio`.
- Background media is absolute full-cover; missing background falls back to black.
- Desktop-only temporary nav gutters appear only when side gutters are wide enough.

Native match:

- `ReaderScreen` now centers a full-height stage and constrains stage width to `min(screenWidth, screenHeight * 9 / 16)`, preserving the web portrait-stage feel on iPad/landscape while remaining full width on iPhone.
- The native reader root is black and no longer uses the decorative gate background for reader states.

Native approximation:

- Native currently uses the web default `9 / 16` stage ratio rather than sampling remote background dimensions. Exact per-scene aspect parity still needs native image-size probing wired into the stage frame.
- Desktop temporary nav gutters are intentionally not copied to iOS.

### Background Overlay / Lighting

Exact web structure:

- Web samples image luminance with canvas and applies `linear-gradient(180deg, rgba(2,6,17,0.08) 0%, rgba(2,6,17,0.18) 22%, rgba(2,6,17,0.36) 54%, rgba(2,6,17,0.84) 100%)`, scaled by scene lighting strength.
- Portrait filters use brightness, contrast, saturation, and drop shadow derived from scene luminance.

Native match:

- Native stage now uses a lighter top scrim and heavier bottom scrim to match the web overlay shape more closely.

Native approximation:

- React Native does not have the same CSS linear-gradient or canvas luminance path here. Current overlay and portrait lighting are static approximations.

### Portraits

Exact web structure:

- Visible portraits come from `getPlayerRuntimeAssetUrls`.
- Character lines show only the active speaker on the speaker side.
- Narrator and dress prompts do not show extra inactive portraits.
- Cat-name prompt forces the prompt character to the right side.
- Portrait layer is bottom-aligned at `h-[72%] md:h-[78%]`; each side is `w-[52%] max-w-[22rem]` on mobile and `md:w-[46%]`.

Native match:

- Native presentation already uses the shared runtime visible-asset rules and now sizes portrait slots with `52%`, bottom `72%`, and max width `352px`.
- Inactive portrait dimming/scaling was removed because the web visible-stage rules mostly avoid showing inactive portraits in player dialogue.

Native approximation:

- Native still lacks web side-enter/exit motion and scene-derived CSS filters.

### Dialogue Card

Exact web values:

- Position: absolute bottom `clamp(0.75rem, 2vw, 1.25rem)`.
- Radius: `28px`.
- Border: `border-white/10`.
- Fill: `bg-slate-950/82` (`rgba(2, 6, 23, 0.82)`).
- Padding: `p-5` (`20px`).
- Backdrop blur.
- Center placement uses left/right clamp insets.
- Speaker-left placement moves the card to the right half; speaker-right moves it to the left half.
- Cat-name prompt is left-biased with `w-[min(22rem, calc(100%-1.5rem))]` and `md:w-[min(24rem,46%)]`.

Native match:

- Native card tokens now centralize the same fill, border, `28px` radius, `20px` padding, and `12px` bottom/side inset.
- Native placement now mirrors web intent: centered for narrator/dress, opposite-side for character speakers, and left-biased/max-width for cat-name prompt.
- Narrator entries have no speaker label. Character entries keep uppercase tracked labels, with an Ocnoer script approximation.

Native approximation:

- React Native cannot use CSS `clamp()` or backdrop blur with current dependencies, so placement uses fixed native insets and percentage approximations.
- Native font families are system approximations for Literata, Tangerine, Imperial Script, and Bad Script.

### Prompts

Exact web cat-name prompt:

- Left-biased card.
- Label: `Name your cat`.
- Normal dialogue text is hidden while input is active.
- Continue arrow submits the cat name and advances.

Native match:

- Native cat-name prompt now keeps the input inside the web-style dialogue card and uses the continue arrow to submit and advance.

Exact web dress prompt:

- Centered dialogue card.
- Prompt text uses the large dress script font.
- One outfit preview is visible at a time, flanked by circular previous/next arrows.
- Selecting the visible preview stores the dress and advances immediately.

Native match:

- Native dress prompt now uses one visible preview, circular arrow controls, an `n of total` counter, and select-to-advance behavior.

Native approximation:

- Dress prompt slide animation is not yet the web Framer `AnimatePresence` carousel motion.

### Boundary / Ending States

Exact web structure:

- Chapter opening card: fullscreen black, centered handwriting reveal, tap/click to proceed after reveal.
- Chapter ending card: fullscreen black, centered handwriting reveal, optional delayed ending-card music.
- Scene transition: black overlay; preload/wait/fade sequence; no visible card.
- Chapter break: top glass panel with `rounded-[28px]`, `bg-slate-950/82`, `border-white/10`, chapter title/meta, and a Begin Chapter button.
- Story finished: terminal black screen.

Native match:

- Chapter opening and ending cards are now fullscreen black with centered handwriting-style text and tap-to-advance.
- Scene transition now presents as a black pressable transition surface instead of a generic panel.
- Chapter break now uses a top glass panel with the same core card tokens.
- Story-finished state is black rather than a generic completion card.

Native approximation:

- Native handwriting is static text, not the measured web reveal/pen-glow animation.
- Native scene transition still requires a tap to clear the boundary; web performs timed blackout/reveal choreography automatically after advance.

### Chrome / Map / Audio

Exact web structure:

- Web has an invisible full-stage tap target under dialogue.
- Tapping reveals a top header with previous, map, and sign-out icons.
- Header hides again when advancing/back/map actions run.
- Map opens as a fullscreen `bg-black/95` overlay with `lore/world-map.jpg` and a close button.
- Web has an HTML audio element but no prominent in-reader audio panel.

Native match:

- Native reader chrome is now hidden by default and revealed by tapping the stage.
- Revealed chrome includes previous dialogue, map, native home, and compact audio controls.
- Native map uses the actual `lore/world-map.jpg` in a fullscreen black overlay.
- Chrome hides again on advance, retreat, map open, and home.

Native approximation:

- The web sign-out icon is represented by a native home control because `ReaderScreen` does not own sign-out.
- The audio control remains visible in revealed native chrome because native music preferences need an accessible control and there is no matching web UI.

## Files Changed In This Step

- `apps/ios/src/ui/theme.ts`
- `apps/ios/src/ui/primitives.tsx`
- `apps/ios/src/screens/SignInScreen.tsx`
- `apps/ios/src/screens/BootstrapScreen.tsx`
- `apps/ios/src/screens/ReaderScreen.tsx`
- `apps/ios/src/reader/useNativeReaderController.ts`
- `apps/ios/src/reader/components/NativeCinematic.tsx`
- `apps/ios/src/reader/components/NativeReaderStage.tsx`
- `apps/ios/src/reader/components/NativeReaderDialogue.tsx`
- `apps/ios/src/reader/components/NativeReaderBoundaryCard.tsx`

## Still Required Before Honest Near-Parity

- Native stage ratio should follow actual background image dimensions, not only the default `9 / 16`.
- Native typewriter timing and punctuation pauses should match `player-story-reader-motion.ts`.
- Chapter handwriting needs the measured line-by-line reveal and pause marker behavior from `ChapterCardHandwriting`.
- Opening scene fade and scene-transition timing should match the web cover, preload, blackout, post-swap hold, and reveal sequence.
- Inline music cue blackout/fade choreography is still not mirrored.
- Native scene lighting needs image luminance analysis or precomputed lighting data.
- Native fonts should be bundled to match Literata, Tangerine, Imperial Script, and Bad Script more closely.
- Chrome icons should use real icon glyphs/assets rather than text-symbol approximations.
- Native audio controls need a product decision: keep as native-only reachable control, or hide behind a settings surface for stricter web parity.
