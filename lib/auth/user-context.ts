import { cache } from "react";

import { isAdminEmail } from "@/lib/auth/admin";
import { verifyClaims } from "@/lib/auth/claims";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * `user` is deliberately narrower than Supabase's `User`: the only consumers
 * (app/dashboard/layout.tsx, app/login/page.tsx) test it for truthiness, and
 * fetching a full user object costs a network round trip that the JWT already
 * answers for free.
 */
export interface UserContext {
  user: { id: string; email: string | null } | null;
  isAdmin: boolean;
}

/**
 * Wrapped in React `cache()` so a layout and a page in the same render pass
 * share one verification rather than repeating it.
 */
export const getUserContext = cache(async function getUserContext(): Promise<UserContext> {
  const supabase = await createServerSupabaseClient();
  const claims = await verifyClaims(supabase);

  if (!claims) {
    return { user: null, isAdmin: false };
  }

  return {
    user: { id: claims.id, email: claims.email },
    isAdmin: isAdminEmail(claims.email),
  };
});
