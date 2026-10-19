# QA report: 2026-10-18-1700

2026-10-18 · branch dev @ dc9e94a · AUTH, MSG, MATCH, EVENTS, HOME, MOBILE · status Fixed and verified

## Summary
Recovered Claude's interrupted six-area run from its saved scripts, screenshots, and mobile scan logs. The run had no saved findings or report when resumed. Three area testers recovered the evidence; the lead independently reproduced findings, grouped fixes by affected files, integrated isolated worktrees, and commissioned browser verification plus an independent messaging review.

**10 confirmed issues: 0 P0, 1 P1, 9 P2. All ten fixed.** Nitpicks and product questions were left alone. No database reset, schema migration, production deployment, commit, or push. All implementation changes are uncommitted and unstaged in the main working tree. Temporary worktrees and the separate UI test server were removed.

## Issues (P0–P2)

| ID | Sev | Area | Summary | Status |
| --- | --- | --- | --- | --- |
| [AUTH-01](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/findings/AUTH-01.md) | P1 | Auth | Revoked sessions trap users behind account errors. | Fixed and verified |
| [AUTH-02](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/findings/AUTH-02.md) | P2 | Profile | Saved custom interests are absent from the editor. | Fixed and verified |
| [MOBILE-01](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/findings/MOBILE-01.md) | P2 | Mobile | Keyboard focus is hidden by compact navigation. | Fixed and verified |
| [HOME-01](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/findings/HOME-01.md) | P2 | Home | Profile Back opens unrelated free-time planning. | Fixed and verified |
| [MATCH-01](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/findings/MATCH-01.md) | P2 | Matching | Rejected preferences hide feedback below the dialog viewport. | Fixed and verified |
| [EVENTS-01](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/findings/EVENTS-01.md) | P2 | Events | Event errors expose raw parser/network diagnostics. | Fixed and verified |
| [KNOWN-1](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/findings/KNOWN-1.md) | P2 | Messages | Disconnected chats keep an enabled composer. | Fixed and verified |
| [KNOWN-2](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/findings/KNOWN-2.md) | P2 | Messages | Ended conversations survive successful inbox polling. | Fixed and verified |
| [KNOWN-3](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/findings/KNOWN-3.md) | P2 | Messages | Open-chat messages leave stale inbox previews. | Fixed and verified |
| [KNOWN-4](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/findings/KNOWN-4.md) | P2 | Messages | Failed sends show raw browser errors. | Fixed and verified |

### AUTH-01: Revoked sessions trap users behind account errors.

**Summary:** Logging out on one device traps another signed-in device behind an account error, including the sign-in page.

**Steps:**
1. Sign in to qa-auth-2@example.com with password123 in two independent browser contexts. In context A open `/profile`; in context B open `/settings`.
2. In context B select **Log out**. The app uses Supabase's default global sign-out, which revokes context A's server session as well.
3. Reload context A's `/profile`. Select **Retry**.
4. Navigate context A to `/login` and select **Retry account**.

**Expected:** An invalid server session leads back to a usable sign-in form, or offers a working sign-out/sign-in recovery action.
**Actual:** `/profile` is replaced with “Sign in with a valid session to use matching.” and Retry. `/login` shows “Could not load your account. Please try again.” and Retry account, with no email/password inputs and no Log out action. Retrying repeats 401; Back to home reaches the same account-loading barrier. Clearing browser storage is the only discovered recovery.
**Evidence:** screenshots/AUTH-recovered-revoked-profile-390.png; screenshots/AUTH-recovered-revoked-login-390.png; screenshots/AUTH-recovered-revoked-profile-1280.png; screenshots/AUTH-recovered-revoked-login-1280.png; `GET /api/matchmaking/account → 401` in both reproductions; login password-input count 0 and logout-button count 0.
**Reproduced:** 2/2 independent session pairs, at 390x844 and 1280x860.
**Suspected cause:** `src/auth/account.tsx` retains a locally valid Supabase session after an account 401; `src/auth/AuthScreen.tsx` sees that session and shows only account loading/retry. The barrier also removes the account menu and Settings recovery route.
**Reproduction script:** `node qa/runs/2026-10-18-1700/scratch/AUTH/recovered-revoked.mjs` (local stack required; logs statuses and UI text only).

**Fix:** Clear the expired local session on account 401, preserve the return destination, and retain Retry for transient errors. Refreshed tokens and switched identities are protected.

