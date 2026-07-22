import { getCachedJwks } from "@/lib/auth/jwks";
import { getSupabasePublicEnv } from "@/lib/env";

/** The identity fields the app actually reads off a verified token. */
export interface VerifiedClaims {
  id: string;
  email: string | null;
}

/**
 * The narrow slice of a Supabase client this module needs. Declared structurally
 * so both the server client and the middleware client satisfy it without either
 * importing the other.
 */
export interface ClaimsCapableClient {
  auth: {
    getClaims: (
      jwt?: string,
      options?: { jwks?: { keys: unknown[] } }
    ) => Promise<{ data: unknown; error: unknown }>;
  };
}

/**
 * Verifies the caller's JWT and returns its identity claims, or null when there
 * is no usable session.
 *
 * This is a real cryptographic signature check, not a decode: the project signs
 * with ES256 (verified against the live JWKS endpoint on 2026-07-22), so
 * `getClaims()` verifies locally through WebCrypto with no network call. It is
 * therefore a safe replacement for `getUser()`, unlike `getSession()`.
 *
 * Two behaviours worth not rediscovering:
 *
 *   - Passing the cached key set is what keeps this local. Without it
 *     `getClaims()` fetches the JWKS itself on every fresh client (see
 *     lib/auth/jwks.ts).
 *   - Session *refresh* is preserved. With no `jwt` argument `getClaims()` calls
 *     `getSession()` internally (GoTrueClient.js:4782), which refreshes an
 *     expiring token and fires the cookie `setAll` callback.
 *
 * If the project were ever switched back to a symmetric (HS*) signing key,
 * `getClaims()` falls back to a network `getUser()` on its own
 * (GoTrueClient.js:4800). That degrades speed, never correctness.
 */
export async function verifyClaims(
  supabase: ClaimsCapableClient
): Promise<VerifiedClaims | null> {
  const { url } = getSupabasePublicEnv();
  const jwks = await getCachedJwks(url);

  const { data, error } = await supabase.auth.getClaims(
    undefined,
    jwks ? { jwks } : undefined
  );

  // Three-way union: success, an explicit error, or no session at all.
  if (error || !data) {
    return null;
  }

  const { claims } = data as { claims?: Record<string, unknown> };

  if (!claims || typeof claims.sub !== "string" || !claims.sub) {
    return null;
  }

  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
  };
}
