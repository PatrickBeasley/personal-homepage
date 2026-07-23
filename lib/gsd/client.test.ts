import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createTask,
  getAllTasks,
  getLists,
  isIsoDate,
  mapGsdFailure,
  toggleTask,
  type GsdTask,
} from "@/lib/gsd/client";

const KEY = "gsd_testkey_not_real";

/** Minimal valid Task for response payloads. */
const TASK: GsdTask = {
  id: "9b2f8c1e-0000-4000-8000-000000000001",
  title: "Buy milk",
  done: false,
  status: "todo",
  priority: "none",
  dueDate: null,
  dueTime: null,
  repeat: "none",
  notes: "",
  assigneeId: null,
  linkedListId: null,
  subtasks: [],
  attachments: [],
  position: 0,
  tags: [],
  createdAt: "2026-07-23T00:00:00Z",
  listId: "9b2f8c1e-0000-4000-8000-000000000002",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("gsd client", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv("GSD_API_KEY", KEY);
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends the bearer key and hits the lists endpoint", async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));

    const result = await getLists();

    expect(result).toEqual({ ok: true, data: [] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://project-gsd.com/api/v1/lists");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(init.body).toBeUndefined();
  });

  it("fetches all tasks in one call", async () => {
    fetchMock.mockResolvedValue(jsonResponse([TASK]));

    const result = await getAllTasks();

    expect(result.ok).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe("https://project-gsd.com/api/v1/tasks");
  });

  it("creates a task with a snake_case JSON body", async () => {
    fetchMock.mockResolvedValue(jsonResponse(TASK, 201));

    const result = await createTask(TASK.listId, { title: "Buy milk", due_date: "2026-07-24" });

    expect(result).toEqual({ ok: true, data: TASK });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://project-gsd.com/api/v1/lists/${TASK.listId}/tasks`);
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ title: "Buy milk", due_date: "2026-07-24" });
  });

  it("toggles a task with an empty POST", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...TASK, done: true, status: "done" }));

    const result = await toggleTask(TASK.id);

    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://project-gsd.com/api/v1/tasks/${TASK.id}/toggle`);
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
  });

  it("surfaces a GSD error body as a typed failure", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: "INVALID_TITLE", message: "Title is required." }, 400)
    );

    const result = await getLists();

    expect(result).toEqual({
      ok: false,
      error: { status: 400, code: "INVALID_TITLE", message: "Title is required." },
    });
  });

  it("handles a non-JSON error body without throwing", async () => {
    fetchMock.mockResolvedValue(new Response("Bad Gateway", { status: 502 }));

    const result = await getLists();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(502);
      expect(result.error.code).toBe("UPSTREAM_ERROR");
    }
  });

  it("handles a non-JSON success body as a failure, not a crash", async () => {
    fetchMock.mockResolvedValue(new Response("<html>login</html>", { status: 200 }));

    const result = await getLists();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(0);
    }
  });

  it("turns a network failure into a status-0 error", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    const result = await getAllTasks();

    expect(result).toEqual({
      ok: false,
      error: { status: 0, code: "NETWORK", message: "Could not reach Project-GSD." },
    });
  });

  it("fails fast when GSD_API_KEY is unset, without calling fetch", async () => {
    vi.stubEnv("GSD_API_KEY", "");

    const result = await getLists();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(-1);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never leaks the key into any error path", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: "RATE_LIMITED", message: "Slow down." }, 429)
    );

    const result = await getLists();

    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  describe("mapGsdFailure", () => {
    it("maps unset-key (-1) to a 500 SERVER_ERROR", () => {
      expect(mapGsdFailure({ status: -1, code: "NO_KEY", message: "x" })).toEqual({
        error: "SERVER_ERROR",
        message: "The task service is not configured.",
        status: 500,
      });
    });

    it("maps GSD 401 to 502 GSD_AUTH_FAILED (our config problem, not the caller's)", () => {
      expect(mapGsdFailure({ status: 401, code: "UNAUTHORIZED", message: "x" })).toEqual({
        error: "GSD_AUTH_FAILED",
        message: "Project-GSD rejected the API key.",
        status: 502,
      });
    });

    it("maps GSD 404 to our 404 NOT_FOUND", () => {
      expect(mapGsdFailure({ status: 404, code: "NOT_FOUND", message: "x" })).toEqual({
        error: "NOT_FOUND",
        message: "That task or list does not exist in Project-GSD.",
        status: 404,
      });
    });

    it("forwards GSD 429 with its message", () => {
      expect(mapGsdFailure({ status: 429, code: "RATE_LIMITED", message: "Slow down." })).toEqual({
        error: "RATE_LIMITED",
        message: "Slow down.",
        status: 429,
      });
    });

    it("forwards GSD 400 codes and messages verbatim", () => {
      expect(
        mapGsdFailure({ status: 400, code: "INVALID_DUE_DATE", message: "Bad date." })
      ).toEqual({ error: "INVALID_DUE_DATE", message: "Bad date.", status: 400 });
    });

    it("maps everything else (network, 5xx) to 502 GSD_UNAVAILABLE", () => {
      for (const status of [0, 500, 502, 503]) {
        expect(mapGsdFailure({ status, code: "X", message: "x" })).toEqual({
          error: "GSD_UNAVAILABLE",
          message: "Project-GSD is unreachable. Try again shortly.",
          status: 502,
        });
      }
    });
  });

  describe("isIsoDate", () => {
    it("accepts YYYY-MM-DD and rejects everything else", () => {
      expect(isIsoDate("2026-07-23")).toBe(true);
      expect(isIsoDate("2026-7-23")).toBe(false);
      expect(isIsoDate("23-07-2026")).toBe(false);
      expect(isIsoDate("2026-07-23T00:00:00Z")).toBe(false);
      expect(isIsoDate("")).toBe(false);
    });
  });
});
