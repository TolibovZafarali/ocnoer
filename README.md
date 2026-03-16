# Ocnoer

Ocnoer is a private interactive story web app with two authenticated roles:

- `admin` (`Alvyn`) authors and publishes story content.
- `player` (`Ocnoer`) reads published story content and submits occasional text responses.

The experience remains narrative-first and mostly linear, centered on chapter, scene, and dialogue presentation.

## Current Status

The app now runs on a published-runtime architecture:

- admin authoring remains in Prisma/PostgreSQL
- published story content is compiled into versioned runtime artifacts
- player runtime reads a published manifest plus per-chapter bundles
- player progress is local-first with backend checkpoint sync
- prompt responses are saved against published runtime ids instead of authoring-table ids
- Supabase Auth still owns session and role access
- Supabase Storage serves published JSON artifacts and media assets

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

## Scripts

- `corepack pnpm dev`
- `corepack pnpm build`
- `corepack pnpm start`
- `corepack pnpm lint`
- `corepack pnpm test`
- `corepack pnpm typecheck`
- `corepack pnpm format`
- `corepack pnpm format:check`

## Environment Variables

Defined in `.env.example`:

- `DATABASE_URL`: PostgreSQL connection string used by Prisma (server-only)
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL (public)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anon key for client-side auth calls (public)
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase privileged key for trusted server operations (server-only)
- `SUPABASE_RUNTIME_BUCKET`: public Supabase Storage bucket for published story artifacts
- `ADMIN_LOGIN_EMAIL`: fixed admin account email used for password-only sign-in
- `PLAYER_LOGIN_EMAIL`: fixed player account email used for password-only sign-in

## Auth Role Contract

- Role is read from `app_metadata.role` in Supabase Auth.
- Valid values are only `admin` and `player`.
- Missing or invalid role metadata forces sign-out and redirects to `/sign-in`.

## Runtime Overview

### Authoring

- Admin edits chapters, scenes, dialogue entries, characters, appearances, and media references in relational tables.
- Authoring records carry stable `publicId` values so published artifacts can remain decoupled from internal database ids.

### Publish Flow

1. Admin edits story content in `/admin`.
2. Admin runs a manual publish action.
3. The server validates the current authoring graph.
4. The publish service compiles:
   - one root manifest
   - one bundle per chapter
5. Artifacts are uploaded to `SUPABASE_RUNTIME_BUCKET` under immutable versioned paths such as `story/v3/...`.
6. A `PublishedStoryVersion` row is created and marked active.
7. Older published versions remain available for rollback.

### Player Runtime Flow

1. Player opens `/play`.
2. The app resolves the player account and pinned published version.
3. The app loads the published manifest and the current chapter bundle from Supabase Storage.
4. Dialogue progression inside the loaded chapter happens entirely in client state.
5. The reader prefetches the next chapter bundle when possible.
6. Prompt submissions and progress sync go back to the backend, but normal line-by-line reading does not hit authoring tables.

### Progress Persistence Flow

- Reader position is stored locally in `localStorage` for instant resume.
- The client debounces checkpoint syncs to `/api/player/progress`.
- Checkpoints store:
  - `publishedVersionId`
  - `chapterPublicId`
  - `scenePublicId`
  - `dialogueEntryPublicId`
  - `lastReadAt`
- In-progress readers stay pinned to the version they started on.

## Documentation Map

- [architecture.md](/Users/zafaralitolibov/Documents/ocnoer/docs/architecture.md)
- [tech-stack.md](/Users/zafaralitolibov/Documents/ocnoer/docs/tech-stack.md)
- [project-structure.md](/Users/zafaralitolibov/Documents/ocnoer/docs/project-structure.md)
- [game-flow.md](/Users/zafaralitolibov/Documents/ocnoer/docs/game-flow.md)
- [development-guide.md](/Users/zafaralitolibov/Documents/ocnoer/docs/development-guide.md)
- [roadmap.md](/Users/zafaralitolibov/Documents/ocnoer/docs/roadmap.md)
