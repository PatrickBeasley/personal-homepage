import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Resume | Patrick Beasley",
  description: "Full-stack engineer with expertise in Next.js, cloud infrastructure, and database design.",
};

export default function ResumePage() {
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
            <li><Link href="/resume" className="text-black dark:text-white font-semibold">Resume</Link></li>
            <li><Link href="/projects" className="text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white">Projects</Link></li>
            <li><Link href="/blog" className="text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white">Blog</Link></li>
            <li><Link href="/#contact" className="text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white">Contact</Link></li>
          </ul>
        </div>
      </nav>

      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-16">
        <h1 className="text-4xl font-bold text-black dark:text-white mb-12">Resume</h1>

        {/* Summary */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-black dark:text-white mb-4">Summary</h2>
          <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">
            Full-stack engineer with 7+ years of experience building scalable web applications.
            Expertise in Next.js, TypeScript, Supabase, cloud infrastructure (Vercel, AWS), and modern DevOps practices.
            Passionate about clean code, system design, and mentoring junior developers.
          </p>
        </section>

        {/* Experience */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-black dark:text-white mb-6">Experience</h2>
          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-semibold text-black dark:text-white">Senior Full-Stack Engineer</h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">TechCorp | 2022 – Present</p>
              <ul className="mt-2 list-disc list-inside text-zinc-700 dark:text-zinc-300 space-y-1">
                <li>Led design and implementation of microservices architecture serving 100k+ users</li>
                <li>Improved API performance by 40% through caching and query optimization</li>
                <li>Mentored 3 junior engineers on full-stack development best practices</li>
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-black dark:text-white">Full-Stack Developer</h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Web Solutions Inc | 2019 – 2022</p>
              <ul className="mt-2 list-disc list-inside text-zinc-700 dark:text-zinc-300 space-y-1">
                <li>Built and maintained 15+ client-facing applications using React and Node.js</li>
                <li>Implemented PostgreSQL schemas and optimized database queries</li>
                <li>Deployed and maintained infrastructure on AWS EC2 and RDS</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Skills */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-black dark:text-white mb-6">Skills</h2>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-black dark:text-white mb-3">Frontend</h3>
              <p className="text-zinc-700 dark:text-zinc-300">React, Next.js, TypeScript, Tailwind CSS, Framer Motion</p>
            </div>
            <div>
              <h3 className="font-semibold text-black dark:text-white mb-3">Backend</h3>
              <p className="text-zinc-700 dark:text-zinc-300">Node.js, TypeScript, PostgreSQL, API Design</p>
            </div>
            <div>
              <h3 className="font-semibold text-black dark:text-white mb-3">DevOps & Cloud</h3>
              <p className="text-zinc-700 dark:text-zinc-300">Vercel, AWS, Docker, CI/CD, GitHub Actions</p>
            </div>
            <div>
              <h3 className="font-semibold text-black dark:text-white mb-3">Tools & Practices</h3>
              <p className="text-zinc-700 dark:text-zinc-300">Git, ESLint, Testing, System Design, Agile</p>
            </div>
          </div>
        </section>

        {/* Education */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-black dark:text-white mb-6">Education</h2>
          <div>
            <h3 className="text-lg font-semibold text-black dark:text-white">Bachelor of Science in Computer Science</h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">University of Technology | 2019</p>
          </div>
        </section>

        <div className="mt-16 pt-6 border-t border-zinc-200 dark:border-zinc-800">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Looking for a PDF? <a href="#" className="text-black dark:text-white hover:underline font-medium">Download resume</a>
          </p>
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
