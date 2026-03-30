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

## Styling and Theming
- Use Tailwind CSS utility classes. Do not write custom CSS unless Tailwind cannot achieve the result.
- Follow the established color palette and spacing scale — do not introduce one-off values.
- Dark mode support is desirable but not required at launch. Use Tailwind's `dark:` variant if added.
- Keep component files focused: one component per file, co-located styles if needed.
