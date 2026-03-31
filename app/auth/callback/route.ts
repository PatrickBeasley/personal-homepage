import { NextRequest, NextResponse } from "next/server";

import { getRequestOrigin, normalizeNextPath } from "@/lib/auth/redirects";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const origin = getRequestOrigin(request);
  const code = request.nextUrl.searchParams.get("code");
  const next = normalizeNextPath(request.nextUrl.searchParams.get("next"));

  if (!code) {
    const missingCodeUrl = new URL("/", origin);
    missingCodeUrl.searchParams.set("auth_error", "missing_code");

    return NextResponse.redirect(missingCodeUrl);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const failureUrl = new URL("/", origin);
    failureUrl.searchParams.set("auth_error", "oauth_callback_failed");

    return NextResponse.redirect(failureUrl);
  }

  return NextResponse.redirect(new URL(next, origin));
}
