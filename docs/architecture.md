# Architecture

## Purpose

Ocnoer uses a lightweight authoring system for one admin user. Runtime story playback is driven entirely by generated JSON and media files, not by live database queries.

## System Shape

- One Next.js App Router app
- `/admin` for authoring
- `/play` for runtime playback
- Supabase Storage for:
  - authoring JSON
  - runtime JSON
  - uploaded media

## Persistent Storage Layout

Within `SUPABASE_RUNTIME_BUCKET`:

- `authoring/characters.json`
- `authoring/assets.json`
- `authoring/chapters.json`
- `media/characters/...`
- `media/background-images/...`
- `media/background-music/...`
- `runtime/manifest.json`
- `runtime/characters.json`
- `runtime/assets.json`
- `runtime/chapters/<chapterId>.json`

## Authoring Flow

1. Admin logs in with the single password.
2. Admin edits characters, emotions, assets, chapters, scenes, and dialogue.
3. Server actions update the authoring JSON files in storage.
4. After each mutation, runtime JSON is recompiled and written back to `runtime/...`.

## Runtime Flow

1. `/play` fetches `runtime/manifest.json`.
2. The client loads the relevant chapter bundle from `runtime/chapters/<chapterId>.json`.
3. Backgrounds, music, and character emotion images are used directly from storage paths embedded in the bundle.
4. No runtime chapter/scene/dialogue endpoint is required.

## Admin Protection

- No multi-user auth system
- One password from `ADMIN_PASSWORD`
- Password is validated on the server
- Successful login sets an HttpOnly cookie
- Admin routes and actions require that cookie

## Progress

- Player progress is separate from authored content
- Saved only in `localStorage`
- Uses stable ids:
  - `chapterId`
  - `sceneId`
  - `dialogueEntryId`
- Includes `branchFlags` for future branching support

