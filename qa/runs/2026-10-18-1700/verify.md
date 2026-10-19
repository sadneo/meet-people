# Verification: 2026-10-18-1700

All 10 fixed issues are verified for their reported behavior: 1 P1 and 9 P2. Final typecheck, lint, production build and all 320 unit tests pass. The full browser run completed 121 tests: 102 passed and 19 failed, with every failure matching the existing baseline and **0 new failures**. The final messaging/connection browser subset passed 10/10 after the last race guards.

## Fixed-issue retests

| ID | Result | Verification and evidence |
| --- | --- | --- |
| AUTH-01 | Verified | Real two-device local sessions for `qa-auth-2@example.com`, at 390×844 and 1280×860. Global logout on device B produces the expected account 401 on device A; A clears its local session and returns to a usable email sign-in form with `/profile` retained in returnTo. Direct `/login` also remains usable. [Phone](screenshots/AUTH-01-after-390.png), [desktop](screenshots/AUTH-01-after-1280.png), [assertions/log](scratch/verify/auth-session.log). |
| AUTH-02 | Verified | Grace's saved `morning yoga` and `plant-based cooking` interests appear selected in the profile editor at both viewports. Toggling removes a saved interest from the draft, toggling restores it, and closing/reopening preserves the saved profile. [Phone](screenshots/AUTH-02-after-390.png), [desktop](screenshots/AUTH-02-after-1280.png), [assertions/log](scratch/verify/profile-home-keyboard.log). |
| HOME-01 | Verified | Guest at 390px and read-only frank at 1280px open Aaron from Home and use the profile Back action to return to `/`. The origin also survives reloading the person profile. [Phone](screenshots/HOME-01-after-390.png), [desktop](screenshots/HOME-01-after-1280.png), [assertions/log](scratch/verify/profile-home-keyboard.log). Existing Home/free-time navigation coverage passes in the full suite. |
| MOBILE-01 | Verified | Liam tabs from the top of `/settings` and `/matchmaking` at 390×844. Mornings and On this device are fully visible: focused bottom y764, navigation top y772. [Settings](screenshots/MOBILE-01-after-390-settings.png), [matching](screenshots/MOBILE-01-after-390-matchmaking.png), [assertions/log](scratch/verify/profile-home-keyboard.log). All four new keyboard browser tests pass at 390/768px with 0/24px safe-area allowances. |
| MATCH-01 | Verified | Carol submits the original invalid availability draft twice at each viewport. Each rejection focuses the alert and reveals its complete bounds inside the scrollable dialog; the draft remains intact. Escape closes the dialog and restores Preferences focus. Phone alert y604.53–652.53 within body y158.53–677; desktop alert y610.5–634.5 within body y199.5–658.5. [Phone](screenshots/MATCH-01-after-390.png), [desktop](screenshots/MATCH-01-after-1280.png), [assertions/log](scratch/verify/match-events.log). Both new geometry browser tests pass. |
| EVENTS-01 | Verified | At both widths, an injected HTML 502 produces `Events are unavailable. Try again.` with no parser diagnostics. Removing the injected response and choosing Retry restores the real event detail/group queue; Back to events restores the feed. [Phone](screenshots/EVENTS-01-after-390.png), [desktop](screenshots/EVENTS-01-after-1280.png), [assertions/log](scratch/verify/match-events.log). |
| KNOWN-1 | Verified | Alice's open Bob chat receives an injected poll 403; the composer disables, a closed-conversation explanation appears, and the inbox row is removed at both widths. The compact assertion inspects actual DOM rows, including the CSS-hidden inbox. [Phone](screenshots/KNOWN-1-after-390.png), [desktop](screenshots/KNOWN-1-after-1280.png), [assertions/log](scratch/verify/messaging.log). Unit tests also cover 404. |
| KNOWN-2 | Verified | An inbox-only session receives a server-shaped response with Bob removed. The normal inbox poll removes his row without manual Refresh or navigation at both widths. [Phone](screenshots/KNOWN-2-after-390.png), [desktop](screenshots/KNOWN-2-after-1280.png), [assertions/log](scratch/verify/messaging.log). Loaded-page retention is covered by the passing unit regression. |
| KNOWN-3 | Verified | Injected incoming content appears in the open chat and its inbox preview on the same chat poll at both widths. The compact preview is checked directly in the hidden inbox DOM. [Phone](screenshots/KNOWN-3-after-390.png), [desktop](screenshots/KNOWN-3-after-1280.png), [assertions/log](scratch/verify/messaging.log). Independent race checks retain a newer successful-send preview when an older poll completes. |
| KNOWN-4 | Verified | Aborting only the send POST produces a readable send-failure message, retains the exact draft and removes raw `Failed to fetch` text at both widths. [Phone](screenshots/KNOWN-4-after-390.png), [desktop](screenshots/KNOWN-4-after-1280.png), [assertions/log](scratch/verify/messaging.log). |

