# Lessons Learned — personal-homepage

This file is the operational memory for AI-assisted development on this project.  
**Update rule**: add an entry at the end of every phase, and within 48 hours of any incident or repeated mistake.  
**Promotion rule**: if a lesson appears twice, promote it into the relevant `.instructions.md`, `.prompt.md`, or `SKILL.md`.

---

## Entry Template
```
## [DATE] — [Short Title]
**Phase/Context**: 
**What worked**: 
**What failed**: 
**Root cause**: 
**Reusable rule**: 
**Action to encode**: (instruction / prompt / skill / none)
```

---

## 2026-03-29 — Project Initialization
**Phase/Context**: Action 0 + Action 1 — repo creation and AI docs scaffold  
**What worked**: Using `gh` CLI with a PAT for repo creation; `create-next-app` with `--yes` flag for non-interactive scaffold  
**What failed**: Initial PAT was missing `read:org` scope — required regeneration  
**Root cause**: GitHub CLI requires `read:org` scope even for personal account operations  
**Reusable rule**: When generating a GitHub PAT for `gh` CLI, always include `repo`, `workflow`, `read:org`, and `project` scopes  
**Action to encode**: Add scope checklist to `project-bootstrap/SKILL.md` Stage 1
