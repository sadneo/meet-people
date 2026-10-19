---
name: qa
description: Multi-agent UX and bug testing of the local Pebble web app. Area testers explore pages in a real browser and write evidence-backed findings; the lead deduplicates, reproduces and ranks them P0–P3; fixers then repair confirmed P0–P2 in rank order in isolated worktrees and a verifier re-tests everything. Produces a full Markdown report of all issues and changes. Use when the user asks for QA, UX testing, bug hunting or a test pass over the site's pages.
argument-hint: "[areas, e.g. 'AUTH MSG MATCH' or 'all'] [--review-first] [--fix-approved <run>]"
---

# /qa: multi-agent QA run

You (the main session) are the **lead**. Only you launch agents; subagents cannot launch others.
Everything here is local-only and excluded from git via `.git/info/exclude`.

Files: rubric `.claude/skills/qa/rubric.md`, areas `.claude/skills/qa/areas.md`, known issues
`.claude/skills/qa/known-issues.md`, browser helper `.claude/skills/qa/scripts/qa-browser.mjs`,
e2e baseline `qa/baseline/e2e-failures.txt` (tests already failing on dev).
Agents: `qa-tester`, `qa-fixer`, `qa-verifier` in `.claude/agents/`. If those agent types are not
available in this session, launch `general-purpose` agents and start their prompt with
"Read `.claude/agents/qa-<role>.md` and follow it exactly as your instructions."

Areas: `AUTH`, `MSG`, `MATCH`, `EVENTS`, `HOME`, `MOBILE` (see areas.md). Default when none are
given: `AUTH MSG MATCH`. `all` means all six.

## 1. Prepare

1. Make sure the local stack is up: Supabase containers running and the dev server answering on
   http://127.0.0.1:3000 (start `pnpm dev` in the background if not).
2. Reset the local database to the seed so every run starts from the same data:
   `pnpm supabase:reset`, then `rm -rf qa/.sessions` (tokens from the old database are invalid).
   If `EVENTS` is in the run, insert the sample listings from areas.md.
3. Create the run folder `qa/runs/<YYYY-MM-DD-HHMM>/` with `findings/`, `screenshots/`, `scratch/`.
4. Smoke-test the helper once: `node .claude/skills/qa/scripts/qa-browser.mjs look alice /messages 390x844`.

## 2. Test (parallel)

Launch one `qa-tester` per area **in a single message**, in the background. Each prompt gives:
the area code, the absolute run folder, its users from areas.md, and "follow your agent file".
Add `MOBILE` only when asked or when running `all`. Wait for all of them to finish.

## 3. Triage (you)

1. Read every finding file, nitpick list and question list.
2. **Deduplicate**: same root cause = one finding. Keep the clearest ID; list the others as duplicates.
3. **Reproduce every P0–P2 yourself** with the helper (a short script per finding in `scratch/lead/`).
   Mark each `Confirmed` or `Not reproduced`. Drop what you cannot reproduce (keep it in the report
   as "Not reproduced"); testers do report plausible bugs that are not real.
4. **Re-rank** strictly by the rubric. Demote anything that is really taste to P3. Move
   design disagreements to Questions. Merge `known-issues.md` entries into the list.
5. Write a first `qa/runs/<run>/REPORT.md` (format below) with every finding in status
   `Queued` (P0–P2) or `Not fixing (P3)`, and copy it to `qa/REPORT.md`, so a report exists even
   if fixing is interrupted.

## 4. Fix by rank (default) or stop for review

By default, continue straight to fixing every **confirmed** P0–P2 finding, in rank order
(P0, then P1, then P2). Never fix P3s, unreproduced findings or design questions.
Only if the user passed `--review-first`: stop here, show the ranked P0–P2 table and the report
path, and wait for them to choose; a later `/qa --fix-approved <run>` continues from step 5.

## 5. Fix (parallel, isolated)

1. Group the findings to fix by the files they will touch, so no two fixers edit the same file.
   At most 4 groups at a time. Launch groups holding P0/P1 issues first; if there are more than 4
   groups, finish the higher-ranked wave before starting the next.
2. Launch one `qa-fixer` per group **in a single message**, each with `isolation: "worktree"`,
   giving the absolute paths of its finding files.
3. Bring each fixer's changes into the main working tree **without committing**:
   `git -C <worktree> add -A && git -C <worktree> diff --cached --binary HEAD > qa/runs/<run>/patches/<group>.patch`,
   then `git apply --3way qa/runs/<run>/patches/<group>.patch` from the repo root, then
   `git restore --staged .` so nothing is left staged. Resolve any overlap yourself.
4. Run `pnpm typecheck && pnpm lint && pnpm test`. Fix integration breakage yourself or send it
   back to the fixer that caused it.

## 6. Verify

Launch one `qa-verifier` with the run folder and the fixed IDs. If it finds regressions or
unverified fixes, send them back to a fixer (one more round at most), then verify again.

## 7. Report

Update `REPORT.md` (and `qa/REPORT.md`) with final statuses, every changed file, tests added and
the check results. Clean up worktrees you created (`git worktree list`, then
`git worktree remove <path>` for qa worktrees). Never commit or push; tell the user the changes are
uncommitted in the working tree and summarise the report.

## REPORT.md format

```markdown
# QA report: <run>

<date> · branch <branch> @ <short sha> · areas <…> · testers <n> · status <Queued | Fixed and verified | …>

## Summary
<3–5 lines: how many issues by severity, how many fixed and verified, anything that needs a decision.>

## Issues (P0–P2)
| ID | Sev | Area | Type | Summary | Page / viewport | Status | Fix |
| --- | --- | --- | --- | --- | --- | --- | --- |
Status is one of: Queued · Fixed and verified · Fixed, not verified · Not fixed (why) · Not reproduced · Duplicate of <ID>.

### <ID>: <summary>
Steps, expected, actual, evidence (screenshot links), root cause, fix (files), test added, verification.
(One section per P0–P2 issue.)

## Nitpicks (P3, not fixed)
- <ID or area> · <one line>

## Design questions for you
- <one line each, with the page>

## Changes made
| File | Change | For |
| --- | --- | --- |
Plus tests added, and `git diff --stat` of the working tree.

## Checks
Typecheck, lint, build, unit tests, e2e new failures vs baseline, browser re-tests.

## Not covered
Areas, flows or devices not tested and why.
```
