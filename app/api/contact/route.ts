import { NextRequest, NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * POST /api/contact
 * Public endpoint for contact form submissions.
 * Implements rate limiting to prevent spam.
 */

// Simple in-memory rate limit store (in production, use Redis or similar)
const rateLimitStore = new Map<string, number[]>();

function isRateLimited(clientId: string): boolean {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute window
  const maxRequests = 3; // 3 requests per window

  const timestamps = rateLimitStore.get(clientId) || [];
  const recentRequests = timestamps.filter((t) => now - t < windowMs);

  if (recentRequests.length >= maxRequests) {
    return true;
  }

  recentRequests.push(now);
  rateLimitStore.set(clientId, recentRequests);

  return false;
}

export async function POST(request: NextRequest) {
  try {
    // Get client IP for rate limiting
    const clientIp =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";

    // Check rate limit
    if (isRateLimited(clientIp)) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { name, email, subject, message } = body;

    // Validate required fields
    if (!name || !email || !message) {
      return NextResponse.json(
        { error: "Missing required fields: name, email, message" },
        { status: 400 }
      );
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    // Sanitize inputs (basic protection from XSS)
    const sanitize = (str: string) =>
      str.replace(/[<>]/g, "").trim().substring(0, 5000);

    const sanitized = {
      name: sanitize(name),
      email: sanitize(email),
      subject: subject ? sanitize(subject) : null,
      message: sanitize(message),
    };

    // Insert into Supabase — RLS "anyone can submit contact form" policy allows this
    const supabase = await createServerSupabaseClient();
    const { error: dbError } = await supabase
      .from("contact_submissions")
      .insert(sanitized);

    if (dbError) {
      console.error("Contact submission DB error:", dbError.message);
      return NextResponse.json(
        { error: "Failed to submit. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: "Thank you for your message. We'll review it shortly." },
      { status: 201 }
    );
  } catch (error) {
    console.error("Contact form error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
