import Link from "next/link";

import SiteNav from "@/components/site-nav";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-black">
      <SiteNav currentPath="/" />

      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-16">
        {/* Hero Section */}
        <section className="mb-24">
          <h1 className="text-5xl font-bold text-black dark:text-white mb-6">
            Hi, I&rsquo;m Patrick.
          </h1>
          <p className="text-xl text-zinc-600 dark:text-zinc-400 mb-8 max-w-2xl">
            Full-stack engineer focused on building clean, performant web applications.
            Currently exploring Next.js, cloud infrastructure, and developer experience.
          </p>
          <div className="flex gap-4">
            <a
              href="#contact"
              className="inline-block px-6 py-3 bg-black dark:bg-white text-white dark:text-black rounded-lg font-medium hover:opacity-90 transition"
            >
              Get in touch
            </a>
            <Link
              href="/resume"
              className="inline-block px-6 py-3 border border-zinc-300 dark:border-zinc-700 text-black dark:text-white rounded-lg font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900 transition"
            >
              View resume
            </Link>
          </div>
        </section>

        {/* About Section */}
        <section id="about" className="mb-24">
          <h2 className="text-3xl font-bold text-black dark:text-white mb-6">About</h2>
          <div className="prose dark:prose-invert max-w-none">
            <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed mb-4">
              I build web applications with a focus on user experience and code quality.
              My background spans full-stack development, cloud infrastructure, and DevOps.
            </p>
            <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">
              When not coding, I&rsquo;m interested in system design, performance optimization, and open-source contributions.
            </p>
          </div>
        </section>

        {/* Featured Projects Teaser */}
        <section className="mb-24">
          <h2 className="text-3xl font-bold text-black dark:text-white mb-6">
            Recent Projects
          </h2>
          <p className="text-zinc-600 dark:text-zinc-400 mb-8">
            View my <Link href="/projects" className="font-medium text-black dark:text-white hover:underline">full project list</Link> for more.
          </p>
        </section>

        {/* Contact Section */}
        <section id="contact" className="mb-24">
          <h2 className="text-3xl font-bold text-black dark:text-white mb-6">Contact</h2>
          <p className="text-zinc-600 dark:text-zinc-400 mb-8 max-w-2xl">
            Have a project in mind or want to collaborate? Send me a message and I&rsquo;ll get back to you as soon as possible.
          </p>
          <Link
            href="#"
            className="inline-block px-6 py-3 bg-black dark:bg-white text-white dark:text-black rounded-lg font-medium hover:opacity-90 transition"
          >
            Contact form
          </Link>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800 mt-16 py-8 bg-zinc-50 dark:bg-zinc-900/50">
        <div className="max-w-4xl mx-auto px-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
          <p>© {new Date().getFullYear()} Patrick Beasley. All rights reserved.</p>
          <div className="mt-4 flex gap-6 justify-center">
            <Link href="/privacy" className="hover:text-black dark:hover:text-white">Privacy Policy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
