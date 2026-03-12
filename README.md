# Ocnoer

Ocnoer is a private interactive story website inspired by visual novel experiences such as "Romance Club: Your Interactive Story."

The project is designed for two users only:

- `admin` (`Alvyn`) creates and manages story content.
- `player` (`Ocnoer`) reads the story and submits occasional text responses.

The story is narrative-first, mostly linear, and centered on scene presentation: background art, music, character portraits, narrator text, and dialogue.

## Status

This repository is in the documentation and planning phase.

The application has not been scaffolded yet. The current repository mostly contains story and worldbuilding source material plus the documentation needed to guide the first implementation pass.

## Project Purpose

Ocnoer is intended to deliver a private, authored story experience rather than an open-ended game system.

Core product goals:

- provide a polished story reader for a single player
- provide a simple admin interface for authoring chapters, scenes, and dialogue
- preserve a mostly linear narrative structure
- save player responses during specific Alvyn conversation moments
- keep story-world reference material available to both developer and AI agents

## Story Model

The core narrative hierarchy is:

`Chapter -> Scene -> DialogueEntry`

Each scene may include:

- background image
- background music
- character portraits
- narrator text
- dialogue sequence
- optional player input prompt

UI rules for the reader:

- Ocnoer appears on the left when she speaks or thinks.
- Other characters appear on the right.
- Narrator text appears in the center.
- The background image fills the scene.
- Each scene can have its own music.

## Current Tech Stack

The current planned stack is:

- TypeScript
- Next.js
- Tailwind CSS
- shadcn/ui
- Framer Motion
- Supabase (PostgreSQL, auth, storage)
- Prisma
- Vercel

This is the current stack, not a permanent final stack. The project may add tools later if needed.

## Current Repository State

At the moment, the repository contains planning material and story-world references rather than a working app.

Current lore material includes:

- `lore/story-structure.md`
- `lore/story-summary.md`
- `lore/world-overview.md`
- `lore/appendix.md`
- `lore/world-map.jpg`

Worldbuilding material now lives under `/lore`, which should remain the canonical home for narrative reference files.

## Documentation Map

These documents define the target MVP and should be treated as the source of truth until code exists:

- [architecture.md](/Users/zafaralitolibov/Documents/ocnoer/docs/architecture.md)
- [tech-stack.md](/Users/zafaralitolibov/Documents/ocnoer/docs/tech-stack.md)
- [project-structure.md](/Users/zafaralitolibov/Documents/ocnoer/docs/project-structure.md)
- [game-flow.md](/Users/zafaralitolibov/Documents/ocnoer/docs/game-flow.md)
- [development-guide.md](/Users/zafaralitolibov/Documents/ocnoer/docs/development-guide.md)
- [roadmap.md](/Users/zafaralitolibov/Documents/ocnoer/docs/roadmap.md)

## Guidance For Developers And AI Agents

Until implementation begins, use the following operating assumptions:

- build one Next.js App Router application, not separate admin and player repos
- support exactly two authenticated accounts with role-based access
- store playable story content in PostgreSQL through Prisma
- store scene media in Supabase Storage
- keep worldbuilding files as reference material, separate from runtime content records
- do not assume branching narrative for MVP
- do not make player responses change story progression in MVP

## Immediate Next Step

The next implementation phase should bootstrap the application structure, authentication model, and database schema described in the docs.
