---
id: HOME-01
area: home
severity: P2
type: bug
page: / → /profile/person
viewport: 390x844; 1280x860
user: guest; frank
---
**Summary:** Back from a profile opened on Home sends the user into an unrelated free-time planning page instead of returning Home.

**Steps:**
1. As a guest at 390×844, open `/`.
2. Select the Aaron thought bubble. Confirm `/profile/person` displays Aaron Patel.
3. Press the profile header's Back arrow.
4. Repeat as frank at 1280×860 without connecting, messaging, or modifying profile/settings data.

**Expected:** The profile Back action returns to the Home page from which the person was opened.

**Actual:** Both runs navigate to `/free-time/matches`, showing Find your people and an unrelated multi-person planning selection flow. Browser Back then returns to the profile, requiring another Back to reach Home. This concerns navigation from the main Home discovery UI, not the fictional content of the planning prototype.

**Evidence:** `screenshots/home/journey-guest-390-person.png`; `screenshots/home/journey-guest-390-after-back.png`; `screenshots/home/journey-frank-1280-person.png`; `screenshots/home/journey-frank-1280-after-back.png`. Live recovery output in both cases: `after bubble click /profile/person [ 'Profile', 'Aaron Patel' ]` then `after header back arrow /free-time/matches [ 'Find your people' ]`. No non-favicon browser problems occurred.

**Reproduced:** 2/2 on 2026-10-18 during recovery: guest phone and read-only frank desktop. Run `scratch/HOME/journey.mjs guest 390x844` and `scratch/HOME/journey.mjs frank 1280x860`.

**Suspected cause (optional):** `src/features/prototype/Social.tsx` hard-codes the other-person profile header to `back={() => go('Free Time Match')}`. Home now reuses that profile route, but does not supply its entry origin.

**Severity rationale:** P2 because the primary navigation and browser history provide workarounds; the in-app Back control nevertheless takes users out of their current discovery task.

**Suggested verification:** Extend the existing Home bubble navigation coverage in `e2e/home-preview.spec.ts` to click Back and assert return to `/`. Preserve the original free-time profile return behavior in a separate navigation test.
