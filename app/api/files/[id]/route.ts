import { NextRequest, NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/auth/admin-guard";
import { apiError, isUuid, readJsonObject } from "@/lib/dashboard/api";

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

  // A non-uuid id would make Postgres raise 22P02 and surface as a 500, when
  // the honest answer is that no such row exists.
  if (!isUuid(id)) {
    return apiError("NOT_FOUND", "No such document.", 404);
  }

  try {
    const body = await readJsonObject(request);

    if (!body) {
      return apiError("INVALID_BODY", "Expected a JSON object.", 400);
    }

    const { visibility, description } = body;

    // Validate visibility if provided
    if (visibility !== undefined && visibility !== "private" && visibility !== "public") {
      return apiError("INVALID_BODY", "Visibility must be 'private' or 'public'.", 400);
    }

    if (description !== undefined && description !== null && typeof description !== "string") {
      return apiError("INVALID_BODY", "Description must be a string or null.", 400);
    }

    // Update file metadata
    const updateData: Record<string, unknown> = {};
    if (visibility !== undefined) updateData.visibility = visibility;
    if (description !== undefined) updateData.description = description;

    if (Object.keys(updateData).length === 0) {
      return apiError("INVALID_BODY", "No fields to update.", 400);
    }

    const { data, error } = await supabase
      .from("files_metadata")
      .update(updateData)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) {
      console.error("File update error:", error);
      return apiError("SERVER_ERROR", "Could not update the document.", 500);
    }

    if (!data) {
      return apiError("NOT_FOUND", "No such document.", 404);
    }

    return NextResponse.json(
      { message: "File updated successfully", file: data },
      { status: 200 }
    );
  } catch (error) {
    console.error("File update error:", error);
    return apiError("SERVER_ERROR", "Internal server error.", 500);
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

  if (!isUuid(id)) {
    return apiError("NOT_FOUND", "No such document.", 404);
  }

  try {
    // Get file metadata
    const { data: fileData, error: fileError } = await supabase
      .from("files_metadata")
      .select("id, storage_path")
      .eq("id", id)
      .maybeSingle();

    if (fileError) {
      console.error("File lookup error:", fileError);
      return apiError("SERVER_ERROR", "Could not delete the document.", 500);
    }

    if (!fileData) {
      return apiError("NOT_FOUND", "No such document.", 404);
    }

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from("files")
      .remove([fileData.storage_path]);

    if (storageError) {
      console.error("Storage deletion error:", storageError);
      return apiError("STORAGE_ERROR", "Could not remove the stored file.", 500);
    }

    // Delete metadata from database
    const { error: dbError } = await supabase.from("files_metadata").delete().eq("id", id);

    if (dbError) {
      console.error("Database deletion error:", dbError);
      return apiError("SERVER_ERROR", "Could not delete the document.", 500);
    }

    return NextResponse.json(
      { message: "File deleted successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("File deletion error:", error);
    return apiError("SERVER_ERROR", "Internal server error.", 500);
  }
}
