import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Only routes that need a session. The landing page is prerendered and
  // edge-cached (verified: X-Nextjs-Prerender: 1, X-Vercel-Cache: HIT), so
  // sending it through middleware bought nothing and cost a hop on every
  // request that carried an auth cookie.
  matcher: ["/dashboard/:path*", "/login", "/auth/:path*"],
};