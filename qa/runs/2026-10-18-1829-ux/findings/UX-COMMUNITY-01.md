---
id: UX-COMMUNITY-01
area: community
priority: high
type: visual
page: /community
viewport: 320x568
user: frank
---
**Summary:** The signed-in Community page reserves a mostly empty notification row, pushing its week controls behind bottom navigation on short phones.

**Steps:** Open `/community` as frank at 320×568 without scrolling. Compare its header, village and weekly controls with the same page signed out. Repeat as frank in a fresh browser context.

**Expected:** The notification bell shares Community's existing toolbar, leaving room for the village and its weekly controls. Controls remain comfortably visible above compact navigation.

**Actual:** A separate 64px row contains only the notification bell. Community's toolbar begins at y96 instead of y32, and its history ends at y527 while bottom navigation starts at y496. The week controls at the bottom are covered on initial view. Signed-out Community fits entirely in the same viewport. This is wasted structure rather than a need to shrink the existing village artwork.

**Evidence:** `screenshots/home/frank-320x568-community.png` versus `screenshots/home/guest-320x568-community.png`; exact rectangles in matching `scratch/*-320x568-community.json`. Browser-only proposed alignment: `screenshots/home/proposal-frank-320x568-community.png` and `scratch/proposal-frank-320x568-community.json`, where the bell sits at x76/y32 and week controls sit at y403–451 above navigation y496.

**Reproduced:** 2/2 fresh signed-in browser contexts; the original capture and the follow-up capture returned document height624px and the same covered history position.

**Concrete fix:** In `src/features/prototype/calm.css`, make Community a positioning context and place its existing `.pt-inbox-controls` beside Back within the existing toolbar area, mirroring Home's quiet notification placement. Remove its flow height through route-scoped absolute positioning; retain the existing bell, accessible label, notification behavior, and modal. Suggested mobile top32px/left(gutter+56px), expanded top(header-height+18px), with 48px target unchanged. No markup or service changes are needed.

**Validation:** Add a real-browser geometry regression asserting bell/Back/balance/Build do not overlap, bell aligns with the toolbar, and the full week-control row clears bottom navigation on a signed-in 320×568 screen. Inspect 390px, 799/800/801px, 1280×720 and 1920×1080, open/close the notification and Build dialogs, and retain all prior keyboard clearance fixes.
