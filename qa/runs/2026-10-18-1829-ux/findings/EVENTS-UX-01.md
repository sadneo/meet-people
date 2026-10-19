---
id: EVENTS-UX-01
area: events
priority: medium
type: visual
page: /events/:id; /events wide preview
viewport: 320x568; 390x844; 1280x720; 1920x1080
user: dave
---
**Summary:** The event group section reads as a wall of equal-weight text, and its primary and secondary actions touch with no horizontal gap.

**Steps:** As dave, open the first event from the feed and scroll to Go together. Inspect at 390×844 and 1280×720. At 1920×1080 inspect the same section in the feed's selected-event preview.

**Observed:** The section heading is followed immediately by a long technical explanation, then the queue state with no paragraph spacing. Both explanatory paragraphs use the same 16px/24px body style as the decision/status content; details such as Old Company interest, compatibility opt-in, server persistence and background processing dominate the section. At 390px, Leave queue and Refresh queue meet edge-to-edge. The following service explanation begins immediately under the buttons. At 320px the buttons wrap separately, with spacing determined by each button's top margin rather than a deliberate action group. The same structure is repeated prominently in the wide preview.

**Recommended result:** Establish three clear levels using the existing type and palette: concise purpose/status, a primary action with a quieter Refresh action in a wrapping row with an explicit gap, then compact secondary service information. Preserve the truthful distinction between joining a queue and obtaining a group; preserve the fact that group processing is not enabled. Keep implementation/legacy-consent explanations in a clearly separated secondary disclosure or suitably quiet supporting copy instead of placing all of it before the action.

**Evidence:** [320px](../screenshots/events-detail-queue-320x568.png); [390px](../screenshots/events-detail-queue-390x844.png); [1280px](../screenshots/events-detail-queue-1280x720.png); [1920px selected preview](../screenshots/events-preview-queue-1920x1080.png). Live content and queue snapshots are logged in `scratch/match-events-audit.log`.

**Suggested source:** `src/features/events/EventGroupQueue.tsx` for explicit purpose/status/actions/help grouping, and `src/features/events/events.css` for scoped spacing, muted supporting text and wrapping action gaps. Avoid altering the generic `.ev-button` behavior across unrelated screens.

**Scope:** Hierarchy and layout; preserve queue semantics, all actions, saved state and service limitations. No queue changes or data writes were performed in this audit.
