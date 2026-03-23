#!/usr/bin/env node

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

const HELP_TEXT = `Usage:
  node scripts/backup-storage.mjs [options]

Options:
  --env-file <path>     Path to env file (default: .env.local)
  --output-dir <path>   Local output directory (default: backups)
  --bucket <name>       Supabase bucket name (default: SUPABASE_RUNTIME_BUCKET)
  --prefix <path>       Storage prefix to back up (repeatable, default: full bucket)
  --dry-run             List and count files only, do not download
  --help                Show this help
`;

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    envFile: ".env.local",
    outputDir: "backups",
    bucket: "",
    prefixes: [],
    dryRun: false,
    help: false
  };

  while (args.length > 0) {
    const arg = args.shift();

    if (!arg) {
      continue;
    }

    if (arg === "--") {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg.startsWith("--env-file=")) {
      options.envFile = arg.slice("--env-file=".length);
      continue;
    }

    if (arg.startsWith("--output-dir=")) {
      options.outputDir = arg.slice("--output-dir=".length);
      continue;
    }

    if (arg.startsWith("--bucket=")) {
      options.bucket = arg.slice("--bucket=".length);
      continue;
    }

    if (arg.startsWith("--prefix=")) {
      options.prefixes.push(arg.slice("--prefix=".length));
      continue;
    }

    if (arg === "--env-file" || arg === "--output-dir" || arg === "--bucket" || arg === "--prefix") {
      const value = args.shift();

      if (!value) {
        throw new Error(`Missing value for ${arg}`);
      }

      if (arg === "--env-file") {
        options.envFile = value;
      } else if (arg === "--output-dir") {
        options.outputDir = value;
      } else if (arg === "--bucket") {
        options.bucket = value;
      } else {
        options.prefixes.push(value);
      }

      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function stripWrappingQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

async function loadEnvFile(filePath) {
  const absolutePath = path.resolve(filePath);
  const content = await fs.readFile(absolutePath, "utf8");
  const result = {};

  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u);

    if (!match) {
      continue;
    }

    const key = match[1];
    const rawValue = match[2].trim();
    result[key] = stripWrappingQuotes(rawValue);
  }

  return result;
}

function readRequiredEnvValue(name, envMap) {
  const value = process.env[name] || envMap[name];

  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }

  return value;
}

function normalizePrefix(prefix) {
  return prefix.replace(/^\/+/u, "").replace(/\/+$/u, "");
}

function isStorageFolderItem(item) {
  return item?.id === null;
}

