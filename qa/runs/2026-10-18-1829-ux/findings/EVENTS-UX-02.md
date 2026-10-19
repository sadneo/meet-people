---
id: EVENTS-UX-02
area: events
priority: medium
type: formatting
page: /events; /events/:id; wide preview
viewport: 390x844; 1280x720
user: iris
---
**Summary:** Multi-day event ranges omit their ending date, producing an apparently backwards same-day time range.

**Steps:** In a browser-only valid event-response fixture, use start `2026-10-24T22:00:00Z` and end `2026-10-26T18:00:00Z`. Open the event card and detail at 390×844 and 1280×720.

**Expected:** The date line clearly says the event runs from Saturday October 24 to Monday October 26, while ordinary same-day events remain compact.

**Observed:** Both card and detail render `Sat, Oct 24, 6:00 PM EDT – 2:00 PM EDT`. Monday October 26 is missing, so a three-day event appears to end four hours before it starts on Saturday. `eventDate` always formats the end as a time only. This affects the same shared formatter in the selected-event preview.

**Recommended result:** Keep the current locale/timezone-aware format, but include the ending calendar date when it differs from the starting date. Retain the compact time-only ending for same-day ranges. Allow the full range to wrap naturally without losing the date or time-zone information.

**Evidence:** [390px card](../screenshots/events-multiday-card-390.png); [390px detail](../screenshots/events-multiday-detail-390.png); [1280px detail](../screenshots/events-multiday-detail-1280.png). Both exact outputs and fixture dates are recorded in `scratch/match-events-details.log`; reproducer `scratch/match-events-details.mjs`.

**Suggested source:** `src/features/events/client.ts` (`eventDate`) with a focused formatter regression test. If necessary, `src/features/events/events.css` for wrapping of `.ev-event-date` / `.ev-detail-fact`; no data contract changes.

**Scope:** Date formatting. This was reproduced using response fixtures because the saved QA listings are single-date events; no listings were created or changed.
