Personal homepage for [patrickbeasley.com](https://patrickbeasley.com) — built with Next.js (App Router, TypeScript), Supabase, Tailwind CSS, and deployed on Vercel.

## Stack
- **Framework**: Next.js (App Router, TypeScript)
- **Styling**: Tailwind CSS
- **Database + Auth + Storage**: Supabase
- **Deployment**: Vercel
- **Domain**: patrickbeasley.com

## Features
- About, Resume, Projects, Blog, Contact
- Admin dashboard (Google OAuth protected)
- File upload/download management (admin-only)

## Environment Variables

See `.env.example` for all required variables. Never commit `.env.local`.

## Project Tracking

- [GitHub Issues](https://github.com/PatrickBeasley/personal-homepage/issues)
- [Project Board](https://github.com/PatrickBeasley/personal-homepage/projects)

## AI Development Docs

| File | Purpose |
|------|---------|
| `.github/copilot-instructions.md` | Workspace-wide AI coding baseline |
| `.github/AGENTS.md` | Agent roles and boundaries |
| `.github/instructions/` | File-scoped coding standards |
| `.github/prompts/` | Reusable task prompts |
| `.github/skills/` | Multi-step workflow skills |
| `docs/ai/lessons-learned.md` | Running log of project learnings |
| `docs/ai/decision-records.md` | AI workflow decision history |

## Phases

| Phase | Description | Status |
|-------|-------------|--------|
| Action 0 | GitHub repo + tracking foundation | ✅ Done |
| Action 1 | AI markdown scaffold files | ✅ Done |
| Phase 0 | Readiness checklist decisions | ✅ Done |
| Phase 1 | Platform bootstrap (Next.js, Vercel, Supabase) | ✅ Done |
| Phase 2 | Data model + auth foundation | ✅ Done |
| Phase 3 | Core site features | ✅ Done* |
| Phase 4 | Admin + file upload/download | ✅ Done |
| Phase 5 | Hardening + delivery | ✅ Done |

*Phase 3: All public pages (About, Resume, Projects, Blog, Contact, Privacy) built with SEO metadata. Remaining: "Verify DNS OAuth ownership" (scope pending clarification).

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
