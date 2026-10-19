---
id: EVENTS-UX-03
area: events feed
priority: low
type: visual polish
page: /events
viewport: 390x844; 800x860; 801x860; 1280x720; 1920x1080
user: dave
---
**Summary:** Event titles fall back to browser-blue underlined links, breaking the forest text hierarchy shared by the card and selected-event detail.

**Steps:** Open the event feed at 390px and 1920px. Compare a card's title with its forest date/location, its themed action link, and the same event's title in the selected preview.

**Observed:** Card names such as QA event 1 are bright browser blue with a full underline. The adjacent date/location and the selected-event title use the intended forest palette. `.ev-name-link` sets size, weight and hover decoration but no normal/visited link color, allowing browser defaults to become the feed's strongest textual accent. The same issue is visible with the representative multi-day title, so it is unrelated to fixture naming.

**Recommended result:** Explicitly theme normal and visited event-name links with the existing forest ink token, retain the semantic links and keyboard focus styles, and use intentional hover/focus decoration consistent with the card's other links. Do not add a new color or font.

**Evidence:** [390px feed](../screenshots/events-page-390x844.png); [1920px feed and selected preview](../screenshots/events-page-1920x1080.png); [representative title](../screenshots/events-multiday-card-390.png).

**Suggested source:** `src/features/events/events.css`, scoped `.ev-name-link` link/visited/hover/focus states. This is formatting polish rather than a broken flow, so it is intentionally ranked below the usability/clarity findings.
