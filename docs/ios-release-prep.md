# iOS Release Prep

This document prepares the Ocnoer iOS app for a real TestFlight-ready build. It
does not submit anything to Apple and does not add Android support.

## Current App Identity

Configured in `apps/ios/app.json`:

- Display name: `Ocnoer`
- Expo slug: `ocnoer-ios`
- URL scheme: `ocnoer`
- iOS bundle identifier: `com.ocnoer.player`
- Version: `0.1.0`
- iOS build number: `1`
- Orientation: portrait
- Platforms: iOS only
- Tablet support: disabled
- Icon: `apps/ios/assets/icon.png`
- Splash image: `apps/ios/assets/splash.png`

The bundle identifier is already present in the repo, so it has been preserved.
Before creating the App Store Connect record, confirm that `com.ocnoer.player`
is the final bundle ID you want permanently associated with this app. Bundle IDs
are hard to change once the App Store app record and uploaded builds exist.

The icon and splash files are the current branded mobile assets. Recheck them
against App Store presentation requirements before public App Store submission.

## Prerequisites

- Apple Developer Program membership. A free Apple ID is not enough for
  TestFlight distribution.
- App Store Connect access with permission to create app records, manage
  TestFlight, and manage app metadata.
- Expo account and EAS project access.
- EAS CLI available through the pinned `pnpm dlx eas-cli@18.9.1` scripts in
  this repo, or installed separately if preferred.
- Production Next.js deployment URL for the mobile API. TestFlight builds must
  not point at `localhost`, `127.0.0.1`, `::1`, or a Mac LAN IP.
- Production Supabase project and public runtime storage already populated.

Expo monorepo note: run EAS commands from `apps/ios`, or use the root scripts
added in `package.json`. The EAS config lives in `apps/ios/eas.json` because the
Expo app root is `apps/ios`.

## EAS Build Profiles

Configured in `apps/ios/eas.json`:

- `development`: iOS internal distribution with `developmentClient: true`, for
  installing a development client on a registered iPhone.
- `preview`: iOS internal distribution without dev-client tooling, for
  production-like internal device testing outside TestFlight.
- `production`: iOS App Store/TestFlight build profile.

No Android profile or Android release workflow is configured.

## Environment Configuration

The iOS app reads only public Expo variables:

- `EXPO_PUBLIC_OCNOER_API_BASE_URL`
- `EXPO_PUBLIC_OCNOER_SUPABASE_URL`
- `EXPO_PUBLIC_OCNOER_RUNTIME_MANIFEST_PATH`

Do not put secrets in mobile env files. Do not expose Supabase service-role
keys, database URLs, admin passwords, App Store credentials, or private signing
material to the iOS app. `EXPO_PUBLIC_*` values are bundled into the app and
must be treated as public.

### Local Simulator

Use `apps/ios/.env.local`:

```bash
EXPO_PUBLIC_OCNOER_API_BASE_URL=http://localhost:3000
EXPO_PUBLIC_OCNOER_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_OCNOER_RUNTIME_MANIFEST_PATH=runtime/runtime/manifest.json
```

Run the web backend with:

```bash
corepack pnpm dev
```

### Physical iPhone Local Testing

Run the web backend on the LAN:

```bash
corepack pnpm dev:mobile-api
```

Then set the mobile API URL to the Mac LAN address:

```bash
EXPO_PUBLIC_OCNOER_API_BASE_URL=http://YOUR_MAC_LAN_IP:3000
```

Keep the Supabase URL and runtime manifest path pointed at the same public
runtime data you are testing. A LAN URL is only acceptable for local device
testing and must not be used for TestFlight.

### TestFlight And Production

Use EAS environment variables for the `production` environment:

