# Roadmap

## Purpose

This roadmap outlines the early development milestones for Ocnoer.

It is focused on the first private MVP, not long-term platform expansion.

## Milestone 1: Repository Bootstrap

Goal:

Create the first working application skeleton and baseline repo structure.

Target outcomes:

- initialize Next.js App Router project
- add TypeScript, Tailwind CSS, and shadcn/ui
- establish `app`, `components`, `lib`, `prisma`, `docs`, and `lore` structure
- define environment variable expectations

Definition of done:

- the app runs locally
- the repo structure matches the documented direction

## Milestone 2: Authentication And Roles

Goal:

Implement the two-account private access model.

Target outcomes:

- connect Supabase
- implement sign-in flow
- enforce `admin` and `player` roles
- protect admin and player route areas

Definition of done:

- each user can access only their intended surface

## Milestone 3: Story Schema And Admin Authoring

Goal:

Create the underlying content model and the first admin workflows.

Target outcomes:

- define Prisma schema for core story entities
- support chapter creation
- support scene creation
- support dialogue authoring
- support character assignment
- support asset references

Definition of done:

- admin can author a basic playable story segment end to end

## Milestone 4: Player Story Reader

Goal:

Render the authored story as a polished reader experience.

Target outcomes:

- load chapters and scenes in order
- render narrator text and character dialogue
- enforce portrait placement rules
- display scene backgrounds and music
- add transitions with Framer Motion

Definition of done:

- the player can read a chapter from start to finish in the web app

## Milestone 5: Player Response Capture

Goal:

Add the limited interactive input flow.

Target outcomes:

- render player input prompts during Alvyn conversation moments
- save free-text responses
- expose responses in the admin panel

Definition of done:

- player responses are stored and visible to the admin without changing story progression

## Milestone 6: Private MVP Deployment

Goal:

Ship a stable private version of Ocnoer.

Target outcomes:

- deploy to Vercel
- configure production Supabase services
- validate private access
- harden core UX states

Definition of done:

- admin can author and review content
- player can read the story and submit responses
- the deployed app is usable as the first private MVP

## After MVP

Possible later directions:

- better editorial workflow tools
- richer media handling
- analytics and observability
- backup and export tools
- expanded content-management quality-of-life features

These are deliberately secondary to the private MVP.
