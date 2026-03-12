# Ocnoer

Ocnoer is a private interactive story web app with two authenticated roles:

- `admin` (`Alvyn`) authors and manages story content.
- `player` (`Ocnoer`) reads the story and submits occasional text responses.

The MVP is narrative-first and mostly linear, centered on chapter, scene, and dialogue presentation.

## Current Status

Milestone 1 bootstrap is now in place:

- Next.js App Router scaffold
- TypeScript + Tailwind CSS baseline
- shadcn/ui-compatible setup (`components.json`, `@/` aliases, `cn` utility, UI button)
- MVP route surfaces:
  - `/`
  - `/play`
  - `/admin`
- Prisma bootstrap schema for PostgreSQL

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
- `corepack pnpm typecheck`
- `corepack pnpm format`
- `corepack pnpm format:check`

## Environment Variables

Defined in `.env.example`:

- `DATABASE_URL`: PostgreSQL connection string used by Prisma (server-only)
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL (public)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anon key for client-side auth/data calls (public)
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase privileged key for trusted server operations (server-only)

## Documentation Map

- [architecture.md](/Users/zafaralitolibov/Documents/ocnoer/docs/architecture.md)
- [tech-stack.md](/Users/zafaralitolibov/Documents/ocnoer/docs/tech-stack.md)
- [project-structure.md](/Users/zafaralitolibov/Documents/ocnoer/docs/project-structure.md)
- [game-flow.md](/Users/zafaralitolibov/Documents/ocnoer/docs/game-flow.md)
- [development-guide.md](/Users/zafaralitolibov/Documents/ocnoer/docs/development-guide.md)
- [roadmap.md](/Users/zafaralitolibov/Documents/ocnoer/docs/roadmap.md)
