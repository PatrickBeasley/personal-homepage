import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCachedJwks } from "@/lib/auth/jwks";

import { verifyClaims } from "./claims";

vi.mock("@/lib/env", () => ({
  getSupabasePublicEnv: () => ({
    url: "https://example.supabase.co",
    anonKey: "anon",
  }),
}));

vi.mock("@/lib/auth/jwks", () => ({
  getCachedJwks: vi.fn(),
}));

const mockedGetCachedJwks = vi.mocked(getCachedJwks);

function clientReturning(result: unknown) {
  const getClaims = vi.fn().mockResolvedValue(result);
  return { client: { auth: { getClaims } }, getClaims };
}

describe("verifyClaims", () => {
  beforeEach(() => {
    mockedGetCachedJwks.mockResolvedValue({ keys: [{ kid: "abc" }] } as never);
  });

  it("returns id and email from verified claims", async () => {
    const { client } = clientReturning({
      data: { claims: { sub: "user-1", email: "Admin@Example.com" } },
      error: null,
    });

    expect(await verifyClaims(client as never)).toEqual({
      id: "user-1",
      email: "Admin@Example.com",
    });
  });

  it("passes the cached key set so verification stays local", async () => {
    const { client, getClaims } = clientReturning({
      data: { claims: { sub: "user-1", email: "a@b.c" } },
      error: null,
    });

    await verifyClaims(client as never);

    expect(getClaims).toHaveBeenCalledWith(undefined, {
      jwks: { keys: [{ kid: "abc" }] },
    });
  });

  it("omits the options argument entirely when there is no cached key set", async () => {
    mockedGetCachedJwks.mockResolvedValue(null);

    const { client, getClaims } = clientReturning({
      data: { claims: { sub: "user-1", email: "a@b.c" } },
      error: null,
    });

    await verifyClaims(client as never);

    expect(getClaims).toHaveBeenCalledWith(undefined, undefined);
  });

  it("returns null when verification errors", async () => {
    const { client } = clientReturning({
      data: null,
      error: new Error("bad signature"),
    });

    expect(await verifyClaims(client as never)).toBeNull();
  });

  // The third arm of the union: no session, and no error either.
  it("returns null when there is no session at all", async () => {
    const { client } = clientReturning({ data: null, error: null });

    expect(await verifyClaims(client as never)).toBeNull();
  });

  it("returns null when the token carries no subject", async () => {
    const { client } = clientReturning({
      data: { claims: { email: "a@b.c" } },
      error: null,
    });

    expect(await verifyClaims(client as never)).toBeNull();
  });

  it("tolerates a missing email claim", async () => {
    const { client } = clientReturning({
      data: { claims: { sub: "user-1" } },
      error: null,
    });

    expect(await verifyClaims(client as never)).toEqual({
      id: "user-1",
      email: null,
    });
  });
});
