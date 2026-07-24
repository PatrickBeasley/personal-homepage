import { NextResponse, type NextRequest } from "next/server";

import { requireAdminAuth } from "@/lib/auth/admin-guard";
import { apiError, isUuid } from "@/lib/dashboard/api";
import type { LinkItem } from "@/lib/dashboard/types";

/**
 * POST /api/links/[id]/click
 *
 * Atomically increments the link's click_count (and last_clicked_at) via the
 * increment_link_click RPC, which runs security invoker so the admin RLS policy
 * still gates the write. Returns the updated link entity (200); an unknown id —
 * or an id RLS refuses — comes back as no row from the RPC (setof) and is a 404.
 *
 * Called by navigator.sendBeacon, which ignores the response; the body exists
 * for the wire convention and for reading the stored value in verification.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdminAuth(request);
  if (authResult.error) {
    return authResult.error;
  }

  const { supabase } = authResult;
  const { id } = await params;

  if (!isUuid(id)) {
    return apiError("NOT_FOUND", "No link with that id.", 404);
  }

  const { data, error } = await supabase
    .rpc("increment_link_click", { link_id: id })
    .maybeSingle();

  if (error) {
    console.error("Link click increment error:", error);
    return apiError("SERVER_ERROR", "Could not record the click.", 500);
  }

  if (!data) {
    return apiError("NOT_FOUND", "No link with that id.", 404);
  }

  return NextResponse.json(data as LinkItem, { status: 200 });
}
