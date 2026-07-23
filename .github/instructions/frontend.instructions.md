---
applyTo: "app/**,components/**,styles/**"
---

# Frontend Instructions — personal-homepage

## UX Principles
- Keep interactions fast and predictable. Avoid unnecessary loading states or spinners for instant operations.
- Provide clear feedback for all user actions: success, error, and in-progress states.
- Forms must show inline validation errors near the relevant field, not only at the top.
- Admin UI should be visually distinct from the public site to avoid confusion.

## Accessibility Baseline
- All interactive elements must be keyboard-accessible (focus rings, tab order, Enter/Space activation).
- Use semantic HTML: `<nav>`, `<main>`, `<article>`, `<section>`, `<button>`, `<a>` as appropriate.
- Images must have descriptive `alt` text. Decorative images use `alt=""`.
- Color contrast must meet WCAG AA minimum (4.5:1 for normal text, 3:1 for large text).
- Do not rely on color alone to convey meaning.

## Performance Baseline
- Use `next/image` for all images — do not use raw `<img>` tags.
- Avoid layout shift (CLS): set explicit width/height or aspect-ratio on image and media elements.
- Prefer server components. Only use `"use client"` when interactivity or browser APIs are required.
- Lazy-load below-the-fold content where appropriate.
- Do not import large libraries client-side when a lighter alternative exists.

## State and Data Fetching
- Fetch data in server components via Supabase server client — do not fetch in client components unless real-time or user-specific.
- Use React Server Actions for form submissions where possible.
- Keep client state minimal. Avoid global state stores unless clearly necessary.
- A dynamic page (per-request server fetch) needs a `loading.tsx` in its route segment. Without it, the App Router can't prefetch the page and client-side navigation blocks on the fetch with no pending UI (the leaving page freezes). `app/dashboard/loading.tsx` covers the dashboard; a slow *external* fetch (e.g. Tasks → Project-GSD) should additionally stream behind its own `<Suspense>` so the navigation itself is instant. This is the *right* kind of loading state — the "avoid unnecessary spinners" rule under UX Principles is about instant operations, not per-request navigations.

## Styling and Theming
- Use Tailwind CSS utility classes. Do not write custom CSS unless Tailwind cannot achieve the result.
- Follow the established color palette and spacing scale — do not introduce one-off values.
- Dark mode support is desirable but not required at launch. Use Tailwind's `dark:` variant if added.
- Keep component files focused: one component per file, co-located styles if needed.

## Next.js Metadata Rules
- When a root layout defines `metadata.title.template` (e.g., `"%s | Patrick Beasley"`), page-level `export const metadata` titles must contain only the bare page name (e.g., `"Resume"` not `"Resume | Patrick Beasley"`). The template appends the suffix automatically — duplicating it in the page title causes "Resume | Patrick Beasley | Patrick Beasley" in the browser tab.
- Always verify rendered `<title>` during Playwright smoke tests.

## Script and Module File Rules
- `.mjs` files are plain JavaScript ES modules — they do NOT support TypeScript syntax (no `: Type` annotations, no interface/type declarations).
- If type safety is needed in a script, rename it to `.ts` and run with `ts-node` or compile first.
- Use JSDoc `@param` and `@returns` comments for type hints in `.mjs` files.
- Run scripts with `node script.mjs`, not `npx ts-node script.mjs`.

## Playwright Validation
- After creating or modifying any page, navigate to it in Playwright and verify: correct `page.title()`, no console errors, page content renders, navigation links work.
- Check for duplicate page titles (see Metadata Rules above) as part of every smoke test pass.
