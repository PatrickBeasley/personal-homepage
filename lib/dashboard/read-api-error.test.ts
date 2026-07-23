import { describe, expect, it } from "vitest";

import { readApiError } from "@/lib/dashboard/read-api-error";

function response(body: string, status = 400) {
  return new Response(body, { status });
}

describe("readApiError", () => {
  it("prefers message over error code", async () => {
    const result = await readApiError(
      response(JSON.stringify({ error: "INVALID_TITLE", message: "Title is required." })),
      "fallback"
    );

    expect(result).toBe("Title is required.");
  });

  it("falls back to the error code when message is absent (requireAdminAuth shape)", async () => {
    const result = await readApiError(response(JSON.stringify({ error: "UNAUTHENTICATED" })), "fallback");

    expect(result).toBe("UNAUTHENTICATED");
  });

  it("falls back for non-JSON bodies", async () => {
    expect(await readApiError(response("<html>"), "fallback")).toBe("fallback");
  });

  it("falls back for empty-string message and error", async () => {
    expect(await readApiError(response(JSON.stringify({ error: "", message: "" })), "fallback")).toBe(
      "fallback"
    );
  });
});
