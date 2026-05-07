export type MobileRuntimeConfig = {
  supabaseUrl: string;
  manifestPath: string;
};

export const MOBILE_RUNTIME_ENV_VARS = [
  "EXPO_PUBLIC_OCNOER_SUPABASE_URL",
  "EXPO_PUBLIC_OCNOER_RUNTIME_MANIFEST_PATH"
] as const;

type MobileRuntimeEnvVar = (typeof MOBILE_RUNTIME_ENV_VARS)[number];

type PublicEnv = {
  EXPO_PUBLIC_OCNOER_SUPABASE_URL?: string;
  EXPO_PUBLIC_OCNOER_RUNTIME_MANIFEST_PATH?: string;
};

declare const process: {
  env: PublicEnv;
};

function readPublicEnvVar(
  name: MobileRuntimeEnvVar,
  rawValue: string | undefined
) {
  const value = rawValue?.trim();

  if (!value) {
    throw new Error(
      `Missing required public Expo environment variable: ${name}`
    );
  }

  return value;
}

function normalizeSupabaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

export function getMobileRuntimeConfig(): MobileRuntimeConfig {
  // Expo statically inlines EXPO_PUBLIC_* values only for dot-notation access.
  const supabaseUrl = readPublicEnvVar(
    "EXPO_PUBLIC_OCNOER_SUPABASE_URL",
    process.env.EXPO_PUBLIC_OCNOER_SUPABASE_URL
  );
  const manifestPath = readPublicEnvVar(
    "EXPO_PUBLIC_OCNOER_RUNTIME_MANIFEST_PATH",
    process.env.EXPO_PUBLIC_OCNOER_RUNTIME_MANIFEST_PATH
  );

  return {
    supabaseUrl: normalizeSupabaseUrl(supabaseUrl),
    manifestPath
  };
}
