import { NextRequest, NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/auth/admin-guard";
import { apiError } from "@/lib/dashboard/api";
import { FILE_COLUMNS } from "@/lib/dashboard/files";

/**
 * GET /api/files
 * Lists every stored document, newest first.
 *
 * Documents are not workspace-scoped: `files_metadata` has no `ctx` column, so
 * there is no `?ctx=` filter here and none is coming.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAdminAuth(request);
  if (authResult.error) {
    return authResult.error;
  }

  const { supabase } = authResult;

  try {
    const { data, error } = await supabase
      .from("files_metadata")
      .select(FILE_COLUMNS)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Files list error:", error);
      return apiError("SERVER_ERROR", "Could not load documents.", 500);
    }

    return NextResponse.json({ files: data ?? [] }, { status: 200 });
  } catch (error) {
    console.error("Files list error:", error);
    return apiError("SERVER_ERROR", "Could not load documents.", 500);
  }
}
