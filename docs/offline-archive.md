# Offline content and recovery archive

Ocnoer now runs on iPhone with bundled story content, a fictional local reader,
and device-local progress. Supabase remains paused. The web application and its
backend source are preserved, with every web request disabled by middleware.

## Recovered data

On October 27, 2026, both downloads were retrieved from the paused project's
dashboard without resuming the project:

- The complete PostgreSQL cluster backup, supplied as
  `db_cluster-29-07-2026@09-38-12.backup.gz`.
- The complete Storage archive, `hkngkchhdpwrjwoqpjpw.storage.zip`.

The database includes application tables, Auth data, Storage metadata, schemas,
functions, policies, and role definitions. The Storage archive contains all
546 objects in the one `runtime` bucket, totaling 315,322,725 uncompressed bytes.
This includes authoring content, history, runtime JSON, and media, including
objects not currently referenced by the reader.

Every Storage object key and recorded size matched the database metadata.
ZIP CRC checks and per-object SHA-256 hashes passed. An isolated PostgreSQL 17
restore with no network access matched all 50 exported table row counts. The
local rehearsal replayed 19 role memberships with the local administrator as
grantor; the original hosted grantor was not authorized in that empty cluster.
The original database download was preserved without modification.

These are the provider's paused-project recovery downloads, not a new live
database dump. Dashboard billing, organization membership, external secrets,
and hosting configuration are not represented as application data in this
archive. Browser/device-local progress is also outside Supabase's backup.

## Complete encrypted archive

The repository contains the complete downloads in
[`archive/supabase/2026-10-27`](../archive/supabase/2026-10-27/manifest.json).
It also contains the inventory and database restore verification report inside
the encrypted archive. Seven ordered parts keep individual Git files below
40 MiB. The manifest records hashes and sizes for every part and original file.

The archive uses age X25519 encryption because it contains real account and
session data. The public repository includes only the recipient public key.
The private recovery identity is stored outside the repository at
`~/.ocnoer-recovery/2026-10-27.agekey`, with owner-only permissions. Keep an
independent secure copy of that identity; GitHub alone cannot decrypt the archive.
The playable story and fictional reader do not require this key.

With Python 3 and age installed, restore into a new directory:

```sh
python3 scripts/restore-recovery-archive.py \
  archive/supabase/2026-10-27 \
  "$HOME/.ocnoer-recovery/2026-10-27.agekey" \
  /path/to/new-private-recovery-directory
```

The script verifies every part, decrypts, verifies the original file hashes, and
creates the output only after validation. Never serve or commit the decrypted
database or credentials in this public repository.

To reconstruct the validated Storage export used by the app generator:

```sh
python3 scripts/import-supabase-recovery.py \
  /path/to/new-private-recovery-directory/database.backup.gz \
  /path/to/new-private-recovery-directory/storage.zip \
  /path/to/new-verified-export \
  --project-ref hkngkchhdpwrjwoqpjpw
node scripts/bundle-ios-story.mjs /path/to/new-verified-export/runtime
```

## iPhone snapshot

The app includes the current one-chapter runtime and all reachable media:
119 logical content entries, deduplicated into 117 files totaling 203,024,315
bytes. Nine WebM source references use their already-existing M4A derivatives
for native playback. The generator rejects missing references and invalid
source hashes. Unused content remains in the complete recovery archive.

The app uses `Reader` with the stable fictional ID `offline-reader`. Choices,
progress, audio preferences, and the cat name remain on that device. Existing
remote session and progress records are left intact; the fictional reader
starts a separate local save. Cross-device synchronization is disabled.

GitHub stores the source snapshot. The installed app reads its packaged files
and makes no content, authentication, presence, or progress requests. A new
native app build must be installed to receive this behavior and these assets.
See [iOS release preparation](ios-release-prep.md) for build and verification.

## Website state

On October 27, the `ocnoer` production project was paused on Vercel. The public
domains `ocnoer.com`, `www.ocnoer.com`, and `ocnoer.vercel.app`, together with the
current production deployment URL, returned `503 DEPLOYMENT_PAUSED` for the
homepage, admin, and mobile API routes. The older `ocnoer-wait-page` production
project was also paused and its public URL returned the same response. Preview deployments have separate hosting
access controls; project pausing applies to production traffic.

The preserved source now returns a blank `410 Gone` for all web paths and
methods, including static assets, admin, reader, APIs, and server actions.
Resuming hosting alone will not reopen the website once this source is deployed.
No backend source, database, or Storage object was deleted.
