# QA rubric

Every finding gets exactly one severity. When unsure between two levels, pick the lower one and say why.

| Severity | Meaning | Examples | Fixed automatically? |
| --- | --- | --- | --- |
| **P0** | Crash, data loss, security or privacy leak, or nobody can sign in | Blank page or uncaught error, another user's data visible, saved data silently lost | Yes, first |
| **P1** | A core flow is broken and there is no reasonable workaround | Can't send a message, Accept does nothing, a form can't be submitted, layout hides the only button on a phone | Yes |
| **P2** | Works, but is confusing, misleading or needs a workaround | Stale data until refresh, raw technical error text, unclear empty state, missing feedback after an action, keyboard trap | Yes, after P0/P1 |
| **P3** | Cosmetic, wording, taste, minor polish | Spacing a few px off, slightly different shade, copy you would phrase differently, console noise with no user impact | **No.** One line in `nitpicks.md` |

## What counts as a finding

A finding needs **all** of these, or it is not reported:

1. Exact steps from a known starting point (user, page, viewport).
2. Expected vs actual, in user terms.
3. Evidence: a screenshot path, and/or the exact console error / failed request / API status.
4. You reproduced it at least twice (P0–P2).

Do **not** report:

- Things `docs/DESIGN.md` deliberately chose. If you think the design itself is wrong, write it in `questions.md` instead (one line each), not as a finding.
- Fixture or prototype content being fake. These pages are local previews with demo data by design: `/free-time/*`, `/intro`, `/prototype/*`, the Plan Card in Messages. Only report P0/P1 crashes or broken navigation there.
- Behaviour that needs services not running locally (Google sign-in, embeddings, hosted ingestion).
- Known issues already listed in `known-issues.md`, unless you found a new, worse symptom.
- The same root cause twice. One finding, list every place it shows up.

## Known noise (ignore)

- `console: Failed to load resource: ... 404` for `/favicon.ico` (no favicon yet; P3, already known).
- 401 responses while signed out.

## Finding file

One file per finding: `<run>/findings/<AREA>-<NN>.md` (e.g. `MSG-03.md`), screenshots in `<run>/screenshots/`.

```markdown
---
id: MSG-03
area: messages
severity: P2
type: bug | ux | visual | a11y
page: /messages/chat?conversation=…
viewport: 390x844
user: alice
---
**Summary:** One sentence a product person would understand.

**Steps:**
1. …
2. …

**Expected:** …
**Actual:** …
**Evidence:** screenshots/MSG-03-before.png; console: "…"; `GET /api/… → 503`
**Reproduced:** 2/2
**Suspected cause (optional):** `src/features/messaging/Feature.tsx:123` because …
```
