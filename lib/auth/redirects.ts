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
  if (!input) {
    return fallback;
  }

  // Only allow relative in-app paths to avoid open redirect issues.
  if (!input.startsWith("/") || input.startsWith("//")) {
    return fallback;
  }

  return input;
}
