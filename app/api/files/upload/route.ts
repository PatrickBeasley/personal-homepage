import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

import { requireAdminAuth } from "@/lib/auth/admin-guard";
import { apiError } from "@/lib/dashboard/api";
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_MIMETYPES,
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_LABEL,
  fileExtension,
} from "@/lib/dashboard/files";

/**
 * POST /api/files/upload
 *
 * Multipart upload. Validates extension, MIME type and size, writes the bytes
 * to Supabase Storage, then records the metadata row. The constraints are
 * shared with the client view via lib/dashboard/files.ts; the checks below are
 * the enforcing copy.
 */
export async function POST(request: NextRequest) {
  // Verify admin authentication
  const authResult = await requireAdminAuth(request);
  if (authResult.error) {
    return authResult.error;
  }

  const { user, supabase } = authResult;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const description = formData.get("description") as string | null;

    if (!file) {
      return apiError("INVALID_BODY", "No file was provided.", 400);
    }

    // Validate file extension
    const fileName = file.name;
    const extension = fileExtension(fileName);

    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return apiError(
        "INVALID_FILE_TYPE",
        `File type not allowed. Allowed types: ${ALLOWED_EXTENSIONS.join(", ")}`,
        400
      );
    }

    // Validate MIME type
    if (!ALLOWED_MIMETYPES.includes(file.type)) {
      return apiError(
        "INVALID_FILE_TYPE",
        `The browser reported this file as "${file.type || "unknown"}", which is not an accepted type.`,
        400
      );
    }

    // Validate file size
    const fileBuffer = await file.arrayBuffer();
    if (fileBuffer.byteLength > MAX_FILE_SIZE_BYTES) {
      return apiError("FILE_TOO_LARGE", `File too large. Max size: ${MAX_FILE_SIZE_LABEL}`, 400);
    }

    // Generate unique storage path
    const fileId = crypto.randomUUID();
    const storagePath = `uploads/${fileId}${extension}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("files")
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return apiError("STORAGE_ERROR", "Could not store the file.", 500);
    }

    // Store metadata in Postgres
    const { data, error: dbError } = await supabase
      .from("files_metadata")
      .insert({
        storage_path: storagePath,
        file_name: fileName,
        mime_type: file.type,
        file_extension: extension,
        file_size_bytes: fileBuffer.byteLength,
        description: description || null,
        visibility: "private",
        uploaded_by: user.id,
      })
      .select("*")
      .single();

    if (dbError) {
      console.error("Database insert error:", dbError);
      // Clean up storage if metadata insert fails
      await supabase.storage.from("files").remove([storagePath]);
      return apiError("SERVER_ERROR", "Could not save the file details.", 500);
    }

    return NextResponse.json(
      { message: "File uploaded successfully", file: data },
      { status: 201 }
    );
  } catch (error) {
    console.error("File upload error:", error);
    return apiError("SERVER_ERROR", "Internal server error.", 500);
  }
}