All linked after screenshots were visually inspected. Fresh verification scripts are in [scratch/verify](scratch/verify/); before evidence was preserved.

## Checks

| Check | Final result | Evidence |
| --- | --- | --- |
| `pnpm typecheck` | Passed | [typecheck.log](scratch/verify/typecheck.log) |
| `pnpm lint` | Passed | [lint.log](scratch/verify/lint.log) |
| `pnpm test` | Passed: 49 files, 320 tests | [unit.log](scratch/verify/unit.log) |
| `pnpm build` | Passed: typecheck, frontend and API builds | [build.log](scratch/verify/build.log) |
| Full Playwright vs baseline, 2 workers | 121 executed; 102 passed, 19 baseline failures, 0 new failures | [full log](verify/e2e.log), [all failures](verify/e2e-failures.txt), [baseline](verify/baseline.txt), [new failures — empty](verify/new-failures.txt) |
| Final messaging/connection Playwright subset | Passed: 10/10 | [messaging-e2e.log](verify/messaging-e2e.log) |
| Independent messaging race checks | Passed: 4/4 at 390px and 1280px; no database writes | [messaging-races.json](scratch/verify/messaging-races.json) |
| `git diff --check` | Passed | Checked on integrated working tree |

Full-suite command: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 sh .claude/skills/qa/scripts/e2e-vs-baseline.sh qa/runs/2026-10-18-1700/verify --workers=2`. The actual test count, completion summary and failure names were inspected; this was a completed browser run, not a false pass caused by a launch/server failure. The nineteen failures exactly equal the nineteen saved baseline entries; none changed to passing. The browser suite therefore remains non-green for pre-existing reasons.

The full browser run began after integration. Two messaging race guards were finalized during that run; final type/lint/build/unit checks and the 10-test messaging/connection browser subset were run after those final changes. The new guard regressions and the independent four-scenario Chromium race check also pass.

## Regression review

Reviewed the integrated diffs for account-session recovery, profile interest options, profile-return navigation, compact focus scrolling, event transport errors, preferences feedback, shared authenticated error status and messaging polling. No unresolved regression was found in this verification.

The independent review caught two messaging races before final verification: an older chat poll could replace a newer sent preview, and an obsolete successful poll could re-enable a composer after access denial. Final code compares message sequence and rejects obsolete history responses. The corresponding unit regressions pass, as do independent Chromium checks at both widths. Inbox version invalidation also prevents an older in-flight inbox snapshot from restoring state superseded by a local chat update or access loss.

Expected browser diagnostics were kept distinct from regressions: AUTH-01's real account 401 after global logout; EVENTS-01's injected 502; KNOWN-1's injected history 403; KNOWN-4's intentionally aborted POST. These tests had no page errors. Other captured browser noise was the already-known favicon 404. Unit output includes existing jsdom `scrollTo` notices; the build includes its existing nonblocking chunk-size warning.

Early verifier attempts were corrected before final results: accelerated clock timing was replaced with real poll/response synchronization, and compact messaging assertions were changed to inspect hidden inbox DOM rows. The final messaging verification script exits successfully with all eight width/issue results asserted.

## Limits

- Verification used Chromium and the existing local Supabase/app state without resetting the database or restarting services. Real mobile hardware, other browser engines and hosted deployment were not tested.
- AUTH-01 used real local sessions and global revocation. AUTH-02's live check toggled and dismissed an editing draft to avoid changing grace's saved interests; save/persistence behavior is additionally covered by the passing automated account/profile tests.
- Messaging failure, removal and incoming-message states were injected into real local pages reading Alice's existing conversation. Relationships were not actually disconnected and no messages were inserted during these verifier checks. These results verify response handling and UI synchronization, not a new backend disconnection or delivery guarantee. The final messaging script uses actual polling intervals.
- Provider-backed matching, Google sign-in, hosted ingestion and background group proposal generation were not exercised or activated. Candidate scoring is not claimed from route-mocked tests.
- P3 polish and design questions were outside the fixing scope. The 19 existing browser failures remain listed in the baseline.
