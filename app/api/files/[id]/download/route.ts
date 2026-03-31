import { NextRequest, NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/auth/admin-guard";

/**
 * GET /api/files/[id]/download
 * Generate a signed download URL for a file.
 * Only admin can access this endpoint.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdminAuth(request);
  if (authResult.error) {
    return authResult.error;
  }

  const { supabase } = authResult;
  const { id } = await params;

  try {
    // Get file metadata
    const { data: fileData, error: fileError } = await supabase
      .from("files_metadata")
      .select("id, storage_path, file_name")
      .eq("id", id)
      .single();

    if (fileError || !fileData) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404 }
      );
    }

    // Generate signed URL (valid for 1 hour)
    const { data, error: urlError } = await supabase.storage
      .from("files")
      .createSignedUrl(fileData.storage_path, 3600);

    if (urlError) {
      console.error("Signed URL generation error:", urlError);
      return NextResponse.json(
        { error: "Failed to generate download URL" },
        { status: 500 }
      );
    }

    // Update last_downloaded_at
    await supabase
      .from("files_metadata")
      .update({ last_downloaded_at: new Date().toISOString() })
      .eq("id", id);

    return NextResponse.json(
      {
        signedUrl: data.signedUrl,
        fileName: fileData.file_name,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Download URL generation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
