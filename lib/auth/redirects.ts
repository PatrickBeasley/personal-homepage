import type { NextRequest } from "next/server";

export function getRequestOrigin(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return request.nextUrl.origin;
}

export function normalizeNextPath(input: string | null, fallback = "/") {
  if (!input || !input.startsWith("/")) {
    return fallback;
  }

  // Validate by resolving against a fixed origin and confirming it stayed
  // there. Prefix checks are not enough: browsers normalise backslashes to
  // forward slashes, so "/\evil.com" resolves to "//evil.com" and lands on
  // another host while passing any startsWith("//") test.
  try {
    const probe = new URL(input, "https://validate.invalid");

    if (probe.origin !== "https://validate.invalid") {
      return fallback;
    }

    return `${probe.pathname}${probe.search}${probe.hash}`;
  } catch {
    return fallback;
  }
}
