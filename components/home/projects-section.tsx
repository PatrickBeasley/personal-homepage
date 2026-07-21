type Project = {
  name: string;
  description: string;
  url: string;
  host: string;
};

const PROJECTS: Project[] = [
  {
    name: "Get Stuff Done",
    description:
      "A focused task manager for people who just want to get things done.",
    url: "https://www.project-gsd.com",
    host: "project-gsd.com",
  },
  {
    name: "Pokémon Database",
    description: "A fast, searchable database of Pokémon GO data and stats.",
    url: "https://pogo-db.com/",
    host: "pogo-db.com",
  },
];

export default function ProjectsSection() {
  return (
    <section
      id="projects"
      className="pb-pad scroll-mt-20 border-t border-border px-[44px] py-14"
    >
      <div className="grid max-w-[960px] grid-cols-1 gap-10 md:grid-cols-[200px_1fr]">
        <div className="pt-1.5 font-mono text-xs uppercase tracking-[0.08em] text-muted">
          02 — Projects
        </div>
        <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2">
          {PROJECTS.map((project) => (
            <a
              key={project.url}
              href={project.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-2xl border border-border bg-surface p-6 text-text shadow transition duration-200 hover:-translate-y-[3px] hover:border-accent hover:text-text"
            >
              <div className="mb-[10px] flex items-center justify-between gap-3">
                <h3 className="font-heading text-[19px] font-semibold text-text">
                  {project.name}
                </h3>
                <span className="text-lg text-muted">↗</span>
              </div>
              <p className="mb-3 text-sm leading-[1.6] text-text-2">
                {project.description}
              </p>
              <span className="font-mono text-xs text-muted">{project.host}</span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