**Files:** [account.tsx](/home/xqiu/Projects/meet-people/src/auth/account.tsx).

**Regression coverage:** [account-recovery.test.tsx](/home/xqiu/Projects/meet-people/tests/account-recovery.test.tsx).

**Browser evidence:** [AUTH-01-after-1280.png](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots/AUTH-01-after-1280.png), [AUTH-01-after-390.png](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots/AUTH-01-after-390.png).

**Verification:** Fixed and verified; see [independent verification report](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/verify.md).

### AUTH-02: Saved custom interests are absent from the editor.

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

**Fix:** Include saved custom interests alongside presets so users can remove, restore, and save them.

**Files:** [Social.tsx](/home/xqiu/Projects/meet-people/src/features/prototype/Social.tsx).

**Regression coverage:** [profile-editor.test.tsx](/home/xqiu/Projects/meet-people/tests/profile-editor.test.tsx).

**Browser evidence:** [AUTH-02-after-1280.png](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots/AUTH-02-after-1280.png), [AUTH-02-after-390.png](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots/AUTH-02-after-390.png).

**Verification:** Fixed and verified; see [independent verification report](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/verify.md).

### MOBILE-01: Keyboard focus is hidden by compact navigation.

**Summary:** Keyboard navigation focuses controls completely behind the fixed bottom navigation, hiding both the control and its focus indicator.

**Steps:**
1. Sign in as liam and open `/settings` at 390×844 from the top of the page.
2. Use Tab repeatedly until the Mornings choice under Usual free time receives focus. Do not scroll with the mouse.
3. Observe the bottom of the screen. Continue through Afternoons and Evenings; those choices are hidden too.
4. Open `/matchmaking` and Tab to the On this device disclosure after the primary matching and preference controls.

**Expected:** The browser scrolls focused content fully above the fixed navigation so keyboard users can see the current control, its label, and its focus indicator.

**Actual:** Mornings is focused at viewport y795–839 while the navigation covers y772–844. The On this device disclosure is focused at y784–829 behind the same navigation. Both are completely covered. A keyboard user must manually scroll to identify the focused control. The defect affects multiple routes, so these symptoms are one shared shell finding.

**Evidence:** `screenshots/MOBILE-focus-hidden-settings-390-recovery-a.png`; `screenshots/MOBILE-focus-hidden-settings-390-recovery-b.png`; `screenshots/MOBILE-focus-hidden-matchmaking-390-recovery-a.png`; `screenshots/MOBILE-focus-hidden-matchmaking-390-recovery-b.png`. Both live recovery runs returned Settings `{focused:[795,839],navTop:772,scrollY:449}` and Matchmaking `{focused:[784,829],navTop:772,scrollY:0}`. Earlier Claude evidence also exists in `scratch/MOBILE/out/tab-390-a.txt` and `tab-390-b.txt`.

**Reproduced:** 2/2 fresh browser sessions on 2026-10-18 during recovery, in addition to the original saved pass. The reproduction script is `scratch/MOBILE/focus-obscured.mjs 390x844 <tag>`.

**Suspected cause (optional):** The compact shell reserves content padding for `--pt-navigation-clearance`, but the document scroll container has no corresponding `scroll-padding-bottom`. Browser focus scrolling treats the covered bottom portion of the viewport as visible.

**Severity rationale:** P2 because controls still work and manual scrolling is a workaround; the invisible keyboard focus makes normal navigation misleading.

**Suggested verification:** Add a keyboard regression beside `e2e/responsive.spec.ts` using its existing mocked signed-in session. Tab from known preceding controls to the local-preferences summary and Settings time choices, then assert their full bounding rectangles lie above `.pt-bottom-nav`, including an injected safe-area allowance. Existing responsive tests assert static placement and dialog clearance, but do not cover focus-triggered scrolling.

**Fix:** Reserve the shared navigation height and safe-area allowance when focused controls scroll into view.

**Files:** [responsive.css](/home/xqiu/Projects/meet-people/src/features/prototype/responsive.css).

**Regression coverage:** [keyboard-clearance.spec.ts](/home/xqiu/Projects/meet-people/e2e/keyboard-clearance.spec.ts).

**Browser evidence:** [MOBILE-01-after-390-matchmaking.png](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots/MOBILE-01-after-390-matchmaking.png), [MOBILE-01-after-390-settings.png](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots/MOBILE-01-after-390-settings.png).

**Verification:** Fixed and verified; see [independent verification report](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/verify.md).

