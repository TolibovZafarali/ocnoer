import { PrismaClient } from "@prisma/client";

declare global {
  var __prismaClient__: PrismaClient | undefined;
  var __prismaClientUrl__: string | undefined;
}

function normalizeEnvUrl(value: string | undefined) {
  const normalized = value?.trim();

  return normalized && normalized.length > 0 ? normalized : undefined;
}

function isSupabaseDirectDbUrl(value: string) {
  try {
    const parsed = new URL(value);

    return (
      parsed.hostname.startsWith("db.") &&
      parsed.hostname.endsWith(".supabase.co") &&
      (parsed.port === "" || parsed.port === "5432")
    );
  } catch {
    return false;
  }
}

function resolvePrismaRuntimeUrl() {
  const databaseUrl = normalizeEnvUrl(process.env.DATABASE_URL);
  const directUrl = normalizeEnvUrl(process.env.DIRECT_URL);

  if (!databaseUrl) {
    return directUrl;
  }

  // Supabase direct DB hosts are often IPv6-only; prefer DIRECT_URL when provided.
  if (directUrl && isSupabaseDirectDbUrl(databaseUrl)) {
    return directUrl;
  }

  return databaseUrl;
}

const runtimeUrl = resolvePrismaRuntimeUrl();
const shouldReuseClient =
  globalThis.__prismaClient__ &&
  globalThis.__prismaClientUrl__ === runtimeUrl;

export const prisma =
  shouldReuseClient && globalThis.__prismaClient__
    ? globalThis.__prismaClient__
    : new PrismaClient(
        runtimeUrl
          ? {
              datasources: {
                db: {
                  url: runtimeUrl
                }
              }
            }
          : undefined
      );

if (process.env.NODE_ENV !== "production") {
  globalThis.__prismaClient__ = prisma;
  globalThis.__prismaClientUrl__ = runtimeUrl;
}
