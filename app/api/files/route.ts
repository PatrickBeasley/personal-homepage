import { NextRequest, NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/auth/admin-guard";

/**
 * GET /api/files
 * List all files (admin can see all, public files for others).
 * Query params:
 *   - all=true: list all files (admin only)
 *   - visibility=public|private: filter by visibility
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAdminAuth(request);
  if (authResult.error) {
    return authResult.error;
  }

  const { supabase } = authResult;

  try {
    const query = supabase
      .from("files_metadata")
      .select("id, file_name, file_size_bytes, visibility, created_at, description")
      .order("created_at", { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error("Files list error:", error);
      return NextResponse.json(
        { error: "Failed to fetch files" },
        { status: 500 }
      );
    }

    return NextResponse.json({ files: data }, { status: 200 });
  } catch (error) {
    console.error("Files list error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
