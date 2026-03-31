import type { Metadata } from "next";

import SiteNav from "@/components/site-nav";

export const metadata: Metadata = {
  title: "Projects",
  description: "Portfolio of web development projects including full-stack applications, open-source contributions, and side projects.",
};

const projects = [
  {
    title: "Personal Homepage",
    description: "A production-ready personal website built with Next.js 16, Supabase, and Tailwind CSS. Features admin dashboard, contact form, and file management.",
    tags: ["Next.js", "TypeScript", "Supabase", "Tailwind CSS", "Vercel"],
    link: "https://patrickbeasley.com",
    github: "https://github.com/PatrickBeasley/personal-homepage",
  },
  {
    title: "Project Template",
    description: "A Next.js + Supabase + Vercel template for rapid web application development. Includes authentication, database scaffolding, and deployment config.",
    tags: ["Next.js", "Supabase", "Template", "TypeScript"],
    github: "https://github.com/patchbeasley",
  },
  {
    title: "Open Source Contribution",
    description: "Contributed improvements to popular open-source projects including bug fixes and feature enhancements.",
    tags: ["Open Source", "Community"],
  },
];

export default function ProjectsPage() {
  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-black">
      <SiteNav currentPath="/projects" />

      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-16">
        <h1 className="text-4xl font-bold text-black dark:text-white mb-12">Projects</h1>

        <div className="space-y-8">
          {projects.map((project, idx) => (
            <div key={idx} className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6 hover:border-zinc-400 dark:hover:border-zinc-600 transition">
              <h2 className="text-2xl font-bold text-black dark:text-white mb-2">{project.title}</h2>
              <p className="text-zinc-700 dark:text-zinc-300 mb-4">{project.description}</p>

              {/* Tags */}
              <div className="flex flex-wrap gap-2 mb-4">
                {project.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-block px-3 py-1 text-xs font-medium rounded-full bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* Links */}
              <div className="flex gap-4">
                {project.link && (
                  <a
                    href={project.link}
                    className="text-sm font-medium text-black dark:text-white hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Visit →
                  </a>
                )}
                {project.github && (
                  <a
                    href={project.github}
                    className="text-sm font-medium text-black dark:text-white hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    GitHub →
                  </a>
                )}
              </div>
            </div>
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
