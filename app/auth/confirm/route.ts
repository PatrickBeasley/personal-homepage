import { NextRequest, NextResponse } from "next/server";

import { getRequestOrigin, normalizeNextPath } from "@/lib/auth/redirects";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Magic-link landing.
 *
 * @supabase/ssr 0.10.0 pins both clients to the PKCE flow
 * (`createBrowserClient.js` and `createServerClient.js` both hard-set
 * `flowType: "pkce"`), and under PKCE `signInWithOtp` posts a
 * `code_challenge` to /otp (auth-js `GoTrueClient.js`). GoTrue therefore
 * returns the user to `emailRedirectTo` with `?code=`, not a `token_hash`,
 * so this route completes the sign-in with `exchangeCodeForSession` — the
 * same API the OAuth callback uses. The matching code verifier was written
 * to a cookie by the server client in `sendMagicLinkAction` (`cookies.js`
 * applies storage as soon as it sees a `-code-verifier` key), which is what
 * lets this later, separate request finish the exchange that request
 * started.
 */
function loginRedirect(origin: string, code: string, next: string) {
  const url = new URL("/login", origin);

  url.searchParams.set("auth_error", code);
  url.searchParams.set("next", next);

  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const origin = getRequestOrigin(request);
  const code = request.nextUrl.searchParams.get("code");
  const next = normalizeNextPath(request.nextUrl.searchParams.get("next"), "/dashboard");

  if (!code) {
    return loginRedirect(origin, "missing_code", next);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return loginRedirect(origin, "magic_link_failed", next);
  }

  return NextResponse.redirect(new URL(next, origin));
}
