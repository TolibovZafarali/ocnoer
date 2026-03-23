#!/usr/bin/env node

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const HELP_TEXT = `Usage:
  node scripts/backup-postgres.mjs [options]

Options:
  --env-file <path>     Path to env file (default: .env.local)
  --output-dir <path>   Local output directory (default: backups)
  --dry-run             Validate configuration only, do not run pg_dump
  --help                Show this help
`;

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    envFile: ".env.local",
    outputDir: "backups",
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

    if (arg === "--env-file" || arg === "--output-dir") {
      const value = args.shift();

      if (!value) {
        throw new Error(`Missing value for ${arg}`);
      }

      if (arg === "--env-file") {
        options.envFile = value;
      } else {
        options.outputDir = value;
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

function createTimestamp() {
  return new Date().toISOString().replace(/[:.]/gu, "-");
}

async function pathExists(targetPath) {
  try {
    await fs.stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

function redactDatabaseUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);

    if (parsed.password) {
      parsed.password = "***";
    }

    return parsed.toString();
  } catch {
    return "<invalid DATABASE_URL>";
  }
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: options.env ?? process.env
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(" ")} failed with exit code ${code}.\n${stderr}`
        )
      );
    });
  });
}

async function assertPgDumpAvailable() {
  await runCommand("pg_dump", ["--version"]);
}

function isCommandNotFoundError(error) {
  return (
    Boolean(error) &&
    typeof error === "object" &&
    "code" in error &&
    (error).code === "ENOENT"
  );
}

function buildReadOnlyDatabaseUrl(databaseUrl) {
  try {
    const parsed = new URL(databaseUrl);
    const readOnlyOption = "-c default_transaction_read_only=on";
    const existing = parsed.searchParams.get("options");

    if (!existing) {
      parsed.searchParams.set("options", readOnlyOption);
      return parsed.toString();
    }

    if (existing.includes("default_transaction_read_only=on")) {
      return parsed.toString();
    }

    parsed.searchParams.set("options", `${existing} ${readOnlyOption}`);
    return parsed.toString();
  } catch {
    return databaseUrl;
  }
}

async function exportDatabaseAsJsonWithPrisma(databaseUrl, destinationFilePath) {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: buildReadOnlyDatabaseUrl(databaseUrl)
      }
    }
  });

  try {
    const tables = await prisma.$queryRawUnsafe(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_type = 'BASE TABLE'
       ORDER BY table_name`
    );
    const data = {};
    const tableStats = [];

    for (const table of tables) {
      const tableName = table.table_name;
      const escapedTableName = tableName.replace(/"/gu, "\"\"");
      const rows = await prisma.$queryRawUnsafe(
        `SELECT to_jsonb(t) AS row_data FROM "public"."${escapedTableName}" t`
      );
      const normalizedRows = rows.map((row) => row.row_data ?? null);

      data[tableName] = normalizedRows;
      tableStats.push({
        table: tableName,
        rowCount: normalizedRows.length
      });
      process.stdout.write(
        `[backup-postgres] Exported table "${tableName}" (${normalizedRows.length} row(s)).\n`
      );
    }

    await fs.writeFile(
      destinationFilePath,
      JSON.stringify(
        {
          backupType: "postgres-json-fallback",
          createdAt: new Date().toISOString(),
          databaseUrl: redactDatabaseUrl(databaseUrl),
          tables: tableStats,
          data
        },
        null,
        2
      ),
      "utf8"
    );

    return tableStats;
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    process.stdout.write(HELP_TEXT);
    return;
  }

  const envMap = await loadEnvFile(options.envFile);
  const databaseUrl = readRequiredEnvValue("DATABASE_URL", envMap);
  const outputRoot = path.resolve(options.outputDir);
  const backupName = `postgres-${createTimestamp()}`;
  const finalDir = path.join(outputRoot, backupName);
  const tempDir = `${finalDir}.tmp`;

  process.stdout.write(
    `[backup-postgres] Target database: ${redactDatabaseUrl(databaseUrl)}\n`
  );

  let canUsePgDump = true;

  try {
    await assertPgDumpAvailable();
  } catch (error) {
    if (isCommandNotFoundError(error)) {
      canUsePgDump = false;
      process.stdout.write(
        "[backup-postgres] pg_dump not found. Falling back to JSON export via Prisma.\n"
      );
    } else {
      throw error;
    }
  }

  if (options.dryRun) {
    if (canUsePgDump) {
      process.stdout.write(
        "[backup-postgres] Dry run complete. pg_dump is available and DATABASE_URL is configured.\n"
      );
    } else {
      process.stdout.write(
        "[backup-postgres] Dry run complete. DATABASE_URL is configured; JSON fallback will be used because pg_dump is unavailable.\n"
      );
    }
    return;
  }

  if (await pathExists(finalDir)) {
    throw new Error(`Refusing to overwrite existing backup directory: ${finalDir}`);
  }

  if (await pathExists(tempDir)) {
    throw new Error(`Temporary backup directory already exists: ${tempDir}`);
  }

  await fs.mkdir(tempDir, { recursive: true });
  try {
    let manifest;

    if (canUsePgDump) {
      const dumpFilePath = path.join(tempDir, "database.dump");
      const schemaFilePath = path.join(tempDir, "schema.sql");
      const backupEnv = {
        ...process.env,
        PGOPTIONS: `${process.env.PGOPTIONS ? `${process.env.PGOPTIONS} ` : ""}-c default_transaction_read_only=on`
      };

      process.stdout.write(
        "[backup-postgres] Running full pg_dump (custom format)...\n"
      );
      await runCommand(
        "pg_dump",
        [
          "--dbname",
          databaseUrl,
          "--format=custom",
          "--no-owner",
          "--no-privileges",
          "--file",
          dumpFilePath
        ],
        { env: backupEnv }
      );

      process.stdout.write("[backup-postgres] Running schema-only pg_dump...\n");
      await runCommand(
        "pg_dump",
        [
          "--dbname",
          databaseUrl,
          "--schema-only",
          "--no-owner",
          "--no-privileges",
          "--file",
          schemaFilePath
        ],
        { env: backupEnv }
      );

      const [dumpStats, schemaStats] = await Promise.all([
        fs.stat(dumpFilePath),
        fs.stat(schemaFilePath)
      ]);

      manifest = {
        backupType: "postgres",
        createdAt: new Date().toISOString(),
        databaseUrl: redactDatabaseUrl(databaseUrl),
        dumpMode: "pg_dump",
        files: [
          {
            path: "database.dump",
            size: dumpStats.size
          },
          {
            path: "schema.sql",
            size: schemaStats.size
          }
        ]
      };
    } else {
      const jsonFilePath = path.join(tempDir, "database.json");
      const tableStats = await exportDatabaseAsJsonWithPrisma(
        databaseUrl,
        jsonFilePath
      );
      const jsonStats = await fs.stat(jsonFilePath);

      manifest = {
        backupType: "postgres",
        createdAt: new Date().toISOString(),
        databaseUrl: redactDatabaseUrl(databaseUrl),
        dumpMode: "json-fallback",
        tables: tableStats,
        files: [
          {
            path: "database.json",
            size: jsonStats.size
          }
        ]
      };
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
    `[backup-postgres] Backup complete. Files written to: ${finalDir}\n`
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[backup-postgres] ERROR: ${message}\n`);
  process.exit(1);
});