### HOME-01: Profile Back opens unrelated free-time planning.

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

**Fix:** Record the profile entry route and return there; retain planning navigation and a direct-entry fallback.

**Files:** [PebbleApp.tsx](/home/xqiu/Projects/meet-people/src/routes/PebbleApp.tsx), [Social.tsx](/home/xqiu/Projects/meet-people/src/features/prototype/Social.tsx).

**Regression coverage:** [routes.test.tsx](/home/xqiu/Projects/meet-people/tests/routes.test.tsx).

**Browser evidence:** [HOME-01-after-1280.png](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots/HOME-01-after-1280.png), [HOME-01-after-390.png](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots/HOME-01-after-390.png).

**Verification:** Fixed and verified; see [independent verification report](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/verify.md).

### MATCH-01: Rejected preferences hide feedback below the dialog viewport.

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

**Fix:** Focus the existing error alert after client validation and failed saves, including repeated invalid submissions.

**Files:** [MatchingScreen.tsx](/home/xqiu/Projects/meet-people/src/features/matchmaking/MatchingScreen.tsx).

**Regression coverage:** [matchmaking-integrated.test.tsx](/home/xqiu/Projects/meet-people/tests/matchmaking-integrated.test.tsx), [matchmaking.spec.ts](/home/xqiu/Projects/meet-people/e2e/matchmaking.spec.ts).

**Browser evidence:** [MATCH-01-after-1280.png](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots/MATCH-01-after-1280.png), [MATCH-01-after-390.png](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots/MATCH-01-after-390.png).

**Verification:** Fixed and verified; see [independent verification report](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/verify.md).

### EVENTS-01: Event errors expose raw parser/network diagnostics.

**Summary:** A failed event request displays JSON parser diagnostics instead of an understandable service error.

**Steps:**
1. Sign in as dave and open an imported event detail at 390x844 (also reproduced at 1280x860).
2. Simulate `GET /api/events/<id>` returning HTTP 502 with `Content-Type: text/html` and body `<html><body>Bad gateway</body></html>` using Playwright routing.
3. Read the event detail error.

**Expected:** A concise event-unavailable message and Retry, consistent with the event list's existing failure state.
**Actual:** The main error says `Unexpected token '<', "<html><bod"... is not valid JSON`. The event's title/details disappear. Retry remains available, but the explanation is a raw browser diagnostic. A normal JSON error response is handled correctly, so this is specifically the non-JSON/network failure path.
**Evidence:** screenshots/EVENTS-01-recovered-1-390.png; screenshots/EVENTS-01-recovered-2-1280.png. Browser response: `502: GET http://127.0.0.1:3000/api/events/ab955825-dc9e-4c0f-9dbd-5128ae3a4a03`. Exact alert: `Unexpected token '<', "<html><bod"... is not valid JSON`. Reproducer: `scratch/EVENTS/recovery-errors.mjs`; after replacing the simulated response with a JSON 404 and clicking Retry, both sessions recovered to `This event is no longer available.` Original interrupted artifact: screenshots/EVENTS-fail-detail-502-390.png.
**Reproduced:** 2/2 in fresh browser sessions with only the event response mocked; live app and authenticated sessions. No server or database changes.
**Suspected cause (optional):** `eventRequest` in `src/features/events/client.ts` parses JSON before checking status, and the detail screen in `src/features/events/Browse.tsx` renders the thrown `Error.message` verbatim. The list already presents a generic state. P2 because Retry and back navigation still work.

**Fix:** Normalize transport, JSON, and schema errors; preserve actionable server messages, retry, and cancellation.

**Files:** [client.ts](/home/xqiu/Projects/meet-people/src/features/events/client.ts).

**Regression coverage:** [events-client.test.ts](/home/xqiu/Projects/meet-people/tests/events-client.test.ts).

**Browser evidence:** [EVENTS-01-after-1280.png](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots/EVENTS-01-after-1280.png), [EVENTS-01-after-390.png](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots/EVENTS-01-after-390.png).

**Verification:** Fixed and verified; see [independent verification report](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/verify.md).

### KNOWN-1: Disconnected chats keep an enabled composer.

**Summary:** A disconnected chat keeps an enabled composer after a 403.

