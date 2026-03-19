function delay(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export async function waitForRouteReady(
  path: string,
  options?: {
    attempts?: number;
    delayMs?: number;
  }
) {
  const attempts = options?.attempts ?? 12;
  const delayMs = options?.delayMs ?? 500;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(path, {
        cache: "no-store",
        credentials: "same-origin"
      });

      if (response.ok) {
        return true;
      }
    } catch {
      // Ignore transient readiness checks and retry.
    }

    if (attempt < attempts - 1) {
      await delay(delayMs);
    }
  }

  return false;
}
