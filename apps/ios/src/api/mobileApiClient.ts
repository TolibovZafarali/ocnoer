import { getMobileApiConfig, type MobileApiConfig } from "../config/api";

export class MobileApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

type JsonBody = Record<string, unknown>;
type RequestJsonOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  token?: string | null;
  body?: JsonBody;
};

async function readResponseJson(response: Response) {
  return (await response.json().catch(() => null)) as unknown;
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (
    typeof payload === "object" &&
    payload != null &&
    "error" in payload &&
    typeof (payload as { error?: unknown }).error === "string"
  ) {
    return (payload as { error: string }).error;
  }

  return fallback;
}

function getNetworkErrorMessage(baseUrl: string) {
  return `Unable to reach the mobile API at ${baseUrl}. Start the Next.js backend and make sure this URL is reachable from this device.`;
}

export type MobileApiClient = {
  requestJson: <T>(path: string, options?: RequestJsonOptions) => Promise<T>;
};

export function createMobileApiClient(
  config: MobileApiConfig = getMobileApiConfig()
): MobileApiClient {
  return {
    requestJson: async <T>(path: string, options: RequestJsonOptions = {}) => {
      let response: Response;

      try {
        response = await fetch(`${config.baseUrl}${path}`, {
          method: options.method ?? "GET",
          headers: {
            accept: "application/json",
            ...(options.body ? { "content-type": "application/json" } : {}),
            ...(options.token
              ? { authorization: `Bearer ${options.token}` }
              : {})
          },
          body: options.body ? JSON.stringify(options.body) : undefined
        });
      } catch {
        throw new MobileApiError(getNetworkErrorMessage(config.baseUrl), 0);
      }

      const payload = await readResponseJson(response);

      if (!response.ok) {
        throw new MobileApiError(
          getErrorMessage(
            payload,
            `Mobile API request failed (${response.status}).`
          ),
          response.status
        );
      }

      return payload as T;
    }
  };
}
