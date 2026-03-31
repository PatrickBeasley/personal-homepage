import { NextRequest, NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/auth/admin-guard";

/**
 * PATCH /api/contact-submissions/[id]
 * Update contact submission status.
 * Body: { status: "unread" | "in_progress" | "resolved" | "archived" }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdminAuth(request);
  if (authResult.error) {
    return authResult.error;
  }

  const { supabase, user } = authResult;
  const { id } = await params;

  try {
    const body = await request.json();
    const { status } = body;

    // Validate status
    const validStatuses = ["unread", "in_progress", "resolved", "archived"];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json(
        {
          error: `Invalid status. Allowed values: ${validStatuses.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Update submission
    const { data, error } = await supabase
      .from("contact_submissions")
      .update({
        status,
        handled_by: user.id,
        handled_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      console.error("Contact submission update error:", error);
      return NextResponse.json(
        { error: "Failed to update submission" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: "Submission updated successfully", submission: data },
      { status: 200 }
    );
  } catch (error) {
    console.error("Contact submission update error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
