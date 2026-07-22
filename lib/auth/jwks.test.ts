import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetJwksCacheForTests, getCachedJwks } from "./jwks";

const URL_BASE = "https://example.supabase.co";
const KEY = { kid: "abc", kty: "EC", alg: "ES256", key_ops: ["verify"] };

function mockFetchOnce(body: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    json: async () => body,
  });
}

describe("getCachedJwks", () => {
  beforeEach(() => {
    __resetJwksCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches the key set on a cold cache", async () => {
    const fetchMock = mockFetchOnce({ keys: [KEY] });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getCachedJwks(URL_BASE, 0);

    expect(result).toEqual({ keys: [KEY] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `${URL_BASE}/auth/v1/.well-known/jwks.json`
    );
  });

  // The whole point of the module: a second request must not hit the network.
  it("serves a warm cache without fetching again", async () => {
    const fetchMock = mockFetchOnce({ keys: [KEY] });
    vi.stubGlobal("fetch", fetchMock);

    await getCachedJwks(URL_BASE, 0);
    const result = await getCachedJwks(URL_BASE, 60_000);

    expect(result).toEqual({ keys: [KEY] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refetches once the ten minute TTL has elapsed", async () => {
    const fetchMock = mockFetchOnce({ keys: [KEY] });
    vi.stubGlobal("fetch", fetchMock);

    await getCachedJwks(URL_BASE, 0);
    await getCachedJwks(URL_BASE, 10 * 60 * 1000 + 1);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // Degrading to a stale key beats logging every device out because one
  // JWKS fetch failed.
  it("serves the stale key set when a refetch fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ keys: [KEY] }) })
      .mockRejectedValueOnce(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    await getCachedJwks(URL_BASE, 0);
    const result = await getCachedJwks(URL_BASE, 10 * 60 * 1000 + 1);

    expect(result).toEqual({ keys: [KEY] });
  });

  // Returning null lets getClaims fall back to its own fetch, and ultimately
  // to getUser(). Slow and correct beats fast and unauthenticated.
  it("returns null on a cold cache when the fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("nope")));

    expect(await getCachedJwks(URL_BASE, 0)).toBeNull();
  });

  it("returns null when the endpoint answers with an empty key set", async () => {
    vi.stubGlobal("fetch", mockFetchOnce({ keys: [] }));

    expect(await getCachedJwks(URL_BASE, 0)).toBeNull();
  });

  it("returns null on a non-ok response", async () => {
    vi.stubGlobal("fetch", mockFetchOnce({ keys: [KEY] }, false));

    expect(await getCachedJwks(URL_BASE, 0)).toBeNull();
  });
});
