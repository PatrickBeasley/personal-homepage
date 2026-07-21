import { describe, expect, it } from "vitest";

import { normalizeNextPath } from "./redirects";

describe("normalizeNextPath", () => {
  it("passes through a plain in-app path", () => {
    expect(normalizeNextPath("/dashboard")).toBe("/dashboard");
  });

  it("preserves query and hash on a nested path", () => {
    expect(normalizeNextPath("/dashboard/notes?a=1#b")).toBe("/dashboard/notes?a=1#b");
  });

  it("falls back for null", () => {
    expect(normalizeNextPath(null, "/fallback")).toBe("/fallback");
  });

  it("falls back for a protocol-relative path", () => {
    expect(normalizeNextPath("//evil.com", "/fallback")).toBe("/fallback");
  });

  // The open-redirect regression: browsers normalise a leading backslash to a
  // forward slash when resolving a URL, so "/\evil.com" behaves exactly like
  // "//evil.com" and lands on another host. A prefix check alone misses this.
  it("falls back for a backslash-prefixed host", () => {
    expect(normalizeNextPath("/\\evil.com", "/fallback")).toBe("/fallback");
  });

  it("falls back for an absolute URL", () => {
    expect(normalizeNextPath("https://evil.com", "/fallback")).toBe("/fallback");
  });

  it("falls back for a bare hostname with no leading slash", () => {
    expect(normalizeNextPath("evil.com", "/fallback")).toBe("/fallback");
  });
});
