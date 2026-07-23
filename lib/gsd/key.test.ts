import { beforeEach, describe, expect, it, vi } from "vitest";

const maybeSingle = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    from: vi.fn(() => ({ select: vi.fn(() => ({ maybeSingle })) })),
  })),
}));

import { resolveGsdKey } from "@/lib/gsd/key";

describe("resolveGsdKey", () => {
  beforeEach(() => {
    maybeSingle.mockReset();
  });

  it("returns the key when the row exists", async () => {
    maybeSingle.mockResolvedValue({ data: { api_key: "gsd_abc123" }, error: null });

    expect(await resolveGsdKey()).toBe("gsd_abc123");
  });

  it("returns null when no row exists", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });

    expect(await resolveGsdKey()).toBeNull();
  });

  it("returns null on a query error rather than throwing", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    maybeSingle.mockResolvedValue({ data: null, error: { message: "boom" } });

    expect(await resolveGsdKey()).toBeNull();
    errorSpy.mockRestore();
  });
});
