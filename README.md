# Ocnoer

Ocnoer is a single Next.js app with:

- a password-gated admin authoring area at `/admin`
- a public player at `/play`
- file-based story authoring stored as JSON plus media in Supabase Storage
- generated runtime JSON consumed directly by the player

## Current Architecture

- Admin source-of-truth is file-based, not relational:
  - `authoring/characters.json`
  - `authoring/assets.json`
  - `authoring/chapters.json`
- Media binaries are stored only in persistent storage:
  - `media/characters/...`
  - `media/background-images/...`
  - `media/background-music/...`
- Runtime JSON is generated automatically after each admin mutation:
  - `runtime/manifest.json`
  - `runtime/characters.json`
  - `runtime/assets.json`
  - `runtime/chapters/<chapterId>.json`
- The player fetches runtime JSON and media as static files only.
- Player progress is saved in `localStorage` using stable dialogue IDs.

## Local Setup

1. Install dependencies:
   ```bash
   corepack pnpm install
   ```
2. Create local env file:
   ```bash
   cp .env.example .env.local
   ```
3. Start development server:
   ```bash
   corepack pnpm dev
   ```

## Environment Variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_RUNTIME_BUCKET`
- `ADMIN_PASSWORD`

`SUPABASE_RUNTIME_BUCKET` now holds authoring JSON, generated runtime JSON, and uploaded media.

## Scripts

- `corepack pnpm dev`
- `corepack pnpm build`
- `corepack pnpm test`
- `corepack pnpm typecheck`

## Documentation Map

- [admin-content-system.md](/Users/zafaralitolibov/Documents/ocnoer/docs/admin-content-system.md)
- [architecture.md](/Users/zafaralitolibov/Documents/ocnoer/docs/architecture.md)
- [project-structure.md](/Users/zafaralitolibov/Documents/ocnoer/docs/project-structure.md)
- [tech-stack.md](/Users/zafaralitolibov/Documents/ocnoer/docs/tech-stack.md)
- [game-flow.md](/Users/zafaralitolibov/Documents/ocnoer/docs/game-flow.md)
- [development-guide.md](/Users/zafaralitolibov/Documents/ocnoer/docs/development-guide.md)
- [roadmap.md](/Users/zafaralitolibov/Documents/ocnoer/docs/roadmap.md)

