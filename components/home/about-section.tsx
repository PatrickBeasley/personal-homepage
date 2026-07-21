const STACK = ["TypeScript", "React", "Node", "PostgreSQL", "Go", "Docker"];

export default function AboutSection() {
  return (
    <section id="about" className="pb-pad scroll-mt-20 px-[44px] pt-[72px] pb-14">
      <div className="grid max-w-[960px] grid-cols-1 gap-10 md:grid-cols-[200px_1fr]">
        <div className="pt-1.5 font-mono text-xs uppercase tracking-[0.08em] text-muted">
          01 — About
        </div>
        <div>
          {/*
            Sanctioned deviation from design/patrick-beasley.dc.html, which uses
            <h2> here: the page needs exactly one <h1> for SEO/a11y. The visual
            styling is unchanged — only the tag differs.
          */}
          <h1 className="mb-[18px] font-heading text-[30px] font-semibold tracking-[-0.02em]">
            Hiya
          </h1>
          <p className="mb-6 max-w-[620px] text-base leading-[1.7] text-text-2" style={{ textWrap: "pretty" }}>
            Professional programmer, amateur chef
          </p>
          <div className="flex flex-wrap gap-2">
            {STACK.map((tag) => (
              <span
                key={tag}
                className="rounded-lg border border-border bg-surface-2 px-3 py-[6px] font-mono text-xs text-text-2"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
