import { NextRequest, NextResponse } from "next/server";

import { isAdminEmail } from "@/lib/auth/admin";
import { getRequestOrigin, normalizeNextPath } from "@/lib/auth/redirects";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const next = normalizeNextPath(request.nextUrl.searchParams.get("next"));
  const origin = getRequestOrigin(request);
  const callbackUrl = new URL("/auth/callback", origin);

  callbackUrl.searchParams.set("next", next);

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const destination = isAdminEmail(user.email) && next === "/" ? "/admin" : next;
    return NextResponse.redirect(new URL(destination, origin));
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl.toString(),
    },
  });

  if (error || !data.url) {
    const failureUrl = new URL("/", origin);
    failureUrl.searchParams.set("auth_error", "oauth_start_failed");

    return NextResponse.redirect(failureUrl);
  }

  return NextResponse.redirect(data.url);
}
