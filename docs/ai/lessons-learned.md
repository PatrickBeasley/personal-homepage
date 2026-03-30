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

## 2026-03-30 — Bootstrap Credential Hygiene
**Phase/Context**: Resume after initial scaffold and GitHub setup  
**What worked**: Temporarily embedding the PAT in the git remote unblocked a non-interactive push when credential helper behavior was inconsistent  
**What failed**: `.env.example` was ignored by the default `.env*` gitignore rule, and the temporary credentialed remote needed immediate cleanup  
**Root cause**: Default scaffold ignore rules were broader than needed, and git credential behavior was not fully consistent across terminals  
**Reusable rule**: If a token is ever embedded in a remote URL to unblock automation, reset the remote to a clean URL immediately after push; also verify `.env.example` is force-added or explicitly unignored when the repo ignores `.env*`  
**Action to encode**: Update bootstrap guidance and repo instructions to check `.env.example` staging and remote URL cleanup
