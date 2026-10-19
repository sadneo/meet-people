---
id: UX-HOME-01
area: home
priority: medium
type: visual
page: /
viewport: 800x900; 801x900
user: guest; frank
---
**Summary:** Home's hero and primary action abruptly shrink when the shell switches from tablet to desktop.

**Steps:** Open Home at 800×900, then resize to 801×900. Repeat in a fresh browser context. The existing capture also reproduces this through direct page loads at each size.

**Expected:** Navigation changes at the established 800px shell boundary while the illustrated focal point and primary action maintain a coherent scale. DESIGN.md calls for continuous focal sizing; the existing art, palette, typography, and three-person composition remain authoritative.

**Actual:** The mascot falls from 306×306px to 220×220px, a 28% reduction for one pixel of added viewport width. Find people simultaneously narrows from 300px to 210px. The thought-bubble composition contracts from 734px to 528px. The 801px layout feels much smaller than its adjacent tablet state.

**Evidence:** `screenshots/home/guest-800x900-home.png`; `screenshots/home/guest-801x900-home.png`; exact rectangles in matching `scratch/guest-*-home.json`. The same desktop composition was checked signed in via `screenshots/home/frank-801x900-shell-b.png`. Browser-only proposal: `screenshots/home/proposal-guest-801x900-home.png`.

**Reproduced:** Independent guest page loads plus a signed-in frank check. No account data was changed.

**Concrete fix:** Scope the expanded Home focal width term to 38vw instead of the shared 26vw, retaining the existing 37dvh cap and limits. Apply the existing compact 300px action width to Home's expanded action too, allowing the existing wide-screen min-width to preserve its 320px sizing. Keep this in Home CSS (`src/features/prototype/home-preview.css` or scoped rules in `calm.css`), leaving Matchmaking's shared focal variable alone. Browser-only preview produced a 304px mascot/300px action at 801×900, retained the 266px mascot at 1280×720 and 400px at 1920×1080, and retained the existing short-height mascot cap at 801×568.

**Validation:** Capture and inspect 799/800/801 at a common height, phone 320×568, short expanded 801×568 and 1280×720, and 1920×1080. Confirm thought bubbles avoid the face/actions and retain the existing wide/short compositions. This is accepted visual polish under the user's current formatting request.
