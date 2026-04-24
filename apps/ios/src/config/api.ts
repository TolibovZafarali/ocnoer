export type MobileApiConfig = {
  baseUrl: string;
};

export const MOBILE_API_ENV_VARS = ["EXPO_PUBLIC_OCNOER_API_BASE_URL"] as const;

type MobileApiEnvVar = (typeof MOBILE_API_ENV_VARS)[number];

type PublicEnv = Partial<Record<MobileApiEnvVar, string>>;

declare const process: {
  env: PublicEnv;
};

function readPublicEnvVar(name: MobileApiEnvVar) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `Missing required public Expo environment variable: ${name}`
    );
  }

  return value;
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

export function getMobileApiConfig(): MobileApiConfig {
  return {
    baseUrl: normalizeBaseUrl(
      readPublicEnvVar("EXPO_PUBLIC_OCNOER_API_BASE_URL")
    )
  };
}
