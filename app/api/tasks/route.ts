import { NextResponse, type NextRequest } from "next/server";

import { requireAdminAuth } from "@/lib/auth/admin-guard";
import { apiError, isUuid, readJsonObject } from "@/lib/dashboard/api";
import {
  createTask,
  getAllTasks,
  getLists,
  isIsoDate,
  mapGsdFailure,
  type GsdError,
} from "@/lib/gsd/client";

/**
 * Proxy routes for Project-GSD. Not workspace-scoped (like Documents): tasks
 * live in GSD, which knows nothing about Work/Home. The bearer key never
 * leaves lib/gsd/client.ts; the browser only ever talks to these routes.
 */

/** GSD failures answer in our wire format via the tested pure mapper. */
function gsdFailure(failure: GsdError) {
  const { error, message, status } = mapGsdFailure(failure);

  return NextResponse.json({ error, message }, { status });
}

/**
 * GET /api/tasks
 * The refresh endpoint: lists + tasks in one response so the client can swap
 * its whole state atomically. Two GSD calls, well inside the 60/min limit.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAdminAuth(request);
  if (authResult.error) {
    return authResult.error;
  }

  const [lists, tasks] = await Promise.all([getLists(), getAllTasks()]);

  if (!lists.ok) {
    return gsdFailure(lists.error);
  }

  if (!tasks.ok) {
    return gsdFailure(tasks.error);
  }

  return NextResponse.json({ lists: lists.data, tasks: tasks.data }, { status: 200 });
}

/**
 * POST /api/tasks
 * Creates a task in a list. GSD assigns the id and inserts at the top of the
 * list; the 201 body is GSD's Task verbatim, so the client's optimistic row
 * is replaced by the authoritative entity.
 *
 * Validation here is shape-only (fast 400s before spending a GSD request);
 * GSD stays the authority on semantics and its 400s forward verbatim.
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAdminAuth(request);
  if (authResult.error) {
    return authResult.error;
  }

  const body = await readJsonObject(request);

  if (!body) {
    return apiError("INVALID_BODY", "Request body must be a JSON object.", 400);
  }

  const { list_id: listId, title, due_date: dueDate } = body;

  if (typeof listId !== "string" || !isUuid(listId)) {
    return apiError("INVALID_BODY", "list_id must be a list uuid.", 400);
  }

  if (typeof title !== "string" || !title.trim()) {
    return apiError("INVALID_TITLE", "title is required.", 400);
  }

  if (dueDate !== undefined && (typeof dueDate !== "string" || !isIsoDate(dueDate))) {
    return apiError("INVALID_BODY", 'due_date must be "YYYY-MM-DD".', 400);
  }

  const result = await createTask(listId, {
    title: title.trim(),
    ...(typeof dueDate === "string" ? { due_date: dueDate } : {}),
  });

  if (!result.ok) {
    return gsdFailure(result.error);
  }

  return NextResponse.json(result.data, { status: 201 });
}
