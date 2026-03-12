# Tech Stack

## Purpose

This document explains the current planned technology stack for Ocnoer and why each tool exists in the system.

The stack reflects the current implementation direction, not a permanent ceiling. Additional tools may be added later if they solve a real problem.

## Core Technologies

| Tool | Role In Ocnoer | Why It Fits |
| --- | --- | --- |
| `TypeScript` | Primary language for frontend and server code | Provides type safety, better editor support, and shared contracts across UI, APIs, and data models. |
| `Next.js` | Full-stack application framework | Supports one application for both player and admin experiences, route handling, server components, server actions, and deployment to Vercel. |
| `Tailwind CSS` | Styling system | Speeds up UI development and keeps styling consistent for both the reader experience and admin tools. |
| `shadcn/ui` | UI building blocks | Provides accessible, composable components for forms, dialogs, tables, inputs, and admin workflows without locking the project into a rigid component library. |
| `Framer Motion` | Motion and transition layer | Supports dialogue transitions, scene fades, character entrance behavior, and other storytelling-focused motion. |
| `Supabase` | Backend platform services | Provides PostgreSQL, authentication, and object storage in one platform that fits a small private application. |
| `Prisma` | ORM and schema management | Gives typed database access, a clear schema definition, and migrations for story content models. |
| `Vercel` | Hosting and deployment | Fits a Next.js-first workflow, supports preview deployments, and keeps deployment simple for the MVP. |

## How The Stack Works Together

The intended flow is:

1. `Next.js` serves both the player and admin interfaces.
2. `TypeScript` defines application logic and shared types.
3. `Prisma` reads and writes structured story data in `Supabase PostgreSQL`.
4. `Supabase Storage` holds uploaded images, portraits, and music files.
5. `Framer Motion` handles scene and dialogue presentation polish.
6. `Tailwind CSS` and `shadcn/ui` shape the interface layer.
7. `Vercel` hosts the deployed application.

## Tooling Expectations By Area

### Frontend

- `Next.js`
- `TypeScript`
- `Tailwind CSS`
- `shadcn/ui`
- `Framer Motion`

Frontend priorities:

- story-reader presentation
- admin forms and tables
- responsive layouts
- smooth visual transitions

### Backend And Data

- `Next.js` server-side capabilities
- `Prisma`
- `Supabase PostgreSQL`
- `Supabase Auth`
- `Supabase Storage`

Backend priorities:

- role-based access
- authored story content storage
- media reference handling
- player response persistence

### Deployment

- `Vercel`
- `Supabase`

Deployment priorities:

- private MVP hosting
- simple environment configuration
- low operational overhead

## Current Constraints

These choices imply several working assumptions:

- the MVP is one app, not separate services
- the database is relational because story content is ordered and linked
- media files are external assets, not database blobs
- the project favors speed of development and clarity over early infrastructure complexity

## Future Expansion

The following may be added later if justified:

- testing frameworks and CI tooling
- analytics or observability tools
- audio processing or media optimization services
- background job infrastructure
- richer editorial workflows

Any future addition should support the same core product direction: a private, authored, narrative-first story platform.