async function pathExists(targetPath) {
  try {
    await fs.stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

function createTimestamp() {
  return new Date().toISOString().replace(/[:.]/gu, "-");
}

function buildDirectoryPrefixSet(paths) {
  const prefixes = new Set();

  for (const filePath of paths) {
    const segments = filePath.split("/");

    for (let index = 1; index < segments.length; index += 1) {
      prefixes.add(segments.slice(0, index).join("/"));
    }
  }

  return prefixes;
}

function buildLocalPathMap(paths) {
  const directoryPrefixes = buildDirectoryPrefixSet(paths);
  const usedLocalPaths = new Set();
  const localPathByRemotePath = new Map();

  for (const remotePath of [...paths].sort((a, b) => a.localeCompare(b))) {
    let localPath = directoryPrefixes.has(remotePath)
      ? `${remotePath}.__object__`
      : remotePath;

    while (directoryPrefixes.has(localPath) || usedLocalPaths.has(localPath)) {
      localPath = `${localPath}.__dup__`;
    }

    usedLocalPaths.add(localPath);
    localPathByRemotePath.set(remotePath, localPath);
  }

  return localPathByRemotePath;
}

async function listObjectsForPrefix(client, bucket, prefix) {
  const queue = [normalizePrefix(prefix)];
  const visited = new Set();
  const objects = [];

  while (queue.length > 0) {
    const currentPrefix = queue.shift();

    if (currentPrefix === undefined) {
      continue;
    }

    if (visited.has(currentPrefix)) {
      continue;
    }

    visited.add(currentPrefix);
    let offset = 0;

    while (true) {
      const { data, error } = await client.storage.from(bucket).list(currentPrefix, {
        limit: 100,
        offset,
        sortBy: { column: "name", order: "asc" }
      });

      if (error) {
        throw new Error(
          `Unable to list objects at prefix "${currentPrefix || "/"}": ${error.message}`
        );
      }

      const items = data ?? [];

      for (const item of items) {
        const objectPath = currentPrefix
          ? `${currentPrefix}/${item.name}`
          : item.name;

        if (isStorageFolderItem(item)) {
          queue.push(objectPath);
          continue;
        }

        objects.push({
          path: objectPath,
          size: item.metadata?.size ?? null,
          mimeType: item.metadata?.mimetype ?? null,
          createdAt: item.created_at ?? null,
          updatedAt: item.updated_at ?? null
        });
      }

      if (items.length < 100) {
        break;
      }

      offset += 100;
    }
  }

  return objects;
}

async function downloadObject(client, bucket, objectPath) {
  const { data, error } = await client.storage.from(bucket).download(objectPath);

  if (error) {
    throw new Error(`Unable to download "${objectPath}": ${error.message}`);
  }

  if (!data) {
    throw new Error(`Supabase returned no data for "${objectPath}"`);
  }

  return Buffer.from(await data.arrayBuffer());
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    process.stdout.write(HELP_TEXT);
    return;
  }

  const envMap = await loadEnvFile(options.envFile);
  const supabaseUrl = readRequiredEnvValue("NEXT_PUBLIC_SUPABASE_URL", envMap);
  const supabaseServiceKey = readRequiredEnvValue(
    "SUPABASE_SERVICE_ROLE_KEY",
    envMap
  );
  const bucket =
    options.bucket || readRequiredEnvValue("SUPABASE_RUNTIME_BUCKET", envMap);
  const normalizedPrefixes =
    options.prefixes.length > 0 ? options.prefixes.map(normalizePrefix) : [""];
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const objectsByPath = new Map();

  for (const prefix of normalizedPrefixes) {
    const objectRecords = await listObjectsForPrefix(supabase, bucket, prefix);

    for (const objectRecord of objectRecords) {
      objectsByPath.set(objectRecord.path, objectRecord);
    }
  }

  const objects = [...objectsByPath.values()].sort((a, b) =>
    a.path.localeCompare(b.path)
  );
  const listedBytes = objects.reduce((sum, item) => {
    if (typeof item.size === "number") {
      return sum + item.size;
    }

    return sum;
  }, 0);

  process.stdout.write(
    `[backup-storage] Listed ${objects.length} file(s) in bucket "${bucket}" under prefixes: ${
      normalizedPrefixes.map((prefix) => `"${prefix || "/"}"`).join(", ")
    }\n`
  );
  process.stdout.write(
    `[backup-storage] Total listed bytes (if provided by metadata): ${listedBytes}\n`
  );

  if (options.dryRun) {
    process.stdout.write("[backup-storage] Dry run complete. No files downloaded.\n");
    return;
  }

  const outputRoot = path.resolve(options.outputDir);
  const backupName = `supabase-storage-${bucket}-${createTimestamp()}`;
  const finalDir = path.join(outputRoot, backupName);
  const tempDir = `${finalDir}.tmp`;
  const localPathByRemotePath = buildLocalPathMap(objects.map((item) => item.path));
  const remappedPathCount = objects.reduce((count, item) => {
    const localPath = localPathByRemotePath.get(item.path) ?? item.path;
    return count + (localPath === item.path ? 0 : 1);
  }, 0);

  if (remappedPathCount > 0) {
    process.stdout.write(
      `[backup-storage] Detected ${remappedPathCount} path collision(s). See manifest.json for remote path to localPath mapping.\n`
    );
  }

  if (await pathExists(finalDir)) {
    throw new Error(`Refusing to overwrite existing backup directory: ${finalDir}`);
  }

  if (await pathExists(tempDir)) {
    throw new Error(`Temporary backup directory already exists: ${tempDir}`);
  }

  await fs.mkdir(tempDir, { recursive: true });
  try {
    const manifest = {
      backupType: "supabase-storage",
      createdAt: new Date().toISOString(),
      supabaseUrl,
      bucket,
      prefixes: normalizedPrefixes,
      fileCount: objects.length,
      totalDownloadedBytes: 0,
      pathMappingStrategy:
        "remote paths preserved unless path-collision exists; colliding file keys are suffixed with .__object__",
      files: []
    };

    for (let index = 0; index < objects.length; index += 1) {
      const objectRecord = objects[index];
      const localPath =
        localPathByRemotePath.get(objectRecord.path) ?? objectRecord.path;
      const destinationPath = path.join(tempDir, localPath);
      const contents = await downloadObject(supabase, bucket, objectRecord.path);
      const checksum = createHash("sha256").update(contents).digest("hex");

      await fs.mkdir(path.dirname(destinationPath), { recursive: true });
      await fs.writeFile(destinationPath, contents);

      manifest.totalDownloadedBytes += contents.length;
      manifest.files.push({
        path: objectRecord.path,
        localPath,
        size: contents.length,
        sha256: checksum,
        mimeType: objectRecord.mimeType,
        createdAt: objectRecord.createdAt,
        updatedAt: objectRecord.updatedAt
      });

      process.stdout.write(
        `[backup-storage] Downloaded ${index + 1}/${objects.length}: ${objectRecord.path}\n`
      );
    }

    await fs.writeFile(
      path.join(tempDir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf8"
    );
    await fs.rename(tempDir, finalDir);
  } catch (error) {
    await fs.rm(tempDir, { recursive: true, force: true });
    throw error;
  }

  process.stdout.write(
    `[backup-storage] Backup complete. Files written to: ${finalDir}\n`
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[backup-storage] ERROR: ${message}\n`);
  process.exit(1);
});
