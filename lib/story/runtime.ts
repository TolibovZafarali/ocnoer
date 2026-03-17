import { getSupabaseEnv, getSupabaseServerEnv } from "@/lib/supabase/env";

export function getRuntimeManifestStoragePath() {
  const { runtimeBucket } = getSupabaseServerEnv();

  return `${runtimeBucket}/runtime/manifest.json`;
}

export function getRuntimeBootstrapConfig() {
  const { url } = getSupabaseEnv();

  return {
    manifestPath: getRuntimeManifestStoragePath(),
    supabaseUrl: url
  };
}

export function toPublicStorageUrl(supabaseUrl: string, storagePath: string | null) {
  if (!storagePath) {
    return null;
  }

  if (/^https?:\/\//i.test(storagePath) || storagePath.startsWith("/")) {
    return storagePath;
  }

  const [bucket, ...rest] = storagePath.split("/");

  if (!bucket || rest.length === 0) {
    return null;
  }

  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${rest.join("/")}`;
}

export async function fetchRuntimeJson<T>(
  supabaseUrl: string,
  storagePath: string
): Promise<T> {
  const url = toPublicStorageUrl(supabaseUrl, storagePath);

  if (!url) {
    throw new Error("Runtime storage path is invalid.");
  }

  const response = await fetch(url, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Unable to load runtime JSON (${response.status}).`);
  }

  return (await response.json()) as T;
}

