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