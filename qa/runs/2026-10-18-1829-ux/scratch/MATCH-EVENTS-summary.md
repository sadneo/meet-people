# Matching and Events visual audit

Four scoped findings: three medium-priority usability/clarity improvements and one low-priority palette inconsistency. No app code or saved data changed.

- MATCH-UX-01: Preferences density, heading/button wrapping and inconsistent label/input alignment.
- EVENTS-UX-01: Event queue hierarchy and action-group spacing.
- EVENTS-UX-02: Cross-day date ranges lose their ending date.
- EVENTS-UX-03: Event title links use browser blue instead of the existing forest tokens (polish).

Actual viewport screenshots were taken at 320×568, 390×844, 800×860, 801×860, 1280×720 and 1920×1080. Matching active/downtime states, preferences top/interests/availability, event feed/detail and wide preview were inspected. The existing minimal matching focal composition and wide Events preview were retained as intentional design choices. Event paragraphs already preserve description line breaks; no duplicate description-formatting issue was filed.

Live seeded carol/dave/iris accounts were used read-only. No matching lookup/provider scoring, queue enrollment/leave, profile save, DB reset or server restart occurred. The cross-day date case alone uses browser response fixtures, clearly marked in its finding. Existing uncommitted fixes were preserved. Tool scripts/logs are `match-events-audit.mjs/.log` and `match-events-details.mjs/.log` in this directory.