**Steps:** Run `scratch/lead/messaging-recovery.mjs`. The script loads the real seeded inbox and chat, then injects deterministic API/network failures or an incoming message using Playwright routing. No chat records are changed.
**Expected:** Access loss is explained and disables sending; authoritative inbox polls remove ended chats; new chat messages update previews immediately; network failures preserve the draft and use actionable copy.
**Actual:** A disconnected chat keeps an enabled composer after a 403.
**Evidence:** `screenshots/KNOWN-1-2-before-1280.png` and lead browser output.
**Reproduced:** 2/2 at compact and expanded viewports; independently confirmed from Claude's known-issues list. KNOWN-2 tested in a separate inbox-only pass to isolate it from chat polling.
**Regression:** `tests/messaging.test.tsx`, proven to fail before fixes.

**Fix:** Treat history/send 403 and 404 responses as loss of access, disable sending, explain the state, and remove the inbox row. Ignore obsolete successful polls after access ends.

**Files:** [Feature.tsx](/home/xqiu/Projects/meet-people/src/features/messaging/Feature.tsx), [authorizedRequest.ts](/home/xqiu/Projects/meet-people/src/auth/authorizedRequest.ts).

**Regression coverage:** [messaging.test.tsx](/home/xqiu/Projects/meet-people/tests/messaging.test.tsx).

**Browser evidence:** [KNOWN-1-after-1280.png](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots/KNOWN-1-after-1280.png), [KNOWN-1-after-390.png](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots/KNOWN-1-after-390.png).

**Verification:** Fixed and verified; see [independent verification report](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/verify.md).

### KNOWN-2: Ended conversations survive successful inbox polling.

**Summary:** Ended conversations remain in the inbox after a successful poll.

**Steps:** Run `scratch/lead/inbox-recovery.mjs`. The script loads the real seeded inbox and chat, then injects deterministic API/network failures or an incoming message using Playwright routing. No chat records are changed.
**Expected:** Access loss is explained and disables sending; authoritative inbox polls remove ended chats; new chat messages update previews immediately; network failures preserve the draft and use actionable copy.
**Actual:** Ended conversations remain in the inbox after a successful poll.
**Evidence:** `screenshots/KNOWN-2-before-390.png` and lead browser output.
**Reproduced:** 2/2 at compact and expanded viewports; independently confirmed from Claude's known-issues list. KNOWN-2 tested in a separate inbox-only pass to isolate it from chat polling.
**Regression:** `tests/messaging.test.tsx`, proven to fail before fixes.

**Fix:** Replace the loaded conversation pages with authoritative responses, retaining later pages and preventing stale in-flight responses from restoring removed records.

**Files:** [Feature.tsx](/home/xqiu/Projects/meet-people/src/features/messaging/Feature.tsx).

**Regression coverage:** [messaging.test.tsx](/home/xqiu/Projects/meet-people/tests/messaging.test.tsx).

**Browser evidence:** [KNOWN-2-after-1280.png](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots/KNOWN-2-after-1280.png), [KNOWN-2-after-390.png](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots/KNOWN-2-after-390.png).

**Verification:** Fixed and verified; see [independent verification report](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/verify.md).

### KNOWN-3: Open-chat messages leave stale inbox previews.

**Summary:** New messages in an open chat do not update its inbox preview until the slower inbox poll.

**Steps:** Run `scratch/lead/inbox-recovery.mjs`. The script loads the real seeded inbox and chat, then injects deterministic API/network failures or an incoming message using Playwright routing. No chat records are changed.
**Expected:** Access loss is explained and disables sending; authoritative inbox polls remove ended chats; new chat messages update previews immediately; network failures preserve the draft and use actionable copy.
**Actual:** New messages in an open chat do not update its inbox preview until the slower inbox poll.
**Evidence:** `screenshots/KNOWN-3-before-1280.png` and lead browser output.
**Reproduced:** 2/2 at compact and expanded viewports; independently confirmed from Claude's known-issues list. KNOWN-2 tested in a separate inbox-only pass to isolate it from chat polling.
**Regression:** `tests/messaging.test.tsx`, proven to fail before fixes.

**Fix:** Update the preview with the chat poll; compare message sequence numbers so delayed polls cannot replace newer sent-message previews.

**Files:** [Feature.tsx](/home/xqiu/Projects/meet-people/src/features/messaging/Feature.tsx).

**Regression coverage:** [messaging.test.tsx](/home/xqiu/Projects/meet-people/tests/messaging.test.tsx).

**Browser evidence:** [KNOWN-3-after-1280.png](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots/KNOWN-3-after-1280.png), [KNOWN-3-after-390.png](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots/KNOWN-3-after-390.png).

