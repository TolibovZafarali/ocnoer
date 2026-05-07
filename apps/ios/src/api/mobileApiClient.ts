import { getMobileApiConfig, type MobileApiConfig } from "../config/api";

export const MOBILE_API_CONNECTION_ERROR_MESSAGE =
  "Connection is taking longer than expected. Please check your internet and try again.";

const MOBILE_API_REQUEST_TIMEOUT_MS = 15_000;
const MOBILE_API_RETRY_DELAYS_MS = [500, 1_500];

declare const __DEV__: boolean | undefined;

export class MobileApiError extends Error {
  readonly isTransient: boolean;
  readonly technicalMessage: string | null;

  constructor(
    message: string,
    readonly status: number,
    options: {
      isTransient?: boolean;
      technicalMessage?: string | null;
    } = {}
  ) {
    super(message);
    this.isTransient = options.isTransient ?? false;
    this.technicalMessage = options.technicalMessage ?? null;
  }
}

type JsonBody = Record<string, unknown>;
type RequestJsonOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  token?: string | null;
  body?: JsonBody;
};

type Fetcher = typeof fetch;

type MobileApiClientOptions = {
  fetcher?: Fetcher;
  retryDelaysMs?: readonly number[];
  timeoutMs?: number;
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

function shouldRetryStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function wait(delayMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function getTechnicalErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isDevelopmentBuild() {
  return typeof __DEV__ !== "undefined" && __DEV__;
}

function logMobileApiRetry(input: {
  attempt: number;
  baseUrl: string;
  detail: string;
  path: string;
  retryDelayMs: number;
}) {
  if (!isDevelopmentBuild()) {
    return;
  }

  console.warn("[mobile-api] retrying request", input);
}

function logMobileApiFailure(input: {
  attempts: number;
  baseUrl: string;
  detail: string;
  path: string;
}) {
  if (!isDevelopmentBuild()) {
    return;
  }

  console.warn("[mobile-api] request failed", input);
}

async function fetchWithTimeout(input: {
  fetcher: Fetcher;
  init: RequestInit;
  timeoutMs: number;
  url: string;
}) {
  const controller =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  if (controller) {
    timeoutId = setTimeout(() => {
      controller.abort();
    }, input.timeoutMs);
  }

  try {
    return await input.fetcher(input.url, {
      ...input.init,
      signal: controller?.signal
    });
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export type MobileApiClient = {
  requestJson: <T>(path: string, options?: RequestJsonOptions) => Promise<T>;
};

export function createMobileApiClient(
  config: MobileApiConfig = getMobileApiConfig(),
  clientOptions: MobileApiClientOptions = {}
): MobileApiClient {
  const fetcher = clientOptions.fetcher ?? fetch;
  const retryDelaysMs =
    clientOptions.retryDelaysMs ?? MOBILE_API_RETRY_DELAYS_MS;
  const timeoutMs = clientOptions.timeoutMs ?? MOBILE_API_REQUEST_TIMEOUT_MS;

  return {
    requestJson: async <T>(path: string, options: RequestJsonOptions = {}) => {
      let response: Response | null = null;
      const url = `${config.baseUrl}${path}`;
      const requestInit: RequestInit = {
        method: options.method ?? "GET",
        headers: {
          accept: "application/json",
          ...(options.body ? { "content-type": "application/json" } : {}),
          ...(options.token ? { authorization: `Bearer ${options.token}` } : {})
        },
        body: options.body ? JSON.stringify(options.body) : undefined
      };

      for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
        try {
          response = await fetchWithTimeout({
            fetcher,
            init: requestInit,
            timeoutMs,
            url
          });
        } catch (error) {
          const technicalMessage = getTechnicalErrorMessage(error);
          const retryDelayMs = retryDelaysMs[attempt];

          if (retryDelayMs != null) {
            logMobileApiRetry({
              attempt: attempt + 1,
              baseUrl: config.baseUrl,
              detail: technicalMessage,
              path,
              retryDelayMs
            });
            await wait(retryDelayMs);
            continue;
          }

          logMobileApiFailure({
            attempts: attempt + 1,
            baseUrl: config.baseUrl,
            detail: technicalMessage,
            path
          });
          throw new MobileApiError(MOBILE_API_CONNECTION_ERROR_MESSAGE, 0, {
            isTransient: true,
            technicalMessage
          });
        }

        if (
          response &&
          shouldRetryStatus(response.status) &&
          retryDelaysMs[attempt] != null
        ) {
          const retryDelayMs = retryDelaysMs[attempt] ?? 0;

          logMobileApiRetry({
            attempt: attempt + 1,
            baseUrl: config.baseUrl,
            detail: `HTTP ${response.status}`,
            path,
            retryDelayMs
          });
          await wait(retryDelayMs);
          continue;
        }

        break;
      }

      if (!response) {
        throw new MobileApiError(MOBILE_API_CONNECTION_ERROR_MESSAGE, 0, {
          isTransient: true
        });
      }

      if (shouldRetryStatus(response.status)) {
        const technicalMessage = `HTTP ${response.status}`;

        logMobileApiFailure({
          attempts: retryDelaysMs.length + 1,
          baseUrl: config.baseUrl,
          detail: technicalMessage,
          path
        });
        throw new MobileApiError(
          MOBILE_API_CONNECTION_ERROR_MESSAGE,
          response.status,
          {
            isTransient: true,
            technicalMessage
          }
        );
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
