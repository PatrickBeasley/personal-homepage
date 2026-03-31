import { NextRequest, NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/auth/admin-guard";

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function GET(_request: NextRequest) {
  const authResult = await requireAdminAuth(_request);
  if (authResult.error) {
    return authResult.error;
  }

  const { supabase } = authResult;
  const { data, error } = await supabase
    .from("blog_posts")
    .select("id, slug, title, excerpt, content_md, is_published, published_at, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch blog posts:", error);
    return NextResponse.json(
      { error: "Failed to load blog posts" },
      { status: 500 }
    );
  }

  return NextResponse.json({ posts: data ?? [] });
}

export async function POST(request: NextRequest) {
  const authResult = await requireAdminAuth(request);
  if (authResult.error) {
    return authResult.error;
  }

  const { supabase } = authResult;

  try {
    const body = await request.json();

    const title = String(body.title ?? "").trim();
    const inputSlug = String(body.slug ?? "").trim();
    const contentMd = String(body.content_md ?? "").trim();
    const excerpt = body.excerpt ? String(body.excerpt).trim() : null;
    const isPublished = Boolean(body.is_published);
    const publishedAt = isPublished
      ? body.published_at
        ? String(body.published_at)
        : new Date().toISOString()
      : null;

    if (!title || !contentMd) {
      return NextResponse.json(
        { error: "Title and content are required" },
        { status: 400 }
      );
    }

    const slug = normalizeSlug(inputSlug || title);
    if (!slug) {
      return NextResponse.json(
        { error: "A valid slug is required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("blog_posts")
      .insert({
        title,
        slug,
        excerpt,
        content_md: contentMd,
        is_published: isPublished,
        published_at: publishedAt,
      })
      .select("id, slug, title, excerpt, content_md, is_published, published_at, created_at, updated_at")
      .single();

    if (error) {
      console.error("Failed to create blog post:", error);
      return NextResponse.json(
        { error: "Failed to create blog post" },
        { status: 500 }
      );
    }

    return NextResponse.json({ post: data }, { status: 201 });
  } catch (error) {
    console.error("Blog post creation error:", error);
    return NextResponse.json(
      { error: "Invalid request payload" },
      { status: 400 }
    );
  }
}