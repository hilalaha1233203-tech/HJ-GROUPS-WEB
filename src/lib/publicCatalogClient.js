const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 2;

function isCircuitBreakerStatus(status) {
  return status === 402 || status === 429 || status >= 500;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Injectable so retries and cooldown can be tested without live credentials. */
export function createPublicCatalogFetcher(options = {}) {
  const fetchImpl = options.fetchImpl || ((input, init) => fetch(input, init));
  const now = options.now || (() => Date.now());
  const sleep = options.sleep || wait;
  const random = options.random || Math.random;
  const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  let blockedUntil = 0;

  return async function fetchPublicCatalog() {
    if (now() < blockedUntil) throw new Error("PUBLIC_CATALOG_COOLDOWN");

    let lastNetworkError;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      let response;
      try {
        response = await fetchImpl("/api/public-catalog", {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "default",
        });
      } catch (error) {
        lastNetworkError = error;
        if (attempt + 1 >= maxAttempts) break;
        const base = 400 * (2 ** attempt);
        await sleep(base + Math.floor(random() * base));
        continue;
      }

      if (isCircuitBreakerStatus(response.status)) {
        blockedUntil = now() + cooldownMs;
        throw new Error("PUBLIC_CATALOG_TEMPORARILY_UNAVAILABLE");
      }

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(String(payload?.error || "Public catalog unavailable"));
      }

      blockedUntil = 0;
      return payload;
    }

    throw lastNetworkError || new Error("Public catalog unavailable");
  };
}

export const fetchPublicCatalog = createPublicCatalogFetcher();
