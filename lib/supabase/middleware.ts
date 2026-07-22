import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { verifyClaims } from "@/lib/auth/claims";
import { getSupabasePublicEnv } from "@/lib/env";

export async function updateSession(request: NextRequest) {
  const { url, anonKey } = getSupabasePublicEnv();

  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));

        response = NextResponse.next({
          request,
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // Verifies the JWT locally against the cached JWKS instead of calling
  // /auth/v1/user over the network. Session refresh is preserved: with no jwt
  // argument getClaims() calls getSession() internally, which refreshes an
  // expiring token and fires the setAll cookie callback above.
  await verifyClaims(supabase);

  return response;
}