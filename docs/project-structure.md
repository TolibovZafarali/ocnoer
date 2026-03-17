# Project Structure

## Purpose

This repository keeps player runtime, admin authoring, shared UI, and narrative reference material in one codebase.

## Runtime Content Split

Ocnoer now separates:

### Reference Lore

Files in `/lore` are worldbuilding and writing references only.

### Authored Story Content

Authored story content is file-based JSON stored in Supabase Storage, not in repo markdown and not in relational tables.

Examples:

- characters and emotions
- background image assets
- background music tracks
- chapters, scenes, and dialogue

### Generated Runtime Content

Runtime story content is generated JSON stored in Supabase Storage and read by `/play`.

Examples:

- runtime manifest
- runtime character manifest
- runtime asset manifest
- per-chapter runtime bundles

## Key Repo Areas

```text
/
├── app/
│   ├── (admin)/
│   ├── (player)/
│   ├── admin/login/
│   └── layout.tsx
├── components/
│   ├── admin/
│   └── ui/
├── docs/
├── lib/
│   ├── auth/
│   ├── story/
│   └── supabase/
├── lore/
├── public/
└── README.md
```

## Notes

- `public/` is for repo-shipped static files only.
- User-authored media does not belong in `public/`; it belongs in Supabase Storage.
- Runtime chapter playback should keep reading from generated JSON bundles, not from live authoring state.

