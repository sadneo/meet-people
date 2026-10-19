---
id: AUTH-02
area: auth
severity: P2
type: bug
page: /profile
viewport: 390x844; 1280x860
user: grace
---
**Summary:** Profile editing hides existing custom interests, so users cannot remove them from their profile.

**Steps:**
1. Open `/profile` as seeded user grace. The profile displays interests “morning yoga” and “plant-based cooking”.
2. Select **Edit profile**.
3. Inspect the Interests choices and try to remove either saved interest.

**Expected:** Every saved interest is represented as selected and can be removed from the profile editor.
**Actual:** The editor presents only the fixed 11 preset choices, with none selected. Neither saved interest appears or has a removal control. Custom interests remain in the profile state and are preserved when changing other profile fields. A user must find matchmaking's separate Preferences editor to manage these values.
**Evidence:** screenshots/AUTH-recovered-hidden-interests-390.png; screenshots/AUTH-recovered-hidden-interests-1280.png; saved profile interests `["morning yoga", "plant-based cooking"]`; editor selected interests `[]`; available choices `["Music", "Gaming", "Sports", "Food", "Outdoors", "Art", "Movies", "Fitness", "Study", "Coffee", "Photography"]`.
**Reproduced:** 2/2 independent browser contexts, at 390x844 and 1280x860.
**Suspected cause:** `src/features/prototype/Social.tsx` passes only the preset `interests` array to the profile editor's Chips component. `src/features/prototype/ui.tsx` renders controls from options, so values outside that array have no controls. Matchmaking permits custom interest labels, and the seeded persistent profiles contain them.
