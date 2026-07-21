const LEGAL_LINKS = ["Privacy Policy", "Terms of Use", "Cookie Notice"];

export default function SiteFooter() {
  return (
    <footer
      className="pb-pad border-t border-border bg-surface-2 px-[44px] pt-10"
      style={{ paddingBottom: "calc(40px + env(safe-area-inset-bottom))" }}
    >
      <div className="flex max-w-[960px] flex-wrap items-start justify-between gap-5">
        <div className="max-w-[520px]">
          <div className="mb-[10px] font-heading text-[15px] font-semibold">
            Patrick Beasley
          </div>
          <p className="text-xs leading-[1.7] text-muted">
            © {new Date().getFullYear()}{" "}
            Patrick Beasley. All rights reserved. The content on
            this site is provided for informational purposes only and is offered &ldquo;as
            is&rdquo; without warranty of any kind, express or implied. Views expressed are my
            own and do not represent those of any employer. External links are provided for
            convenience; I am not responsible for the content of third-party sites.
          </p>
        </div>
        <div className="flex flex-col gap-2 text-[13px]">
          {LEGAL_LINKS.map((label) => (
            // role="link" is what makes aria-disabled meaningful here: on a bare
            // <span> assistive tech ignores it. These stay non-navigating because
            // the Privacy/Terms/Cookie pages do not exist yet.
            <span
              key={label}
              role="link"
              aria-disabled="true"
              title="Placeholder page"
              className="cursor-default text-text-2"
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    </footer>
  );
}
