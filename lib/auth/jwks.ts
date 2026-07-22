import type { JWK } from "@supabase/supabase-js";

/**
 * A process-wide JWKS cache.
 *
 * `auth-js` already caches the key set, but on the *client instance*
 * (GoTrueClient.js:141), and `createServerSupabaseClient()` builds a fresh
 * client for every request. Without this module every `getClaims()` call would
 * fetch `/.well-known/jwks.json`, trading the `/auth/v1/user` round trip we are
 * removing for a different one.
 *
 * `fetchJwk` short-circuits before any network call when a matching key is
 * supplied through `options.jwks` (GoTrueClient.js:4683), so passing this cache
 * in makes verification fully local.
 *
 * On a warm serverless instance this survives across requests. On a cold one it
 * costs a single fetch, which is what the previous code paid on every request.
 */

const JWKS_PATH = "/auth/v1/.well-known/jwks.json";

/**
 * Matches `auth-js`'s own `JWKS_TTL` (lib/constants.js:27) and the endpoint's
 * `Cache-Control: public, max-age=600`. Verified against production on
 * 2026-07-22.
 */
const JWKS_TTL_MS = 10 * 60 * 1000;

let cachedKeys: { keys: JWK[] } | null = null;
let cachedAt = 0;

/** Test seam. Never called from application code. */
export function __resetJwksCacheForTests(): void {
  cachedKeys = null;
  cachedAt = 0;
}

/**
 * The cached key set, refreshing it when the TTL has elapsed.
 *
 * Returns null only when nothing is cached *and* the fetch failed. A null makes
 * `getClaims()` fall back to fetching the key set itself, and ultimately to a
 * network `getUser()` — slower, but never less correct. A failed *refresh* with
 * a populated cache serves the stale key rather than signing every device out.
 */
export async function getCachedJwks(
  supabaseUrl: string,
  now: number = Date.now()
): Promise<{ keys: JWK[] } | null> {
  if (cachedKeys && cachedAt + JWKS_TTL_MS > now) {
    return cachedKeys;
  }

  try {
    const response = await fetch(`${supabaseUrl}${JWKS_PATH}`);

    if (!response.ok) {
      return cachedKeys;
    }

    const body: unknown = await response.json();
    const keys =
      typeof body === "object" && body !== null
        ? (body as { keys?: unknown }).keys
        : undefined;

    if (!Array.isArray(keys) || keys.length === 0) {
      return cachedKeys;
    }

    cachedKeys = { keys: keys as JWK[] };
    cachedAt = now;

    return cachedKeys;
  } catch {
    return cachedKeys;
  }
}
