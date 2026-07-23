/**
 * Server-only client for the Project-GSD API — the single place the
 * GSD_API_KEY is ever read. Nothing in this module may log, echo, or embed the
 * key in an error: every failure message below is static or comes verbatim
 * from GSD's response body.
 *
 * GSD wire conventions (see the API reference in the 2026-07-23 spec):
 * responses are camelCase, request bodies are snake_case, errors are
 * `{ error, message }`, unknown/foreign/archived ids answer 404.
 *
 * Calls never throw for API-level failures — they resolve to a GsdResult so
 * route handlers can map failures deliberately instead of catching.
 */

const BASE_URL = "https://project-gsd.com/api/v1";
const TIMEOUT_MS = 10_000;

export interface GsdList {
  id: string;
  name: string;
  color: string;
  remaining: number;
  taskTemplateId: string | null;
}

export interface GsdSubtask {
  id: string;
  title: string;
  done: boolean;
  notes: string;
}

export interface GsdAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
}

export interface GsdTask {
  id: string;
  title: string;
  done: boolean;
  status: "todo" | "doing" | "done";
  priority: "none" | "low" | "med" | "high";
  dueDate: string | null;
  dueTime: string | null;
  repeat: "none" | "daily" | "weekly" | "monthly";
  notes: string;
  assigneeId: string | null;
  linkedListId: string | null;
  subtasks: GsdSubtask[];
  attachments: GsdAttachment[];
  position: number;
  tags: string[];
  createdAt: string;
  listId: string;
}

/**
 * `status` is the upstream HTTP status, with two synthetic values:
 * `0` = never got a usable response (network failure, timeout, non-JSON 200);
 * `-1` = GSD_API_KEY is not configured (no request was attempted).
 */
export interface GsdError {
  status: number;
  code: string;
  message: string;
}

export type GsdResult<T> = { ok: true; data: T } | { ok: false; error: GsdError };

/** GSD dates are date-only strings; this is the shape gate before forwarding. */
export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Translates a GsdError into this repo's wire format. Kept pure (data in,
 * data out) so it is unit-testable without NextResponse; route handlers wrap
 * the result in NextResponse.json themselves.
 *
 * 401 becomes a 502, not a 401: the caller's dashboard session is fine — the
 * *server's* key is bad — and answering 401 would read as "log in again".
 */
export function mapGsdFailure(failure: GsdError): {
  error: string;
  message: string;
  status: number;
} {
  if (failure.status === -1) {
    return { error: "SERVER_ERROR", message: "The task service is not configured.", status: 500 };
  }

  if (failure.status === 401) {
    return { error: "GSD_AUTH_FAILED", message: "Project-GSD rejected the API key.", status: 502 };
  }

  if (failure.status === 404) {
    return {
      error: "NOT_FOUND",
      message: "That task or list does not exist in Project-GSD.",
      status: 404,
    };
  }

  if (failure.status === 429) {
    return { error: "RATE_LIMITED", message: failure.message, status: 429 };
  }

  // GSD 400s (INVALID_TITLE, INVALID_DUE_DATE, …) share our wire shape and the
  // remedy is the caller's, so code and message forward verbatim.
  if (failure.status === 400) {
    return { error: failure.code, message: failure.message, status: 400 };
  }

  return {
    error: "GSD_UNAVAILABLE",
    message: "Project-GSD is unreachable. Try again shortly.",
    status: 502,
  };
}

async function gsdFetch<T>(
  path: string,
  init?: { method?: "GET" | "POST"; body?: Record<string, unknown> }
): Promise<GsdResult<T>> {
  const key = process.env.GSD_API_KEY;

  if (!key) {
    return {
      ok: false,
      error: { status: -1, code: "NO_KEY", message: "GSD_API_KEY is not set." },
    };
  }

  const headers: Record<string, string> = { Authorization: `Bearer ${key}` };

  if (init?.body) {
    headers["Content-Type"] = "application/json";
  }

  let response: Response;

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: init?.method ?? "GET",
      headers,
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    // Timeout aborts and DNS/connection failures both land here. The cause is
    // deliberately not included: fetch errors can embed the request URL, and
    // nothing upstream-shaped is trustworthy enough to surface.
    return {
      ok: false,
      error: { status: 0, code: "NETWORK", message: "Could not reach Project-GSD." },
    };
  }

  let payload: unknown = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const { error, message } = (payload ?? {}) as { error?: unknown; message?: unknown };

    return {
      ok: false,
      error: {
        status: response.status,
        code: typeof error === "string" && error ? error : "UPSTREAM_ERROR",
        message:
          typeof message === "string" && message
            ? message
            : `Project-GSD responded ${response.status}.`,
      },
    };
  }

  if (payload === null) {
    return {
      ok: false,
      error: { status: 0, code: "BAD_RESPONSE", message: "Project-GSD returned a non-JSON response." },
    };
  }

  return { ok: true, data: payload as T };
}

/** Active lists in display order. */
export function getLists(): Promise<GsdResult<GsdList[]>> {
  return gsdFetch<GsdList[]>("/lists");
}

/** Every active task across all lists — list order, then task order. */
export function getAllTasks(): Promise<GsdResult<GsdTask[]>> {
  return gsdFetch<GsdTask[]>("/tasks");
}

/** Creates a task; GSD inserts it at the top of the list and assigns the uuid. */
export function createTask(
  listId: string,
  input: { title: string; due_date?: string }
): Promise<GsdResult<GsdTask>> {
  return gsdFetch<GsdTask>(`/lists/${listId}/tasks`, { method: "POST", body: input });
}

/**
 * Completes/uncompletes a task. Repeating tasks advance their due date
 * instead and stay open — callers must apply the returned Task rather than
 * assuming the toggle flipped `done`.
 */
export function toggleTask(id: string): Promise<GsdResult<GsdTask>> {
  return gsdFetch<GsdTask>(`/tasks/${id}/toggle`, { method: "POST" });
}
