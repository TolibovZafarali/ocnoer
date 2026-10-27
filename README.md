# Ocnoer

Ocnoer runs as an offline iPhone story app. Chapters, portraits, backgrounds,
and music are packaged with the app from a versioned repository snapshot.
The default build opens with a fictional local player and saves reading
progress and profile choices on the device. It needs no active Supabase,
Next.js API, or GitHub connection to play after installation.

The entire website is deactivated: the homepage, reader, admin panel, APIs,
server actions, and assets return an empty `410 Gone` response. All web and
backend source remains available for future restoration.

## iPhone development

Install dependencies, then start the iPhone development app:

```bash
corepack pnpm install
EXPO_PUBLIC_OCNOER_CONTENT_MODE=offline corepack pnpm dev:ios
```

No backend environment variables or web server are needed in offline mode.
Metro serves development code and assets over the local network. To verify
playback without any network, build and install a preview or release binary;
a development session alone does not prove the packaged app works offline.

See [iOS release prep](docs/ios-release-prep.md) for native build, installation,
and airplane-mode checks. Changing repository files does not update an
already-installed app; the bundled content ships in a new build.

## Content snapshot

The playable snapshot contains runtime JSON and media. Generate it from a
verified Storage export in the format produced by `scripts/backup-storage.mjs`:

```bash
node scripts/bundle-ios-story.mjs /absolute/path/to/storage-export
```

The generator verifies every source file against the export manifest, validates
runtime references, and writes:

- `apps/ios/assets/story/`: JSON and media named by their content hashes.
- `apps/ios/src/runtime/generated/storyRegistry.ts`: static imports for bundling.
- `apps/ios/src/runtime/generated/storyManifest.json`: source manifest hash,
  content hashes, original object paths, and file counts.

The app reads packaged files and resolves media to device-local file URIs.
Missing content produces an error instead of falling back to a remote service.

The complete recovery export also needs authoring documents, revision history,
database records, and configuration. Those are preserved separately from the
playable bundle. Consult [offline archive](docs/offline-archive.md) for export
coverage, verification results, and recovery instructions. A generated iPhone
bundle is not evidence that every Supabase record has been archived.

## Local player and saves

The mock player is `Reader` with the stable ID `offline-reader`. It has no
server account or usable authentication credential. Cat-name choices and
reading progress are stored locally. Every installation has its own progress;
there is no web or cross-device synchronization. Deleting the app or clearing
its data may remove those saves.

## Preserved backend

The existing Next.js pages, admin authoring system, API handlers, authentication,
Supabase helpers, Prisma schema, and migrations remain in the repository.
The former homepage gate is preserved in `lib/website/homepage-only-gate.ts`.
It is not imported by the active shutdown middleware.

`EXPO_PUBLIC_OCNOER_CONTENT_MODE=remote` explicitly selects the previous mobile
backend implementation; every other value uses offline mode. Remote mode also
requires restoring the backend services and deliberately changing the website
gate. Setting this variable does not reactivate the website.

The original online build instructions remain in
[historical remote-mode release reference](docs/ios-remote-release-reference.md).
The old backup and runtime publication scripts remain available, but the
offline app does not execute them or need their credentials.

## Verification

```bash
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build:web
corepack pnpm ios:config
```

The web build checks preserved source and the shutdown deployment. It does not
run the iPhone app. Verify the installed iPhone build separately with Wi-Fi and
cellular data disabled, including a cold launch, every chapter, images, music,
choices, progress resume, and reset.

## Documentation

- [Offline archive](docs/offline-archive.md)
- [iOS release prep](docs/ios-release-prep.md)
- [Website deactivation](docs/website-deactivation.md)
- [Data protection runbook](docs/data-protection.md)
- [Historical remote-mode release reference](docs/ios-remote-release-reference.md)
- [Preserved admin content system](docs/admin-content-system.md)
- [Shared story architecture](docs/architecture.md)
