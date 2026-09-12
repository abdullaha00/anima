/**
 * Server-only fetch wrapper for the simulator.
 *
 * This module must only be imported from server code: route handlers, server
 * components, server actions and scripts. The API key is read from
 * process.env here and nowhere else. The guard below throws if the module is
 * ever bundled into a browser.
 */

if (typeof window !== 'undefined') {
  throw new Error('sim-client is server-only');
}

const DEFAULT_BASE_URL = 'https://sim.animahealth.com';
const DEFAULT_TIMEOUT_MS = 15_000;

export interface SimResponse<T> {
  /** HTTP status. 0 means the request never completed (timeout or network error). */
  status: number;
  /** Parsed body, or null when the status was not 200 or the body was not JSON. */
  json: T | null;
}

export interface SimGetOptions {
  timeoutMs?: number;
}

/** The simulator base URL, without a trailing slash. */
export function simBaseUrl(): string {
  const raw = process.env.SIM_BASE_URL?.trim();
  const base = raw && raw.length > 0 ? raw : DEFAULT_BASE_URL;
  return base.replace(/\/+$/, '');
}

/** The team key. Throws when missing, because nothing works without it. */
function simApiKey(): string {
  const key = process.env.SIM_API_KEY?.trim();
  if (!key) {
    throw new Error('SIM_API_KEY is not set. Add it to .env.local.');
  }
  return key;
}

/** Build the full URL for a path and optional query parameters. */
function buildUrl(path: string, params?: Record<string, string | number>): string {
  const url = new URL(path.startsWith('/') ? path : `/${path}`, `${simBaseUrl()}/`);
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      url.searchParams.set(name, String(value));
    }
  }
  return url.toString();
}

/**
 * GET a JSON resource from the simulator.
 *
 * Never throws on HTTP errors, timeouts or malformed bodies; those come back
 * as a non-200 status with a null body. The only thrown error is a missing key.
 */
export async function simGet<T>(
  path: string,
  params?: Record<string, string | number>,
  opts?: SimGetOptions,
): Promise<SimResponse<T>> {
  const key = simApiKey();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(buildUrl(path, params), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
      cache: 'no-store',
    });

    if (response.status !== 200) {
      return { status: response.status, json: null };
    }

    try {
      const json = (await response.json()) as T;
      return { status: 200, json };
    } catch {
      return { status: 200, json: null };
    }
  } catch {
    // Aborted (timeout) or a network failure. Callers treat status 0 as retryable.
    return { status: 0, json: null };
  } finally {
    clearTimeout(timer);
  }
}
