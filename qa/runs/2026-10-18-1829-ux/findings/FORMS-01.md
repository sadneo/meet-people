---
id: FORMS-01
area: profile
severity: P2
type: visual
page: /profile
viewport: 320x568; 390x844; 800x844; 801x844; 1280x720; 1920x1080
user: grace
---
**Summary:** A profile without a photo displays a clipped green circle at the top of the cover instead of a complete portrait at the cover/body boundary.

**Steps:** Open `/profile` as grace, whose optional photo is unset, at any tested viewport.
**Expected:** The fallback silhouette occupies the same complete portrait position as an uploaded photo.
**Actual:** Only the bottom of the silhouette circle is visible, clipped by the top edge of the cover. The intended portrait container collapses to zero height.
**Evidence:** `screenshots/FORMS-profile-390x844.png`; `screenshots/FORMS-profile-1280x720.png`; `scratch/forms-messages-scan.json`. At 390px the portrait container has height 0, while the 132px fallback avatar is positioned absolutely at y69 above the summary's y136 top. Desktop has the same fault with a 204px circle.
**Reproduced:** All six tested viewports.
**Proposed fix:** In `src/features/prototype/profile.css`, exclude `.pt-avatar` from both presence-dot selectors (`.pt-profile-portrait > span`). Preserve photo size, overlap, page composition, and the sample presence indicator.

