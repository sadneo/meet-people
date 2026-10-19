# Known issues

Already found and triaged. Testers skip these unless they find a new, worse symptom. The lead
merges them into each run's queue so they get fixed with everything else.

| ID | Sev | Area | Summary | Evidence |
| --- | --- | --- | --- | --- |
| KNOWN-5 | P3 | ALL | No favicon: every page logs a 404 for `/favicon.ico`. | Browser console |
| KNOWN-6 | P3 | MSG | After blocking someone, their already-loaded messages stay visible until reload. | Code review |

## Resolved in run 2026-10-18-1700

Do not queue these again unless a new reproduction shows a regression. The fixes are
uncommitted in the working tree; see `qa/runs/2026-10-18-1700/REPORT.md` and `verify.md`.

| ID | Previous severity | Resolution |
| --- | --- | --- |
| KNOWN-1 | P2 | Access loss disables the composer, explains the state, and removes the inbox row. Delayed successful polls cannot reopen it. |
| KNOWN-2 | P2 | Successful inbox polls replace all loaded pages, removing ended conversations without dropping later pages. |
| KNOWN-3 | P2 | Open-chat delivery updates its preview immediately; sequence checks preserve newer sent-message previews. |
| KNOWN-4 | P2 | Network send failures use actionable copy while preserving the draft and retry ID. |

All four were re-tested in Chromium at 390px and 1280px, with unit regressions.
