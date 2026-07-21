---
description: "Use when planning tasks, debugging issues, fixing bugs, managing multi-step work, making architectural decisions, or reviewing code quality. Covers planning mode, subagent strategy, verification, self-improvement, and autonomous bug fixing."
---

# Workflow & Behavioral Guidelines — personal-homepage

## Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions).
- If something goes sideways, STOP and re-plan immediately — don't keep pushing.
- Use plan mode for verification steps, not just building.
- Write detailed specs upfront to reduce ambiguity.
- When asked to plan: identify risks, list open decisions, and propose an approach before writing code.
- Planning is issue-first: create or update GitHub issues for planned work (one parent tracking issue plus child implementation tasks) before starting code changes.
- For work spanning multiple days or sessions, ensure planned issues are added to the GitHub project board.
- When requirements are ambiguous: state the assumption, implement it, and flag it for review.

## Subagent Strategy
- Use subagents liberally to keep the main context window clean.
- Offload research, exploration, and parallel analysis to subagents.
- For complex problems, throw more compute at it via subagents.
- One task per subagent for focused execution.

## Self-Improvement Loop
- After ANY correction from the user: update `docs/ai/lessons-learned.md` with the pattern, root cause, and reusable rule.
- Write rules for yourself that prevent the same mistake.
- Ruthlessly iterate on these lessons until mistake rate drops.
- Review lessons at session start for the relevant project.
- If a lesson is actionable and should prevent future mistakes, also update the relevant `.instructions.md` file.
- Document architectural or implementation decisions in `docs/ai/decision-records.md`.

## Verification Before Done
- Never mark a task complete without proving it works.
- Run `npm run lint` and `npm run build` after any non-trivial change.
- Diff behavior between main and your changes when relevant.
- Ask yourself: "Would a staff engineer approve this?"
- For schema changes, include migration SQL and RLS policy updates.
- For auth changes, verify both authenticated and unauthenticated paths.
- For web page changes, use Playwright MCP to test rendering, navigation, and console errors.

## Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution."
- Skip this for simple, obvious fixes — don't over-engineer.
- Challenge your own work before presenting it.

## Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding.
- Point at logs, errors, failing tests — then resolve them.
- Zero context switching required from the user.
- Go fix failing CI tests without being told how.

## Task Management
- **Plan First**: Write plan with checkable items (use the todo list tool for tracking).
- **Verify Plan**: Check in before starting implementation.
- **Track Progress**: Mark items complete as you go.
- **Explain Changes**: High-level summary at each step.
- **Document Results**: Add review section upon completion.
- **Capture Lessons**: Update `docs/ai/lessons-learned.md` after corrections.

## Core Principles
- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
