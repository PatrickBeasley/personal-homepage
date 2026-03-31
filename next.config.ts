import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
// Extract hostname for CSP connect-src (e.g. "abc123.supabase.co")
const supabaseHost = supabaseUrl ? new URL(supabaseUrl).hostname : "*.supabase.co";

const securityHeaders = [
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js App Router requires unsafe-inline for hydration scripts
      "script-src 'self' 'unsafe-inline'",
      // Tailwind and CSS-in-JS requires unsafe-inline for styles
      "style-src 'self' 'unsafe-inline'",
      // next/font self-hosts fonts; data: for inline fonts
      "font-src 'self' data:",
      // Supabase API calls + self
      `connect-src 'self' https://${supabaseHost} wss://${supabaseHost}`,
      // Allow images from self, data URIs, and blob (for file previews)
      "img-src 'self' data: blob:",
      // Prevent embedding in frames
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
