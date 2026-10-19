---
id: MATCH-01
area: matchmaking
severity: P2
type: ux
page: /matchmaking
viewport: 390x844; 1280x860
user: carol
---
**Summary:** Saving invalid matching preferences leaves its only explanation below the visible dialog, making Save appear to do nothing.

**Steps:**
1. Sign in as carol and open `/matchmaking` at 390x844 (also reproduced at 1280x860).
2. Open Preferences, then select Add time window.
3. In the newly added window, enter Start `17:00` and End `21:00` (seconds are required by the current schema).
4. Select Save preferences.

**Expected:** Rejected preferences show an explanation in the visible part of the dialog and identify the field requiring correction. The existing draft remains available to edit.
**Actual:** The dialog stays open without visible feedback. Its general validation alert is below the scrollable body's visible bottom; focus remains on Save preferences and the body does not scroll to the alert or invalid field. The user must discover and scroll down to find why the save failed. The newly added Monday window also overlaps carol's existing Monday window; either validation reason should be presented visibly.
**Evidence:** screenshots/MATCH-01-recovered-1-390.png; screenshots/MATCH-01-recovered-2-1280.png. Browser geometry after Save: phone alert top 844.53 vs scroll viewport bottom 679; desktop alert top 766.5 vs scroll viewport bottom 658.5. Both reported `visible: false` and focused text `Save preferences`. Reproducer: `scratch/MATCH/recovery-preferences.mjs`. Original interrupted artifacts: screenshots/MATCH-prefs2-a-1700-390.png and screenshots/MATCH-prefs2-b-1700-1280.png.
**Reproduced:** 2/2 in fresh browser sessions; live profile, no route mocks, no successful profile write.
**Suspected cause (optional):** `ProfileEditor` in `src/features/matchmaking/MatchingScreen.tsx` only calls `setValidation` after schema rejection; the alert is appended after all form fields inside `.match-preferences-body`, with no scroll/focus handling. P2 because the user can manually scroll to the explanation and correct the draft.
