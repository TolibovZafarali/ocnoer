# Data Protection Runbook

## Goal

Protect authored content without introducing deletion risk during backup.

This project stores admin story content in Supabase Storage (`SUPABASE_RUNTIME_BUCKET`), so the storage backup is the highest-priority copy.

## Safety Rules

- Run backups in read-only mode first (`--dry-run`) before real execution.
- Do not run destructive scripts (`prisma:seed`, manual delete SQL, or storage remove commands) during backup.
- Always write backups into a brand new timestamped directory.
- Keep at least 2 independent copies (local + offsite encrypted copy).
- Test restore in an isolated environment before trusting backups.

## What Must Be Backed Up

1. Supabase Storage bucket (`authoring/`, `runtime/`, `media/`, `history/authoring/`)
2. PostgreSQL database (`AdminSceneDraft` and any other persisted tables)
3. Environment file copy with secrets stored in password manager (not in git)

## One-Time Setup

1. Ensure `.env.local` contains:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_RUNTIME_BUCKET`
   - `DATABASE_URL`
2. Ensure `pg_dump` is installed (`pg_dump --version`).
   - If unavailable, `backup:db` automatically falls back to a JSON export via Prisma (read-only), which is safer than no backup but less standard than `pg_dump`.

## Safe Backup Sequence

1. Dry run first:

```bash
corepack pnpm backup:storage -- --dry-run
corepack pnpm backup:db -- --dry-run
```

2. Run actual backups:

```bash
corepack pnpm backup:storage
corepack pnpm backup:db
```

3. Optional single command:

```bash
corepack pnpm backup:all
```

Backups are written under `backups/` into timestamped folders and include `manifest.json`.
If `manifest.json` contains entries where `localPath` differs from `path`, use `path` as the canonical Supabase object key during restore.

## Verify Backup Integrity

1. Check that each backup folder has a `manifest.json`.
2. Confirm file counts and sizes are non-zero.
3. Keep the latest backup immutable (copy to read-only external disk or object storage bucket with retention lock).

## Restore Drill (Isolated Environment)

Run this against a separate project/database first.

1. Restore DB dump:
   - `pg_restore --clean --if-exists --no-owner --no-privileges --dbname <target_db_url> backups/<timestamp>/database.dump`
2. Restore storage files:
   - Upload all files from `backups/supabase-storage-.../` back into the target bucket.
   - Use `manifest.json` so each local file is restored to its original `path` key.
3. Start app against restored env and validate:
   - admin chapters/scenes load
   - media renders
   - runtime playback works

## Recommended Cadence

- Daily automated backup (or before every major editing session)
- Weekly restore drill check
- Keep retention: 7 daily, 4 weekly, 6 monthly

## Important Note About Player Progress

Player runtime progress is stored in browser `localStorage`, not server storage. If that progress matters, export it per device/browser separately.
