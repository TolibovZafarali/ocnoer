# Architecture

## Purpose

This document describes the target MVP system for Ocnoer before application code exists.

The goal is a private, single-application story platform with two authenticated roles:

- `admin` authors and manages story content
- `player` reads the story and submits text responses when prompted

## System Shape

Ocnoer should be built as one `Next.js` App Router application with two route areas:

- player-facing routes for reading the story
- admin-facing routes for content management and response review

The application should use:

- `Supabase PostgreSQL` as the primary database
- `Prisma` as the ORM and schema layer
- `Supabase Storage` for media assets
- `Vercel` for hosting

This is a single-app MVP, not a microservice system and not a split frontend architecture.

## Users And Access

The MVP supports exactly two accounts.

- `admin`
  - authenticated
  - can create and edit chapters, scenes, dialogue, characters, and asset references
  - can view saved player responses
- `player`
  - authenticated
  - can read published story content
  - can submit text responses when a dialogue prompt requests it

Authorization should be role-based. The player must not access admin routes or editing actions.

## Contracts

### Role Contract

- `admin` can manage story content and review saved player responses
- `player` can consume story content and submit responses when prompted
- both roles require authentication
- role checks must gate route access and protected actions

### Content Contract

- a `Chapter` contains ordered `Scene` records
- a `Scene` contains ordered `DialogueEntry` records
- a `DialogueEntry` is one of: narrator text, character speech, character thought, or player input prompt
- story content is authored in the application and stored in PostgreSQL
- player responses do not create branching story paths in MVP

### Asset Contract

- a `Scene` can reference a background image
- a `Scene` can reference background music
- a `Character` can reference portrait assets for rendering
- asset files live in Supabase Storage while metadata and relations live in PostgreSQL

## Major Subsystems

### 1. Web Application

The Next.js app is responsible for:

- route handling
- server and client rendering
- authenticated session handling
- admin and player UI composition

Recommended route split:

- `app/(player)/...`
- `app/(admin)/...`

### 2. Story Content System

The story content system stores authored narrative data in PostgreSQL.

MVP rules:

- story content is authored in the app, not in markdown files
- progression is mostly linear
- chapters, scenes, and dialogue entries are ordered records
- player responses are persisted but do not branch story flow in MVP

### 3. Asset Storage

Scene and character media should be stored outside the database as files in Supabase Storage.

Expected asset categories:

- scene background images
- character portraits
- background music

The database stores references and metadata, not the binary files themselves.

### 4. Admin Surface

The admin surface should allow Alvyn to:

- create chapters
- create scenes within chapters
- write dialogue entries in display order
- assign speaking characters or narrator mode
- attach background images and music to scenes
- review player-submitted responses

### 5. Player Surface

The player surface should allow Ocnoer to:

- read story chapters and scenes in sequence
- view scene art and character portraits
- experience scene transitions and dialogue presentation
- enter free-text responses only when explicitly prompted during Alvyn conversation moments

## Conceptual Domain Model

These conceptual entities should anchor the first schema design.

### `User`

Represents one authenticated account.

Core concepts:

- identity
- role: `admin` or `player`
- authentication metadata

### `Character`

Represents a named story character that can appear in scenes and dialogue.

Core concepts:

- display name
- role in story
- portrait references
- placement behavior when rendered

### `Chapter`

Represents a high-level narrative unit.

Core concepts:

- title
- slug or identifier
- display order
- publication state

### `Scene`

Represents a playable unit within a chapter.

Core concepts:

- parent chapter
- display order
- background image reference
- background music reference
- optional scene title or label

### `DialogueEntry`

Represents one ordered line or interaction inside a scene.

Allowed kinds for MVP:

- narrator text
- character speech
- character thought
- player input prompt

Core concepts:

- parent scene
- display order
- type
- text content
- optional speaking character

### `SceneAsset`

Represents a media record linked to scenes or characters.

Core concepts:

- asset type
- storage path
- alt/display metadata
- ownership relation to scene or character

### `PlayerResponse`

Represents a stored free-text response submitted by the player.

Core concepts:

- related dialogue prompt
- related scene and chapter context
- player account reference
- submitted text
- timestamp

## Route-Level Contract

The route contract should remain simple in MVP.

- player routes: consume published story content
- admin routes: manage content and review player responses

The exact URLs can evolve, but the separation of concerns should remain stable.

## Data Flow

### Admin Authoring Flow

1. Admin signs in.
2. Admin creates or edits chapters, scenes, dialogue, and media references.
3. Data is stored in PostgreSQL through Prisma.
4. Uploaded media is stored in Supabase Storage.

### Player Reading Flow

1. Player signs in.
2. Player opens the story reader.
3. The app loads the current chapter, scene, dialogue sequence, and linked media.
4. The UI renders each dialogue entry according to scene rules.
5. If a player prompt appears, the submitted response is saved and later visible to the admin.

## MVP Boundaries

The following are out of scope unless requirements change:

- branching story logic driven by player responses
- public registration or multi-user audiences
- live chat systems
- multiplayer behavior
- open-ended CMS features beyond Ocnoer's authoring needs
