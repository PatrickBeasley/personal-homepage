const EMAIL = "beasley.patrick@gmail.com";

export default function ContactSection() {
  return (
    <section
      id="contact"
      className="pb-pad scroll-mt-20 border-t border-border px-[44px] py-14"
    >
      <div className="grid max-w-[960px] grid-cols-1 gap-10 md:grid-cols-[200px_1fr]">
        <div className="pt-1.5 font-mono text-xs uppercase tracking-[0.08em] text-muted">
          03 — Contact
        </div>
        <div className="max-w-[520px]">
          <h2 className="mb-[18px] font-heading text-[30px] font-semibold tracking-[-0.02em]">
            Say hello.
          </h2>
          <p className="text-base leading-[1.7] text-text-2">
            Email is the best way to reach me —{" "}
            <a href={`mailto:${EMAIL}`} className="font-medium text-accent hover:text-accent-2">
              {EMAIL}
            </a>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
