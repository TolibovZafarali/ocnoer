import { NativeModules } from "react-native";

export type MobileApiConfig = {
  baseUrl: string;
};

export const MOBILE_API_ENV_VARS = ["EXPO_PUBLIC_OCNOER_API_BASE_URL"] as const;

type MobileApiEnvVar = (typeof MOBILE_API_ENV_VARS)[number];

type PublicEnv = {
  EXPO_PUBLIC_OCNOER_API_BASE_URL?: string;
};

declare const process: {
  env: PublicEnv;
};

function readPublicEnvVar(name: MobileApiEnvVar, rawValue: string | undefined) {
  const value = rawValue?.trim();

  if (!value) {
    throw new Error(
      `Missing required public Expo environment variable: ${name}`
    );
  }

  return value;
}

function isLocalhost(hostname: string) {
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
  );
}

function getDevServerHostname() {
  const scriptURL = NativeModules.SourceCode?.scriptURL;

  if (typeof scriptURL !== "string" || scriptURL.length === 0) {
    return null;
  }

  try {
    const hostname = new URL(scriptURL).hostname;

    return hostname.length > 0 ? hostname : null;
  } catch {
    return null;
  }
}

function resolveDeviceReachableLocalhost(value: string) {
  try {
    const url = new URL(value);

    if (!isLocalhost(url.hostname)) {
      return value;
    }

    const devServerHostname = getDevServerHostname();

    if (!devServerHostname || isLocalhost(devServerHostname)) {
      return value;
    }

    url.hostname = devServerHostname;

    return url.toString();
  } catch {
    return value;
  }
}

function normalizeBaseUrl(value: string) {
  return resolveDeviceReachableLocalhost(value).replace(/\/+$/, "");
}

export function getMobileApiConfig(): MobileApiConfig {
  // Expo statically inlines EXPO_PUBLIC_* values only for dot-notation access.
  const baseUrl = readPublicEnvVar(
    "EXPO_PUBLIC_OCNOER_API_BASE_URL",
    process.env.EXPO_PUBLIC_OCNOER_API_BASE_URL
  );

  return {
    baseUrl: normalizeBaseUrl(baseUrl)
  };
}
