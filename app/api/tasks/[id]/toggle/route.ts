import { NextResponse, type NextRequest } from "next/server";

import { requireAdminAuth } from "@/lib/auth/admin-guard";
import { apiError, isUuid } from "@/lib/dashboard/api";
import { mapGsdFailure, toggleTask, type GsdError } from "@/lib/gsd/client";

function gsdFailure(failure: GsdError) {
  const { error, message, status } = mapGsdFailure(failure);

  return NextResponse.json({ error, message }, { status });
}

/**
 * POST /api/tasks/[id]/toggle
 * Completes/uncompletes via GSD. The 200 body is GSD's updated Task verbatim —
 * for repeating tasks that means a new dueDate and done still false, so the
 * client must apply the entity, not assume the flag flipped.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdminAuth(request);
  if (authResult.error) {
    return authResult.error;
  }

  const { id } = await params;

  // GSD ids are uuids; a malformed id can never exist, so answer 404 without
  // spending a GSD request on it.
  if (!isUuid(id)) {
    return apiError("NOT_FOUND", "No task with that id.", 404);
  }

  const result = await toggleTask(id);

  if (!result.ok) {
    return gsdFailure(result.error);
  }

  return NextResponse.json(result.data, { status: 200 });
}
