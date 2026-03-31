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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdminAuth(request);
  if (authResult.error) {
    return authResult.error;
  }

  const { supabase } = authResult;
  const { id } = await params;

  try {
    const body = await request.json();
    const updates: {
      title?: string;
      slug?: string;
      excerpt?: string | null;
      content_md?: string;
      is_published?: boolean;
      published_at?: string | null;
      updated_at: string;
    } = {
      updated_at: new Date().toISOString(),
    };

    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (!title) {
        return NextResponse.json(
          { error: "Title cannot be empty" },
          { status: 400 }
        );
      }

      updates.title = title;
    }

    if (body.slug !== undefined) {
      const slug = normalizeSlug(String(body.slug));
      if (!slug) {
        return NextResponse.json(
          { error: "A valid slug is required" },
          { status: 400 }
        );
      }

      updates.slug = slug;
    }

    if (body.excerpt !== undefined) {
      updates.excerpt = body.excerpt ? String(body.excerpt).trim() : null;
    }

    if (body.content_md !== undefined) {
      const contentMd = String(body.content_md).trim();
      if (!contentMd) {
        return NextResponse.json(
          { error: "Content cannot be empty" },
          { status: 400 }
        );
      }

      updates.content_md = contentMd;
    }

    if (body.is_published !== undefined) {
      updates.is_published = Boolean(body.is_published);

      if (updates.is_published) {
        updates.published_at = body.published_at
          ? String(body.published_at)
          : new Date().toISOString();
      } else {
        updates.published_at = null;
      }
    }

    const { data, error } = await supabase
      .from("blog_posts")
      .update(updates)
      .eq("id", id)
      .select("id, slug, title, excerpt, content_md, is_published, published_at, created_at, updated_at")
      .single();

    if (error) {
      console.error("Failed to update blog post:", error);
      return NextResponse.json(
        { error: "Failed to update blog post" },
        { status: 500 }
      );
    }

    return NextResponse.json({ post: data });
  } catch (error) {
    console.error("Blog post update error:", error);
    return NextResponse.json(
      { error: "Invalid request payload" },
      { status: 400 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdminAuth(request);
  if (authResult.error) {
    return authResult.error;
  }

  const { supabase } = authResult;
  const { id } = await params;

  const { error } = await supabase
    .from("blog_posts")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Failed to delete blog post:", error);
    return NextResponse.json(
      { error: "Failed to delete blog post" },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: "Blog post deleted" });
}