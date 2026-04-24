export type MobileRuntimeConfig = {
  supabaseUrl: string;
  manifestPath: string;
};

export const MOBILE_RUNTIME_ENV_VARS = [
  "EXPO_PUBLIC_OCNOER_SUPABASE_URL",
  "EXPO_PUBLIC_OCNOER_RUNTIME_MANIFEST_PATH"
] as const;

type MobileRuntimeEnvVar = (typeof MOBILE_RUNTIME_ENV_VARS)[number];

type PublicEnv = Partial<Record<MobileRuntimeEnvVar, string>>;

declare const process: {
  env: PublicEnv;
};

function readPublicEnvVar(name: MobileRuntimeEnvVar) {
  const value = process.env[name]?.trim();

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
  return {
    supabaseUrl: normalizeSupabaseUrl(
      readPublicEnvVar("EXPO_PUBLIC_OCNOER_SUPABASE_URL")
    ),
    manifestPath: readPublicEnvVar("EXPO_PUBLIC_OCNOER_RUNTIME_MANIFEST_PATH")
  };
}
