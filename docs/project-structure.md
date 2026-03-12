# Project Structure

## Purpose

This document describes the intended repository structure for Ocnoer.

The repo does not yet contain the application scaffold. This file defines the target layout that development should converge toward.

## Current State

Today, the repository primarily contains documentation plus worldbuilding reference files inside `/lore`.

Current lore material includes:

- `lore/story-structure.md`
- `lore/story-summary.md`
- `lore/world-overview.md`
- `lore/appendix.md`
- `lore/world-map.jpg`

## Canonical Content Separation

Ocnoer should separate two kinds of content:

### 1. Reference Lore

Reference lore is static story context used by developers and AI agents.

This belongs in `/lore`.

Examples:

- world overview
- story summary
- appendix
- maps
- naming references

### 2. Runtime Story Content

Runtime story content is the playable application data shown to the player.

This does not live in markdown files for MVP. It should live in the database and be authored through the admin interface.

Examples:

- chapters
- scenes
- dialogue entries
- player prompts
- publication state
- asset references

## Target Repository Layout

```text
/
├── README.md
├── docs/
│   ├── architecture.md
│   ├── development-guide.md
│   ├── game-flow.md
│   ├── project-structure.md
│   ├── roadmap.md
│   └── tech-stack.md
├── lore/
│   ├── appendix.md
│   ├── story-summary.md
│   ├── story-structure.md
│   ├── world-map.jpg
│   └── world-overview.md
├── app/
│   ├── (player)/
│   ├── (admin)/
│   ├── api/
│   ├── layout.tsx
│   └── page.tsx
├── components/
├── lib/
├── prisma/
│   └── schema.prisma
├── public/
└── package.json
```

This structure is a target state, not a statement that all folders already exist.

## Intended Responsibilities

### `docs/`

Planning and implementation guidance for humans and AI agents.

### `lore/`

Canonical home for worldbuilding and narrative reference documents.

Important rule:

- `/lore` supports writing and implementation context
- `/lore` is not the source of runtime chapter and scene records for MVP

### `app/`

The Next.js App Router application.

Expected responsibilities:

- player-facing routes
- admin-facing routes
- route-level auth boundaries
- API endpoints or server actions where needed

### `components/`

Reusable UI components shared between player and admin surfaces.

Expected examples:

- dialogue box
- portrait display
- scene shell
- admin form controls
- tables and filters

### `lib/`

Shared application code and integrations.

Expected examples:

- auth helpers
- database client setup
- storage helpers
- domain utilities
- route guards

### `prisma/`

Database schema and migration history.

Expected contents:

- `schema.prisma`
- migrations
- optional seed scripts

### `public/`

Static files that belong in the repo and ship directly with the app.

Use `public/` only for true static assets. User-authored scene media should live in Supabase Storage instead.

## Structural Rules

- Keep reference lore separate from runtime story records.
- Keep player and admin experiences inside one Next.js application.
- Do not build a second repo or second frontend for MVP.
- Prefer shared domain utilities over duplicated logic between route areas.
- Treat `/docs` as implementation guidance and `/lore` as narrative context.

## Alignment Note

The repository now matches the intended lore placement. Future structural work should focus on adding the application folders, not relocating reference materials again.
