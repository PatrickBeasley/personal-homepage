import Link from "next/link";
import type { Metadata } from "next";

import SiteNav from "@/components/site-nav";
import { getUserContext } from "@/lib/auth/user-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Blog",
  description: "Articles about web development, full-stack engineering, system design, and cloud infrastructure.",
};

interface BlogPostSummary {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  published_at: string | null;
  created_at: string;
}

export default async function BlogPage() {
  const { isAdmin } = await getUserContext();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("blog_posts")
    .select("id, slug, title, excerpt, published_at, created_at")
    .eq("is_published", true)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load published blog posts:", error);
  }

  const posts: BlogPostSummary[] = data ?? [];

  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-black">
      <SiteNav currentPath="/blog" />

      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-16">
        <h1 className="text-4xl font-bold text-black dark:text-white mb-12">Blog</h1>

        {isAdmin && (
          <div className="mb-8 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
            You are signed in as admin. <Link href="/admin" className="underline font-medium">Manage posts and drafts</Link>.
          </div>
        )}

        <div className="space-y-8">
          {posts.length === 0 && (
            <p className="text-zinc-600 dark:text-zinc-400">No published posts yet.</p>
          )}

          {posts.map((post) => (
            <article
              key={post.id}
              className="border-b border-zinc-200 dark:border-zinc-800 pb-8 last:border-b-0"
            >
              <h2 className="text-2xl font-bold text-black dark:text-white mb-2">{post.title}</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-3">
                <time dateTime={post.published_at ?? post.created_at}>
                  {new Date(post.published_at ?? post.created_at).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </time>
              </p>
              <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">
                {post.excerpt ?? "No excerpt provided."}
              </p>
            </article>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800 mt-16 py-8 bg-zinc-50 dark:bg-zinc-900/50">
        <div className="max-w-4xl mx-auto px-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
          <p>© {new Date().getFullYear()} Patrick Beasley. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
