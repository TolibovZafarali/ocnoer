# Development Guide

## Purpose

This guide explains how development should proceed from the current documentation-first repository state to a working MVP.

The priority is to build the smallest correct system that supports the authored story experience without inventing unnecessary complexity.

## Current Working Assumptions

Treat these as active defaults unless the project direction changes:

- one Next.js App Router application
- two authenticated accounts with role-based access
- PostgreSQL via Supabase
- Prisma for schema and data access
- Supabase Storage for images, portraits, and music
- linear story progression for MVP
- player responses saved for review only

## Build Order

Development should proceed in this order.

### 1. Bootstrap The Application

Create the base Next.js project and shared tooling.

Initial deliverables:

- Next.js App Router scaffold
- TypeScript setup
- Tailwind CSS setup
- shadcn/ui setup
- basic route groups for player and admin
- environment variable structure

Success criteria:

- the app runs locally
- route groups exist
- shared styling and UI foundations are in place

### 2. Implement Authentication And Roles

Add the two-user access model before building content workflows.

Initial deliverables:

- Supabase project connection
- authentication flow
- role-aware session checks
- protected admin area
- protected player area

Success criteria:

- admin can sign in and access admin routes
- player can sign in and access player routes
- cross-role access is blocked

Implementation notes for current milestone:

- sign-in entrypoint is `/sign-in`
- login is password-only with fixed account identities from env:
  - `ADMIN_LOGIN_EMAIL`
  - `PLAYER_LOGIN_EMAIL`
- role is sourced from Supabase Auth `app_metadata.role`
- only `admin` and `player` are valid roles
- invalid or missing roles must force sign-out and redirect to sign-in

### 3. Design The Data Model

Model the story system before building the UI in depth.

Initial deliverables:

- Prisma schema for the core entities
- migrations
- seed or fixture strategy if needed
- basic repository or query helpers

Core entities:

- `User`
- `Character`
- `Chapter`
- `Scene`
- `DialogueEntry`
- `SceneAsset`
- `PlayerResponse`

Success criteria:

- ordered chapters, scenes, and dialogue can be represented cleanly
- scene media references are supported
- player responses can be stored with scene context

### 4. Build Admin Authoring Tools

Build the content-management workflow before polishing the player reader.

Initial deliverables:

- chapter management
- scene management
- dialogue authoring
- character assignment
- media upload or media reference workflows
- player response review screen

Success criteria:

- admin can create a playable chapter with scenes and dialogue
- admin can assign assets and speaking characters
- admin can read stored player responses

### 5. Build The Player Reader

Build the player-facing story experience on top of real content.

Initial deliverables:

- chapter and scene loading
- dialogue progression UI
- narrator and character presentation rules
- portrait placement logic
- background image and music handling
- Framer Motion transitions

Success criteria:

- scenes render in the documented order
- layout rules are respected
- media changes correctly between scenes

### 6. Add Player Response Capture

Add the only interactive input flow after the reader base is stable.

Initial deliverables:

- prompt rendering for player-input dialogue entries
- free-text input submission
- persistence of responses
- admin-side visibility of stored responses

Success criteria:

- responses save successfully
- admin can review them later
- story continues linearly after submission

### 7. Polish And Deploy

Finish the MVP by making the experience stable and private.

Initial deliverables:

- production environment configuration
- deployment to Vercel
- Supabase environment wiring
- error handling
- loading and empty states
- final visual polish

Success criteria:

- the private MVP is deployable
- both accounts can complete their core flows

## Guidance For AI Coding Agents

Until implementation is complete, treat the documentation set as the source of truth.

Agent rules:

- do not invent branching narrative behavior for MVP
- do not move playable story content into markdown files
- keep worldbuilding reference material separate from runtime data
- prefer simple, direct implementations over reusable abstractions that are not yet needed
- preserve the one-app architecture unless the docs are deliberately changed
- keep the two-user assumption explicit in code and documentation

## Documentation Discipline

When implementation begins:

- update docs when architectural assumptions change
- keep naming consistent across schema, UI, and docs
- document any deviation from the current MVP rules before normalizing it in code

## What Not To Build First

Avoid spending early effort on:

- branching narrative engines
- generalized CMS frameworks
- analytics-heavy infrastructure
- complex role systems beyond `admin` and `player`
- public onboarding or registration flows

Those can be reconsidered later if the product expands.
