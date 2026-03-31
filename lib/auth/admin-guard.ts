import { NextRequest, NextResponse } from "next/server";

import { isAdminEmail } from "@/lib/auth/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Middleware guard for admin-protected API routes.
 * Verifies user is authenticated and has admin email.
 * Returns { user, supabase } on success or NextResponse (401/403) on failure.
 */
export async function requireAdminAuth(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return {
        error: NextResponse.json(
          { error: "Unauthorized: No authenticated session" },
          { status: 401 }
        ),
      };
    }

    if (!isAdminEmail(user.email)) {
      return {
        error: NextResponse.json(
          { error: "Forbidden: Admin access required" },
          { status: 403 }
        ),
      };
    }

    return { user, supabase };
  } catch (err) {
    console.error("Admin auth guard error:", err);
    return {
      error: NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      ),
    };
  }
}