```bash
cd apps/ios
corepack pnpm dlx eas-cli@18.9.1 env:create \
  --name EXPO_PUBLIC_OCNOER_API_BASE_URL \
  --value https://YOUR_PRODUCTION_WEB_DOMAIN \
  --environment production \
  --visibility plaintext
corepack pnpm dlx eas-cli@18.9.1 env:create \
  --name EXPO_PUBLIC_OCNOER_SUPABASE_URL \
  --value https://YOUR_PROJECT.supabase.co \
  --environment production \
  --visibility plaintext
corepack pnpm dlx eas-cli@18.9.1 env:create \
  --name EXPO_PUBLIC_OCNOER_RUNTIME_MANIFEST_PATH \
  --value runtime/runtime/manifest.json \
  --environment production \
  --visibility plaintext
```

Expected production API URL format:

```text
https://your-production-domain.example
```

Do not include `/api` at the end; the mobile clients append route paths such as
`/api/mobile/player/session`. Avoid a trailing slash. The production URL must be
publicly reachable from Apple devices and App Store review devices.

For `development` and `preview` EAS environments, set the same variable names to
public URLs that match the build's purpose. Preview/internal builds should use a
real HTTPS backend unless you are intentionally making an ad hoc build for LAN
testing only.

## Development Build

Development builds include `expo-dev-client` and are meant for your registered
iPhone, not TestFlight.

```bash
corepack pnpm ios:eas:build:development
corepack pnpm dev:ios:client
```

EAS will need Apple Developer access to create or use development signing
credentials and register devices for internal distribution. Handle those prompts
yourself.

## Preview Build

Preview builds are internal, production-like iOS builds without dev-client
tooling.

```bash
corepack pnpm ios:eas:build:preview
```

Install through the EAS internal distribution flow after the build completes.
This is useful before TestFlight because it exercises a release-style binary
without uploading to App Store Connect.

## Production/TestFlight Build

Production builds are the binaries intended for App Store Connect and
TestFlight.

```bash
corepack pnpm ios:eas:build:production
```

Before each upload after the first one, increment `expo.ios.buildNumber` in
`apps/ios/app.json`. Keep `expo.version` aligned with the user-facing release
version you want in App Store Connect.

## EAS Submit

`apps/ios/eas.json` includes an empty iOS submit profile so EAS can prompt for
Apple details without committing account-specific values.

After a production build exists and you are ready to upload it to App Store
Connect, run:

```bash
cd apps/ios
corepack pnpm dlx eas-cli@18.9.1 submit --platform ios --profile production --latest
```

Uploading to App Store Connect/TestFlight is not the same as submitting for App
Store Review. Do not submit for review until metadata, privacy disclosures,
screenshots, and QA are complete.

## Apple Developer And App Store Connect Steps

Do these manually:

1. Enroll in or confirm Apple Developer Program membership.
2. In Apple Developer, create or confirm the explicit App ID for
   `com.ocnoer.player`.
3. In App Store Connect, create a new iOS app record using the final app name
   and exact bundle ID.
4. Choose the SKU. A simple internal value such as `ocnoer-ios` is fine.
5. Complete agreements, tax, and banking prompts if Apple blocks TestFlight or
   App Store Connect features.
6. Add internal testers in App Store Connect. Internal testers must be App Store
   Connect users with access to the app.
7. After uploading the build, wait for Apple processing, then add the build to
   an internal TestFlight group.

## Expo/EAS Steps

Do these manually:

1. Log in to Expo:
   ```bash
   cd apps/ios
   corepack pnpm dlx eas-cli@18.9.1 login
   ```
2. Link or create the EAS project:
   ```bash
   corepack pnpm dlx eas-cli@18.9.1 init
   ```
   Commit the resulting `extra.eas.projectId` if EAS adds one to
   `apps/ios/app.json`.
3. Configure `development`, `preview`, and `production` EAS environment
   variables for the three `EXPO_PUBLIC_OCNOER_*` values.
4. Run the development, preview, and production builds only when the correct
   public URLs are set.
5. Let EAS manage iOS credentials, or provide your own certificates and
   provisioning profiles when prompted.

