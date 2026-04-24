# Mobile Monorepo Plan

## What Changed

The repository is now a pnpm workspace monorepo while the existing Next.js web
app remains at the repository root.

Workspace layout:

- `/` remains the current Next.js website.
- `apps/ios` is a minimal Expo TypeScript scaffold for the future iOS player.
- `packages/story-core` is a shared TypeScript package for portable story/player
  logic.

The workspace is configured in `/pnpm-workspace.yaml` with:

- `.`
- `apps/*`
- `packages/*`

## Shared Code Boundary

`packages/story-core` is for code that can reasonably run in both the Next.js
web app and a React Native app.

Currently shared:

- runtime story data contracts from `lib/story/types.ts`
- reader state and progression logic from `lib/story/reader.ts`
- wardrobe/dress branch flag logic from `lib/story/wardrobe.ts`
- primary character staging helper from `lib/story/staging.ts`
- platform-safe runtime helpers for public storage URLs, scene asset URL
  resolution, runtime manifest/chapter fetching, bootstrap loading, and resume
  decisions

Not shared yet:

- Next.js route files
- server actions
- cookie-based auth/session code
- Supabase service-role code
- DOM, browser, audio, and React UI code
- localStorage persistence implementation

## iOS Runtime Configuration

The Expo app loads only public runtime files. It does not use Next.js cookies,
server actions, server-only helpers, Supabase service-role keys, or private
bucket configuration.

Set these values before starting `apps/ios`:

- `EXPO_PUBLIC_OCNOER_API_BASE_URL`: the public URL for the Next.js backend
  that serves the mobile player API. In local simulator development this is
  usually `http://localhost:3000`. For physical-device development, start the
  backend with `pnpm dev:mobile-api` so it listens on the LAN, then use the Mac
  LAN URL such as `http://192.168.1.10:3000`.
- `EXPO_PUBLIC_OCNOER_SUPABASE_URL`: the public Supabase project URL, matching
  the web app's `NEXT_PUBLIC_SUPABASE_URL`.
- `EXPO_PUBLIC_OCNOER_RUNTIME_MANIFEST_PATH`: the public storage path for the
  published runtime manifest, for example `runtime/runtime/manifest.json` when
  the runtime bucket is `runtime`.

`apps/ios/.env.example` contains placeholder values for the required public
Expo variables.

The mobile app reads those values in `apps/ios/src/config/runtime.ts`, creates a
runtime repository in `apps/ios/src/runtime/runtimeRepository.ts`, then calls
the shared `@ocnoer/story-core` loader. The loader turns storage paths from
`runtime/manifest.json` and chapter bundle entries into Supabase public object
URLs and fetches the same JSON files used by the web player.

The root web app still derives its manifest path from
`SUPABASE_RUNTIME_BUCKET` on the server in `lib/story/runtime.ts`. That
server-only boundary is not imported by the iOS app.

## Current iOS Runtime Bootstrap

`apps/ios` now has a real bootstrap flow:

- loading state while the manifest and first playable bundle are fetched
- error state for missing public env or failed runtime fetches
- success state showing manifest version, generated timestamp, chapter count,
  initial chapter id/title, runtime host, and manifest path
- chapter preview screen that fetches a real chapter bundle and displays the
  chapter title, scene id/title, scene count, and the first dialogue entries
  with speaker names

This is deliberately not the final mobile reader. It proves authenticated
published data access without implementing save/resume sync, final reader
animations, music playback, image staging, or the complete player UI.

## iOS Mobile Player Auth

The web player still uses its existing Next.js cookie and server-action flow.
The iOS app uses separate mobile-safe API routes and never imports Next.js
cookies, server actions, or server-only helpers.

Added mobile endpoints:

- `POST /api/mobile/player/session`: accepts `{ "secret": "..." }` or
  `{ "password": "..." }`, validates the same player profile credential used by
  the web player, and returns a signed bearer token plus minimal player data.
- `GET /api/mobile/player/session`: validates
  `Authorization: Bearer <token>` and returns the current mobile session/player
  payload.
- `DELETE /api/mobile/player/session`: stateless logout acknowledgement for the
  mobile client.
- `GET /api/mobile/player/profile`: validates the bearer token and returns the
  current player payload.
- `PATCH /api/mobile/player/profile/cat-name`: validates the bearer token and
  applies the same one-time cat-name update rule used by the web player.

The signed token is created and validated server-side in
`lib/auth/player-session.ts`. `lib/auth/player.ts` remains the web cookie
wrapper, so the current website sign-in flow is preserved.

On iOS:

- `apps/ios/src/api` contains the mobile API client and response types.
- `apps/ios/src/storage/playerSessionStorage.ts` stores the small mobile
  session payload in `expo-secure-store`.
- `apps/ios/src/hooks/usePlayerSession.ts` restores the stored token on launch,
  validates it with the backend, and clears it if invalid.
- `apps/ios/src/screens/SignInScreen.tsx` provides the basic player credential
  sign-in screen.

