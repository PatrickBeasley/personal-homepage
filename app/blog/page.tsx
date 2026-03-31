import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog",
  description: "Articles about web development, full-stack engineering, system design, and cloud infrastructure.",
};

const posts = [
  {
    slug: "next-js-16-upgrade",
    title: "Upgrading to Next.js 16: What Changed and Why It Matters",
    excerpt: "A comprehensive guide to the new features and breaking changes in Next.js 16, including the App Router improvements and async components.",
    date: "2026-03-15",
    readTime: "8 min read",
  },
  {
    slug: "supabase-auth-patterns",
    title: "Supabase Authentication Patterns: Session Management and OAuth",
    excerpt: "Explore best practices for implementing secure authentication flows with Supabase, including OAuth provider setup and session refresh patterns.",
    date: "2026-03-01",
    readTime: "10 min read",
  },
  {
    slug: "vercel-deployment-best-practices",
    title: "Vercel Deployment Best Practices for Production Applications",
    excerpt: "Tips and tricks for optimizing your Vercel deployments, including environment management, preview URLs, and production readiness checklists.",
    date: "2026-02-15",
    readTime: "7 min read",
  },
];

export default function BlogPage() {
  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-black">
      {/* Navigation */}
      <nav className="border-b border-zinc-200 dark:border-zinc-800 sticky top-0 bg-white/95 dark:bg-black/95 backdrop-blur">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-lg font-semibold text-black dark:text-white">
            Patrick Beasley
          </Link>
          <ul className="flex gap-8 text-sm font-medium">
            <li><Link href="/#about" className="text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white">About</Link></li>
            <li><Link href="/resume" className="text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white">Resume</Link></li>
            <li><Link href="/projects" className="text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white">Projects</Link></li>
            <li><Link href="/blog" className="text-black dark:text-white font-semibold">Blog</Link></li>
            <li><Link href="/#contact" className="text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white">Contact</Link></li>
          </ul>
        </div>
      </nav>

      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-16">
        <h1 className="text-4xl font-bold text-black dark:text-white mb-12">Blog</h1>

        <div className="space-y-8">
          {posts.map((post) => (
            <article
              key={post.slug}
              className="border-b border-zinc-200 dark:border-zinc-800 pb-8 last:border-b-0"
            >
              <Link href={`/blog/${post.slug}`} className="group">
                <h2 className="text-2xl font-bold text-black dark:text-white mb-2 group-hover:text-zinc-600 dark:group-hover:text-zinc-400 transition">
                  {post.title}
                </h2>
              </Link>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-3">
                <time dateTime={post.date}>
                  {new Date(post.date).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </time>
                {" "} • {post.readTime}
              </p>
              <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">
                {post.excerpt}
              </p>
              <Link
                href={`/blog/${post.slug}`}
                className="inline-block mt-4 text-sm font-medium text-black dark:text-white hover:underline"
              >
                Read more →
              </Link>
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
