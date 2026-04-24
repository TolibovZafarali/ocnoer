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
  resolution, and resume decisions

Not shared yet:

- Next.js route files
- server actions
- cookie-based auth/session code
- Supabase service-role code
- DOM, browser, audio, and React UI code
- localStorage persistence implementation

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

1. Add small tests for `packages/story-core` so shared reader behavior is locked
   before the mobile reader is implemented.
2. Define an iOS persistence adapter to replace the current web-only
   `localStorage` progress storage.
3. Define a mobile-safe runtime config path that never ships service-role
   secrets.
4. Build a first native reader screen in `apps/ios` using the shared story
   contracts, starting with static bundled/mock runtime data.
5. Add mobile-specific audio and image preloading adapters after the reader
   screen shape is stable.
