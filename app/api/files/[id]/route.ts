import { NextRequest, NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/auth/admin-guard";

/**
 * PATCH /api/files/[id]
 * Update file metadata (visibility, description).
 */
export async function PATCH(
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
    const body = await request.json();
    const { visibility, description } = body;

    // Validate visibility if provided
    if (visibility && !["private", "public"].includes(visibility)) {
      return NextResponse.json(
        { error: "Invalid visibility value" },
        { status: 400 }
      );
    }

    // Update file metadata
    const updateData: Record<string, unknown> = {};
    if (visibility) updateData.visibility = visibility;
    if (description !== undefined) updateData.description = description;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("files_metadata")
      .update(updateData)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      console.error("File update error:", error);
      return NextResponse.json(
        { error: "Failed to update file" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: "File updated successfully", file: data },
      { status: 200 }
    );
  } catch (error) {
    console.error("File update error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/files/[id]
 * Delete a file from storage and remove metadata.
 */
export async function DELETE(
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
      .select("id, storage_path")
      .eq("id", id)
      .single();

    if (fileError || !fileData) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404 }
      );
    }

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from("files")
      .remove([fileData.storage_path]);

    if (storageError) {
      console.error("Storage deletion error:", storageError);
      return NextResponse.json(
        { error: "Failed to delete file from storage" },
        { status: 500 }
      );
    }

    // Delete metadata from database
    const { error: dbError } = await supabase
      .from("files_metadata")
      .delete()
      .eq("id", id);

    if (dbError) {
      console.error("Database deletion error:", dbError);
      return NextResponse.json(
        { error: "Failed to delete file metadata" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: "File deleted successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("File deletion error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