## iOS Local Progress Storage

`apps/ios/src/storage/playerProgressStorage.ts` defines the local mobile
progress adapter used by the native reader MVP. It stores `PlayerProgress` records
from `@ocnoer/story-core` in AsyncStorage by player id:

- `loadProgressByPlayerId(playerId)`
- `saveProgressByPlayerId(playerId, progress)`
- `clearProgressByPlayerId(playerId)`

This is local-only persistence. It intentionally does not sync progress to the
backend yet, and it intentionally keeps progress out of SecureStore.

## iOS Native Reader MVP

`apps/ios` now has a first playable native reader flow after mobile sign-in:

- the authenticated player lands on a simple home screen
- the home screen shows player identity, cat-name status, runtime metadata, and
  local saved progress when present
- `Start Reading` opens the reader at the initial playable runtime position
- `Continue Reading` resumes from the saved local `PlayerProgress`
- `Restart From Beginning` clears local progress and opens the initial runtime
  position
- `Clear Local Progress` resets local progress without signing the player out
- the chapter preview remains available as a development/debug view

The native reader uses the same published manifest/chapter bundle source as the
web player and calls shared `@ocnoer/story-core` helpers for runtime loading,
resume decisions, chapter-to-chapter advance/retreat, progress serialization,
public media URL resolution, and wardrobe branch flags.

The current public runtime audited for this parity step was generated on
2026-04-23 and contains one published chapter, 14 playable scenes, and these
entry types: `narrator`, `character`, `cat_name_prompt`, and `dress_prompt`.
The native reader does not fake content for any other entry type.

Supported native reader presentation types:

- `narrator`: renders narrator label and dialogue text
- `character`: renders speaker name, dialogue text, scene background, active
  speaker emphasis, and visible staged portraits when the runtime provides them
- `cat_name_prompt`: renders a basic native cat-name input and persists through
  the existing mobile profile API before continuing; staged scene characters
  remain visible when present
- `dress_prompt`: renders basic selectable outfit options and stores the chosen
  dress key in local progress branch flags; the prompt also uses the simplified
  native staging renderer

The reader deliberately surfaces unsupported future runtime entry types as an
in-reader error instead of silently skipping them.

Supported native boundary states:

- chapter opening card for a fresh start or restart when the chapter has
  authored opening text
- chapter ending card when the chapter has authored ending text
- scene-transition card when shared progression reports a scene transition
- chapter-break card when progression enters another published chapter
- story-finished card after the final published entry or after a terminal
  chapter ending card

Basic immersion support in this MVP:

- scene background images render with a simple dark overlay when available
- up to two staged characters render in native left/right slots using runtime
  `stage.left` and `stage.right`
- active character/dress-prompt speakers are emphasized when they match a
  staged character
- narrator entries keep authored staged characters visible instead of blanking
  the stage
- dress option previews render when runtime preview image paths are available
- current background, next same-chapter background, current staged portraits,
  and current dress previews are preloaded with a short, non-blocking native
  image prefetch
- background, boundary, portrait, and dialogue changes use small native fades

Still missing before rough parity with the web reader:

- full web stage positioning, lighting analysis, and DOM-style portrait motion
- Framer Motion parity, typed text timing, scene blackout choreography, and map
  UI
- background music/audio playback
- next-chapter asset preloading before a chapter bundle has been loaded
- backend progress sync
- full mobile-specific handling for any future branch or prompt types beyond the
  four supported MVP entry types

Native staging simplification versus web:

- iOS reads the portable runtime stage data and preserves only left/right
  placement. It does not import Tailwind, DOM measurements, object-position
  rules, Framer Motion variants, or canvas lighting analysis.
- The web player still owns final visual choreography. The iOS reader currently
  uses a stable two-slot native layout with active-speaker emphasis and graceful
  fallback when a stage side has no image.
- Runtime data currently exposes left/right placement, not an authored center
  slot. Center placement remains a future native-only simplification if content
  requires it.

## Why The Web UI Cannot Be Copied Directly

The current player UI is built for the browser and Next.js. It uses HTML
elements, Tailwind CSS class names, Framer Motion for web, `window`,
`document`, DOM text measurement, canvas image sampling, `<audio>`, Next route
redirects, and Next server actions.

React Native does not render HTML/CSS and does not provide those browser APIs.
The iOS player reader should reuse the story contracts and pure progression
logic, but the screen components, animation layer, persistence adapter, audio
adapter, and auth/session flow must be implemented separately for Expo.

## Next Likely Engineering Steps

1. Add focused tests for newly shared `@ocnoer/story-core` boundary and staging
   helpers as the shared surface grows.
2. Exercise the native boundary/staging pass in the simulator against the
   current public runtime and adjust layout only where real content breaks it.
3. Add backend progress sync once the mobile reader has real progression
   events to save.
4. Add mobile-specific audio/music playback after visual reader parity is
   stable.
5. Revisit map UI, typed text, lighting, and richer scene transitions after the
   native reader can complete the currently published chapter comfortably.
