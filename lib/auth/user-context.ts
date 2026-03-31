import type { User } from "@supabase/supabase-js";

import { isAdminEmail } from "@/lib/auth/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface UserContext {
  user: User | null;
  isAdmin: boolean;
}

export async function getUserContext(): Promise<UserContext> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { user: null, isAdmin: false };
  }

  return {
    user,
    isAdmin: isAdminEmail(user.email),
  };
}