**Verification:** Fixed and verified; see [independent verification report](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/verify.md).

### KNOWN-4: Failed sends show raw browser errors.

**Summary:** A failed send exposes raw browser network diagnostics.

**Steps:** Run `scratch/lead/messaging-recovery.mjs`. The script loads the real seeded inbox and chat, then injects deterministic API/network failures or an incoming message using Playwright routing. No chat records are changed.
**Expected:** Access loss is explained and disables sending; authoritative inbox polls remove ended chats; new chat messages update previews immediately; network failures preserve the draft and use actionable copy.
**Actual:** A failed send exposes raw browser network diagnostics.
**Evidence:** `screenshots/KNOWN-4-before-390.png` and lead browser output.
**Reproduced:** 2/2 at compact and expanded viewports; independently confirmed from Claude's known-issues list. KNOWN-2 tested in a separate inbox-only pass to isolate it from chat polling.
**Regression:** `tests/messaging.test.tsx`, proven to fail before fixes.

**Fix:** Use actionable connection feedback while retaining drafts and the existing retry request ID; avoid retry advice after access ends.

**Files:** [Feature.tsx](/home/xqiu/Projects/meet-people/src/features/messaging/Feature.tsx).

**Regression coverage:** [messaging.test.tsx](/home/xqiu/Projects/meet-people/tests/messaging.test.tsx).

**Browser evidence:** [KNOWN-4-after-1280.png](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots/KNOWN-4-after-1280.png), [KNOWN-4-after-390.png](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/screenshots/KNOWN-4-after-390.png).

**Verification:** Fixed and verified; see [independent verification report](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/verify.md).

## Nitpicks (P3, not fixed)

- KNOWN-5: missing favicon.
- KNOWN-6: previously loaded messages remain visible after local blocking until reload.
- Minor spacing, artwork measurements, and taste observations were not promoted to functional findings.

## Design questions for you

- After sending a connection request, the candidate can disappear after refresh/checking again. Should sent requests have a persistent management view? This was retained as a product question rather than adding an unsolicited workflow. See [MATCH questions](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/findings/MATCH-questions.md).

## Changes made

| File | Change | For |
| --- | --- | --- |
| [e2e/keyboard-clearance.spec.ts](/home/xqiu/Projects/meet-people/e2e/keyboard-clearance.spec.ts) | Regression coverage | MOBILE-01 |
| [e2e/matchmaking.spec.ts](/home/xqiu/Projects/meet-people/e2e/matchmaking.spec.ts) | Regression coverage | MATCH-01 |
| [src/auth/account.tsx](/home/xqiu/Projects/meet-people/src/auth/account.tsx) | Targeted behavior fix | AUTH-01 |
| [src/auth/authorizedRequest.ts](/home/xqiu/Projects/meet-people/src/auth/authorizedRequest.ts) | Targeted behavior fix | KNOWN-1 |
| [src/features/events/client.ts](/home/xqiu/Projects/meet-people/src/features/events/client.ts) | Targeted behavior fix | EVENTS-01 |
| [src/features/matchmaking/MatchingScreen.tsx](/home/xqiu/Projects/meet-people/src/features/matchmaking/MatchingScreen.tsx) | Targeted behavior fix | MATCH-01 |
| [src/features/messaging/Feature.tsx](/home/xqiu/Projects/meet-people/src/features/messaging/Feature.tsx) | Targeted behavior fix | KNOWN-1, KNOWN-2, KNOWN-3, KNOWN-4 |
| [src/features/prototype/Social.tsx](/home/xqiu/Projects/meet-people/src/features/prototype/Social.tsx) | Targeted behavior fix | AUTH-02, HOME-01 |
| [src/features/prototype/responsive.css](/home/xqiu/Projects/meet-people/src/features/prototype/responsive.css) | Targeted behavior fix | MOBILE-01 |
| [src/routes/PebbleApp.tsx](/home/xqiu/Projects/meet-people/src/routes/PebbleApp.tsx) | Targeted behavior fix | HOME-01 |
| [tests/account-recovery.test.tsx](/home/xqiu/Projects/meet-people/tests/account-recovery.test.tsx) | Regression coverage | AUTH-01 |
| [tests/events-client.test.ts](/home/xqiu/Projects/meet-people/tests/events-client.test.ts) | Regression coverage | EVENTS-01 |
| [tests/matchmaking-integrated.test.tsx](/home/xqiu/Projects/meet-people/tests/matchmaking-integrated.test.tsx) | Regression coverage | MATCH-01 |
| [tests/messaging.test.tsx](/home/xqiu/Projects/meet-people/tests/messaging.test.tsx) | Regression coverage | KNOWN-1, KNOWN-2, KNOWN-3, KNOWN-4 |
| [tests/profile-editor.test.tsx](/home/xqiu/Projects/meet-people/tests/profile-editor.test.tsx) | Regression coverage | AUTH-02 |
| [tests/routes.test.tsx](/home/xqiu/Projects/meet-people/tests/routes.test.tsx) | Regression coverage | HOME-01 |
| [eslint.config.js](/home/xqiu/Projects/meet-people/eslint.config.js) | Exclude local Claude/QA scratch tooling from application lint | QA integration |

