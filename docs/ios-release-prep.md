# iOS release prep

The default iPhone app uses bundled story content and a fictional local player.
It does not require an active Supabase project, a web API, or a GitHub connection
to play. The website and all API routes are deactivated while their source is
preserved.

This guide covers preparing and verifying a new native build. Editing or
pushing source files does not update an already-installed app. Build and install
a new binary to deliver the offline implementation and packaged assets.

## App identity and build profiles

Keep the existing identity in `apps/ios/app.json`:

- App name: `Ocnoer`
- Expo slug: `ocnoer-ios`
- iOS bundle identifier: `com.ocnoer.player`
- URL scheme: `ocnoer`
- iPhone only, portrait orientation

Read the current version and build number from that file. Increment
`expo.ios.buildNumber` before each subsequent upload to App Store Connect.

`apps/ios/eas.json` defines these profiles:

- `development`: development client for a registered iPhone.
- `preview`: internal distribution without development-client tooling.
- `production`: App Store Connect/TestFlight build.

The iOS profiles pin `image` to `sdk-54`. Keep that SDK-compatible image until
the Expo native lifecycle is upgraded and verified separately. Xcode 27 images
require UIKit scene support when launching on iOS 27; the preserved Expo 54
application uses the earlier lifecycle. See [Expo build infrastructure](https://docs.expo.dev/build-reference/infrastructure/).

Run EAS from `apps/ios` or use the root scripts below. Keep the existing EAS
project association. A development client normally gets JavaScript and assets
from Metro; use preview or production binaries for the final offline check.

## Offline configuration

Leave `EXPO_PUBLIC_OCNOER_CONTENT_MODE` unset or set it to `offline`.
Only the exact value `remote` selects the previous online implementation.
Verify the effective build profile and EAS environment before building so a
remote-mode value is not inherited accidentally.

Offline builds do not need any of these legacy settings:

- `EXPO_PUBLIC_OCNOER_API_BASE_URL`
- `EXPO_PUBLIC_OCNOER_SUPABASE_URL`
- `EXPO_PUBLIC_OCNOER_RUNTIME_MANIFEST_PATH`

The mock player is fixed to the fictional `Reader` / `offline-reader` identity.
Its local session marker is not a server credential. Progress, choices, cat
name, and audio preferences stay on the device. There are no login, heartbeat,
profile-update, or progress-sync requests in offline mode.

Keep real credentials and recovery-archive decryption keys outside the source
and mobile bundle. The app does not need database URLs, service-role keys,
admin passwords, or signing secrets in `EXPO_PUBLIC_*` variables.

## Preparing the content

Use the verified Storage export described in [offline archive](offline-archive.md).
Preserve the complete export independently; the playable bundle contains only
runtime JSON and media, not database records, drafts, or authoring history.

```bash
node scripts/bundle-ios-story.mjs /absolute/path/to/storage-export
```

The source directory must contain the full Storage export and its root
`manifest.json`. The generator validates source sizes and SHA-256 checksums,
checks runtime/media references, and writes the asset files and registry under:

- `apps/ios/assets/story/`
- `apps/ios/src/runtime/generated/storyRegistry.ts`
- `apps/ios/src/runtime/generated/storyManifest.json`

Commit the generated assets and registry together. Inspect the generated
manifest to confirm the expected source and file counts. Build from that commit
so the same content is packaged in the installed application.

The app resolves the imported media to local file URIs with `expo-asset`.
Expo serves local assets over HTTP during development and packages imported
assets into production binaries. See [Expo asset documentation](https://docs.expo.dev/develop/user-interface/assets/).

The repository-root `.easignore` preserves the `.gitignore` exclusions and
excludes recovery archives, local checkouts, and Git metadata from EAS uploads.
The bundled story assets, generated registry, shared story package, and `lore`
remain included. Keep these rules synchronized when adding ignore patterns;
EAS uses `.easignore` in place of `.gitignore`.

To inspect the upload locally without starting a build, run from `apps/ios`
with a new output directory outside the repository:

```bash
corepack pnpm dlx eas-cli@18.9.1 build:inspect --platform ios --profile preview --stage archive --output /absolute/path/to/upload-inspection
```

## Local checks

From the repository root:

```bash
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build:web
corepack pnpm ios:config
corepack pnpm --filter @ocnoer/ios exec expo install --check
```

A successful web build verifies the retained Next.js source and shutdown gate;
it does not verify iPhone rendering, audio, or native asset packaging.

For development:

```bash
EXPO_PUBLIC_OCNOER_CONTENT_MODE=offline corepack pnpm dev:ios
```

If using the registered-device development client:

```bash
corepack pnpm ios:eas:build:development
corepack pnpm dev:ios:client
```

## Native build and installation

Create an internal preview build for device verification:

```bash
corepack pnpm ios:eas:build:preview
```

Install the resulting build using its internal distribution link. For an App
Store Connect/TestFlight binary:

```bash
corepack pnpm ios:eas:build:production
```

These workflows require the configured Expo account and appropriate Apple
signing access. Check the actual build result before reporting a native build
as ready.

After a production build is complete, upload that verified build to App Store
Connect when a release is intended:

```bash
cd apps/ios
corepack pnpm dlx eas-cli@18.9.1 submit --platform ios --profile production --latest
```

Check that `--latest` identifies the binary just verified before using it.
An upload, a TestFlight installation, App Review submission, and public release
are separate states. Record which one has actually completed.

## Offline device acceptance

Use an installed preview or production binary and stop Metro. Disable Wi-Fi
and cellular data before its first launch so prior network caches cannot hide
missing assets.

- Cold launch enters the story without requesting a login or backend.
- Open every chapter and check portraits, backgrounds, and music.
- Complete player choices, including cat name and dress selection.
- Close and relaunch the app; reading progress and choices persist locally.
- Restart reading and reset progress; both work without a network.
- Mute/unmute audio and background/foreground the app during playback.
- Complete the ending flow.
- Confirm that no Supabase, web API, or GitHub request is required.

Recheck after changing the content snapshot or native dependencies. Keep any
simulator-only results distinct from physical-device evidence.

## Website and future restoration

Every web path, including `/`, `/play`, `/admin`, and all APIs, returns `410 Gone`
under the shutdown middleware. See [website deactivation](website-deactivation.md)
for deployment verification. The offline iPhone build is independent of this
website.

To deliberately revive the online application later, restore the exported data
and backend services, change the web gate in source, and build the iPhone app
with `EXPO_PUBLIC_OCNOER_CONTENT_MODE=remote` and the appropriate legacy URLs.
The complete former release guide remains in
[historical remote-mode release reference](ios-remote-release-reference.md).

For a future App Store release, review privacy answers for the actual offline
binary and provide reachable support/privacy destinations appropriate to that
release. The deactivated website cannot serve those pages.