## App Store Submission Prep

- App name: confirm final public name. Current binary display name is `Ocnoer`.
- Subtitle: placeholder needed.
- Description: placeholder needed; should describe the private story/player
  experience without overpromising features not in the app.
- Keywords: placeholder needed.
- Support URL: required; use a public HTTPS page or support email landing page.
- Privacy policy URL: required; use a public HTTPS privacy policy covering the
  web app, mobile app, Supabase/backend processing, media loading, and progress
  sync.
- Screenshots: prepare 1-10 PNG/JPG screenshots for iPhone. Since the app is
  iPhone-only, iPad screenshots should not be required unless Apple reports the
  binary as supporting iPad. Use current App Store Connect screenshot
  specifications when generating final sizes.
- Category recommendation: `Games` if you want the story reader positioned as an
  interactive game; otherwise `Entertainment` is the conservative fallback for a
  private interactive story app.
- Age rating notes: complete Apple's questionnaire based on actual story
  content. Consider fantasy themes, romance, conflict, fear, violence,
  profanity, medical content, gambling, web access, and user-generated content
  honestly. The current app has no open user-generated public feed.
- Export compliance: the app uses standard platform/network encryption only
  based on the current code. `ITSAppUsesNonExemptEncryption` is set to `false`,
  but confirm this remains accurate before upload.

### Privacy/Data Disclosure Notes

Based on the current app behavior, disclose data used for app functionality:

- Player sign-in/session token. The mobile token is stored on device with
  `expo-secure-store` and sent to the Next.js backend as a bearer token.
- Player profile fields returned to mobile: player ID, first name, cat name,
  and cat-name lock state.
- Cat name if the player enters one.
- Reading progress synced with the backend.
- Runtime, media, and audio requests to Supabase/public storage and the backend.

Current code does not show:

- Push notifications
- In-app purchases
- Third-party analytics SDKs
- Ad tracking
- Android support

If those are added later, update this document and the App Store privacy
answers before submitting.

## Pre-TestFlight QA Checklist

- Sign in with the player credential.
- Relaunch the app and verify session restore.
- Load the runtime manifest and first playable chapter from production URLs.
- Start from the beginning.
- Continue from saved progress.
- Restart/clear progress.
- Confirm web-to-iOS progress sync.
- Confirm iOS-to-web progress sync.
- Mute and unmute audio.
- Send the app to background and foreground during audio playback; verify the
  current behavior is acceptable and does not crash.
- Move through scene transitions.
- Verify character staging and portrait rendering.
- Complete the cat-name prompt.
- Complete the dress prompt.
- Complete the ending flow.
- Sign out and verify the next launch requires sign-in.
- Test bad network behavior. Full offline play is not currently guaranteed; the
  expected release behavior is graceful loading/error states and no crashes.

## Verification Commands

Run before the first production/TestFlight build:

```bash
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build:web
corepack pnpm ios:config
corepack pnpm --filter @ocnoer/ios exec expo install --check
```

Then build in this order:

```bash
corepack pnpm ios:eas:build:development
corepack pnpm ios:eas:build:preview
corepack pnpm ios:eas:build:production
```

Only upload to App Store Connect when the production build uses real production
URLs and the App Store Connect app record exists.

## References

- Expo EAS monorepo setup:
  https://docs.expo.dev/build-reference/build-with-monorepos/
- Expo `eas.json` build profiles:
  https://docs.expo.dev/build/eas-json/
- Expo EAS environment variables:
  https://docs.expo.dev/eas/environment-variables/
- Expo splash screen and icon:
  https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/
- Expo EAS Submit:
  https://docs.expo.dev/submit/introduction/
- Apple TestFlight:
  https://developer.apple.com/testflight/
- Apple internal testers:
  https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers/
- Apple screenshot specifications:
  https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications/
- Apple export compliance:
  https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance/