Added 29 unit test cases and six browser cases, including controls around cancellation, transient errors, token refresh, identity switches, pagination, safe areas, repeated validation, and delayed messaging responses. Representative regressions were demonstrated failing before their fixes. Independent review reproduced two additional delayed-response races in the initial messaging fix; both received failing-before/passing-after regressions and browser rechecks.

Working-tree diff stat (tracked files; new files listed below):

```text
 e2e/matchmaking.spec.ts                     | 30 +++++++++++
 eslint.config.js                            |  2 +-
 src/auth/account.tsx                        | 52 ++++++++++++++----
 src/auth/authorizedRequest.ts               |  6 ++-
 src/features/events/client.ts               | 27 ++++++----
 src/features/matchmaking/MatchingScreen.tsx | 10 ++--
 src/features/messaging/Feature.tsx          | 61 ++++++++++++++++------
 src/features/prototype/Social.tsx           | 14 +++--
 src/features/prototype/responsive.css       |  1 +
 src/routes/PebbleApp.tsx                    |  4 +-
 tests/matchmaking-integrated.test.tsx       | 29 +++++++++++
 tests/messaging.test.tsx                    | 81 ++++++++++++++++++++++++++++-
 tests/routes.test.tsx                       | 22 ++++++++
 13 files changed, 293 insertions(+), 46 deletions(-)
```

New files:

- [e2e/keyboard-clearance.spec.ts](/home/xqiu/Projects/meet-people/e2e/keyboard-clearance.spec.ts)
- [tests/account-recovery.test.tsx](/home/xqiu/Projects/meet-people/tests/account-recovery.test.tsx)
- [tests/events-client.test.ts](/home/xqiu/Projects/meet-people/tests/events-client.test.ts)
- [tests/profile-editor.test.tsx](/home/xqiu/Projects/meet-people/tests/profile-editor.test.tsx)

## Checks

| Check | Result |
| --- | --- |
| `pnpm typecheck` | Passed |
| `pnpm lint` | Passed |
| `pnpm test` | 320 passed; original baseline was 291 passed |
| `pnpm build` | Passed web and API builds; existing bundle-size advisory remains |
| Full Playwright suite | 121 executed: 102 passed, 19 failed |
| E2E comparison | All 19 failures exactly match Claude's saved baseline; zero new failures |
| New keyboard/preference browser tests | All six passed |
| Browser issue retests | See independent verification report for per-ID evidence |
| `git diff --check` | Passed |

The suite is not fully green: its 19 existing failures remain explicitly recorded in [e2e failures](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/verify/e2e-failures.txt). They were compared with [the preserved pre-fix baseline](/home/xqiu/Projects/meet-people/qa/baseline/e2e-failures.txt) rather than silently ignored. Raw results: [full e2e log](/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1700/verify/e2e.log). The original lint failure came from more than 700 errors in local scratch scripts; those directories now have an explicit lint exclusion.

## Not covered

- Google OAuth, provider-backed matching/embeddings, hosted event ingestion, and background event-group generation were unavailable locally.
- Browser tests used Chromium at simulated phone/tablet/desktop viewports, not physical devices, Safari, or a real mobile keyboard.
- Network, access-loss, incoming-message, and gateway failure fixtures are explicitly identified. Real seeded accounts were used for authentication/profile/preferences checks; injected response tests make no database-proof claim.
- Fictional Home profiles, Community history, and free-time planning remain intentional local fixtures. A sample person's in-memory selection resetting on reload was not promoted to a new persistence requirement.
- This recovers the interrupted run; it does not claim exhaustive coverage of every possible user state.
