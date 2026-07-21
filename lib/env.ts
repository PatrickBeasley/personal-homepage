function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function assertPresent(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

/**
 * These MUST be written as static `process.env.NEXT_PUBLIC_*` references.
 *
 * Next inlines public env vars into the client bundle by literal text
 * replacement at build time, so a computed `process.env[name]` lookup is left
 * untouched and resolves to `undefined` in the browser — which threw inside
 * `createBrowserSupabaseClient()` and surfaced as a generic "Something went
 * wrong" on the login form. Server code is unaffected because it reads a real
 * `process.env` at runtime.
 *
 * See node_modules/next/dist/docs/01-app/02-guides/environment-variables.md
 * ("dynamic lookups will not be inlined"). Do not refactor these back into a
 * helper that takes the variable name as an argument.
 */
export function getSupabasePublicEnv() {
  return {
    url: assertPresent("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    anonKey: assertPresent(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
  };
}

export function getSupabaseServiceRoleKey() {
  return getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
}

export function getAdminEmail() {
  return getRequiredEnv("ADMIN_EMAIL");
}

/**
 * The canonical public origin, for anything that must not trust request
 * headers. Magic-link redirect targets in particular: deriving an origin from
 * `Host` or `x-forwarded-host` is how link poisoning happens.
 *
 * Defaults to the www host because that is canonical — the apex 307-redirects
 * to it. (Note `app/layout.tsx`, `app/robots.ts` and `app/sitemap.ts` still
 * default to the apex. Harmless, since the redirect resolves it, but worth
 * unifying separately.)
 */
export function getSiteUrl() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.patrickbeasley.com";
  return raw.replace(/\/+$/, "");
}
