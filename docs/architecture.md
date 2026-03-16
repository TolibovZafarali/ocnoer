# Architecture

## Purpose

This document describes the current Ocnoer application architecture after the published-runtime refactor.

The system now separates:

- authoring data in relational tables
- published runtime artifacts in Supabase Storage
- player-specific state in backend tables plus local client persistence

The core rule is that the player-facing runtime does not read authoring tables during normal reading/gameplay.

## System Shape

Ocnoer is a single `Next.js` App Router application with two route areas:

- `app/(admin)` for story authoring, publishing, rollback, and response review
- `app/(player)` for reading published story content

Primary infrastructure:

- `Supabase Auth` for session and role access
- `PostgreSQL + Prisma` for authoring data, publish metadata, and user state
- `Supabase Storage` for media assets and published runtime JSON artifacts

## High-Level Pipeline

The system operates as:

`authoring tables -> publish compiler -> versioned manifest + chapter bundles -> player runtime`

### Authoring Layer

- Story source of truth remains relational.
- Core authored entities include:
  - `Chapter`
  - `Scene`
  - `DialogueEntry`
  - `Character`
  - `CharacterPortrait`
  - `SceneCharacterAppearance`
  - `MediaAsset`
  - `House`
- Runtime-stable `publicId` values exist on `Chapter`, `Scene`, `DialogueEntry`, and `Character`.
- Admin editing continues to use server actions and repository mutations against the authoring schema.

### Publish Layer

- Admin triggers publish manually from `/admin`.
- The publish service reads the authored story graph, validates it, and compiles runtime artifacts.
- Phase one artifact shape:
  - one root manifest
  - one bundle per chapter
- Artifacts are stored in a public runtime bucket under immutable versioned prefixes such as `story/v3/...`.
- `PublishedStoryVersion` tracks publish history, active version, manifest location, and storage prefix.
- Rollback reactivates an existing published version without recompiling artifacts.

### Player Runtime Layer

- `/play` resolves the signed-in player, pinned published version, and existing reading progress.
- The server loads:
  - active or pinned `PublishedStoryVersion`
  - published manifest JSON
  - the current chapter bundle JSON
- The reader progresses entirely in client state within the loaded bundle.
- The reader prefetches the next chapter bundle when available.
- Prompt submissions validate against the published bundle for the pinned version before persistence.

### User State Layer

- `ReadingProgress` stores server-side checkpoints:
  - `publishedVersionId`
  - `chapterPublicId`
  - `scenePublicId`
  - `dialogueEntryPublicId`
  - `lastReadAt`
- The client mirrors progress in `localStorage` for instant resume.
- Progress sync is debounced through `/api/player/progress`.
- `PlayerResponse` stores prompt submissions against published runtime ids and denormalized prompt context rather than live authoring foreign keys.

## Roles And Access

### `admin`

- authors and edits story content
- publishes new runtime versions
- rolls back to older published versions
- reviews player prompt submissions

### `player`

- reads published story content only
- submits prompt responses when prompted
- resumes from pinned published-version checkpoints

Route and action access is role-gated through Supabase session metadata and server-side guards.

## Published Runtime Contract

### Manifest

The root manifest contains only runtime navigation data:

- schema version
- published version id and version number
- generated timestamp
- first chapter id
- ordered chapter index
- bundle path for each chapter

### Chapter Bundle

Each chapter bundle contains only what the reader needs:

- chapter metadata
- ordered scenes
- ordered dialogue entries
- scene media refs
- character presentation data
- prompt metadata
- next chapter id

The runtime bundle intentionally avoids mirroring the full authoring schema.

## Data Flows

### Admin Authoring Flow

1. Admin signs in.
2. Admin edits chapters, scenes, dialogue, appearances, and media references.
3. Server actions persist authoring changes to PostgreSQL.
4. Admin publishes when the story graph is valid.

### Publish Flow

1. Load the full authoring graph from the repository layer.
2. Validate minimum publishability:
   - at least one chapter
   - each chapter has at least one scene
   - each scene has at least one dialogue entry
   - scene media and prompt rules remain valid
3. Compile deterministic runtime JSON.
4. Upload manifest and chapter bundles to Supabase Storage.
5. Create and activate a `PublishedStoryVersion`.

### Player Reading Flow

1. Player signs in.
2. `/play` resolves the player account in the app database.
3. The app chooses a published version:
   - existing progress version if present
   - otherwise the active published version
4. The app loads manifest and current chapter bundle from published storage.
5. The client advances entry-to-entry locally without backend reads.
6. The client prefetches the next chapter bundle.

### Progress Persistence Flow

1. Reader position changes in client state.
2. A checkpoint is serialized to `localStorage` immediately.
3. Backend sync is debounced and flushed on meaningful transitions.
4. On resume, the app prefers the newer valid checkpoint between local and server state for the pinned version.

## Boundaries

The following remain intentionally out of scope in phase one:

- branching story logic
- player-choice-driven alternate bundles
- scheduled publishing
- service-worker-driven offline mode
- multi-user collaborative authoring workflows
