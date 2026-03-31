import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

import { requireAdminAuth } from "@/lib/auth/admin-guard";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// Allowed file extensions and MIME types
const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md", ".sql", ".py"];
const ALLOWED_MIMETYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "application/x-sql",
  "text/x-python",
];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * Handle admin file uploads.
 * Validates file extension, MIME type, and size.
 * Stores file in Supabase Storage and metadata in Postgres.
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
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Validate file extension
    const fileName = file.name;
    const extension = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();

    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return NextResponse.json(
        {
          error: `File type not allowed. Allowed types: ${ALLOWED_EXTENSIONS.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Validate MIME type
    if (!ALLOWED_MIMETYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file MIME type" },
        { status: 400 }
      );
    }

    // Validate file size
    const fileBuffer = await file.arrayBuffer();
    if (fileBuffer.byteLength > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: `File too large. Max size: ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB` },
        { status: 400 }
      );
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
      return NextResponse.json(
        { error: "Failed to upload file" },
        { status: 500 }
      );
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
      return NextResponse.json(
        { error: "Failed to save file metadata" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: "File uploaded successfully", file: data },
      { status: 201 }
    );
  } catch (error) {
    console.error("File upload error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
