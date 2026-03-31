import { NextRequest, NextResponse } from "next/server";

import { getRequestOrigin, normalizeNextPath } from "@/lib/auth/redirects";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const next = normalizeNextPath(request.nextUrl.searchParams.get("next"));
  const origin = getRequestOrigin(request);
  const supabase = await createServerSupabaseClient();

  await supabase.auth.signOut();

  return NextResponse.redirect(new URL(next, origin));
}