# Pebble integration and QA status

> Historical integration-branch checkpoint. For the simulated latest-dev combination,
> see the merge-readiness report outside this temporary worktree.

> October 31 update: see [FRONTEND-PARITY-REPORT.md](FRONTEND-PARITY-REPORT.md) for
> the current branch review, completed visual pass, Windows development-login fix,
> 142 browser / 108 focused unit passes and remaining backend blockers.
> The dated report below records the earlier integration checkpoint.

October 30, 2026 · `yz/prototype-integration` · uncommitted working tree

## Summary

The redesigned React frontend and Yaozhou's Garden are integrated and ready for team review. This is **not a deployment approval**. The web production build passes, all 113 fixture-backed browser tests pass, and real local login, profile saves and Events browsing were verified. Real matchmaking, messaging and safety testing is blocked by the local backend's older schema. Garden inventory is still browser-local, not a server-backed account economy.

## Foundation and preservation

- At the fetch used for this integration, `origin/dev` and branch HEAD were `7a4c32b` (October 27). The newer team implementation was on `origin/alt-frontend`, `806e09d` (October 30, 02:17 EDT), including Daniel's UI changes and Xuhan's service wiring. These are commit dates, not independently verified push times.
- The reviewed newer implementation was copied into this working tree as the foundation. No Git merge or commit was performed. The broad diff against `dev` includes the team's frontend, service and schema work; it is not all newly authored integration code.
- Earlier integration files and retired screens/tests were preserved under `tmp/prototype-integration/resume/preserved-before-latest/`. The adoption manifest is `tmp/prototype-integration/resume/foundation-manifest.json`.
- All 408 recorded source-prototype files still match their original hashes. The Git stash is unchanged. The separate legal worktree and Pebble-Starter were not modified. Existing legal policy content was retained.
- No database reset, production test, deployment, push or merge was performed. Four disposable local accounts remain; three completed sequential onboarding for this test. No existing accounts were removed. Private test credentials are Git-ignored and must not be shared or included in a PR.

## What was integrated

The app uses the team's latest React navigation, public pages, authentication, onboarding, profile/settings, Events, Friends/Dating and messaging service clients. Existing routes and private-route guards remain in use. Unsupported services show unavailable/error states instead of simulated success.

The Garden now includes:

- The transferred green platform, crisp pixel artwork and cleaned landscape assets. New users start with the platform and one central Pebble, without the dark surrounding shadow.
- Fixed landscape upgrades and draggable decorations, with immediate dragging after purchase, keyboard controls, camera controls, Undo and reduced-motion support.
- Garnet, Sapphire, Emerald and Citrine at 300 Pebbles each.
- Mystery Geodes at 300 Pebbles: sleepy Amethyst, bashful Rose Quartz, surprised Aquamarine and confident Pyrite. Four purchases unlock all four without duplicates; further purchases are disabled.
- Free placement of unlocked Geode rocks. Reset returns them to inventory without refunding their unlock cost or clearing unlock history. Undo cannot reroll a Geode.
- The redesigned currency icon and a visible **Add 1,000 test Pebbles** action in the existing development navigator.
- Account-keyed local storage. Reloading retains progress in this browser; switching accounts does not display the other account's inventory. This is not cross-device persistence, secure ownership or a real earning system. Clearing browser storage loses it; browser storage can be edited by its user. No Garden API was invented.

## Confirmed integration bugs fixed

| ID | Priority / type | Reproduction and actual behavior | Fix and verification |
| --- | --- | --- | --- |
| INT-01 | P1 · integration | Open Garden on Windows: the team's `Garden.tsx` wrapper collided with `garden.js` during module resolution. Garden should load. | App imports the integrated renderer directly; compatibility wrapper is `GardenPage.tsx`. Build and Garden browser tests pass. |
| INT-02 | P2 · interaction | On mobile, click Build after closing the development navigator: its invisible container intercepted the click. | Only the visible navigator controls receive pointer events over Garden. Garden/navigation tests passed twice, followed by the complete 113-test run. |
| INT-03 | P2 · layout | Open Garden at 390px: inherited negative margins clipped the heading/edge. | Adapted Garden sizing to the team's shell. Desktop/mobile screenshots inspected; overflow checks pass. |
| INT-04 | P2 · stated age-visibility requirement | Use a saved under-18 profile and open Discover, Profile Dating links, settings and Requests: Dating controls remained visible. | Added shared frontend age visibility; direct links do not mount the Dating view for minors. Reproduced before the fix, then verified with the regression test and a real local minor account. This does not prove backend age enforcement. |

The new age test initially mutated a shared fixture and affected subsequent tests. That test isolation issue was corrected; the final full run passes without changing service assertions.

## Test results

| Check | Result | What this establishes |
| --- | --- | --- |
| `pnpm build` | PASS | TypeScript, production web bundle and API compilation. A large-JavaScript-chunk warning remains. |
| Android-mode Vite web build | PASS | Web assets build in Android mode. No Capacitor sync, APK, emulator or physical-device acceptance test was performed. |
| Complete browser suite | **113 passed** | Mocked/fixture-backed contracts, navigation, authentication states, profile/settings, Friends/Dating, messaging/safety states, Events and Garden. These are not real backend acceptance results. |
| Repeated Garden + developer navigation | **10 passed** | Two repetitions covering desktop/mobile purchase, drag, Undo, unique unlocks, reset, reload, fixed landscape, account separation and reduced motion. |
| Additional visual/overflow checks | **2 passed** | Eight routes at 390px and 1280px, no page exceptions or horizontal overflow. Screenshots captured; representative Garden, Discover, chat, Events and real Profile images inspected. |
| Unit suite | **458 passed, 3 failed** | Includes five passing Garden economy tests. Failures: Unix `sh` dependency in worker deployment test; `process.getuid` unavailable on Windows; SQL source-comparison test assumes LF line endings. These failures are outside the Garden integration; they must not be presented as a green full suite. |
| Focused integration lint | PASS | Garden, changed age-visibility screens, App, development navigator and added/adjusted tests. |
| Broader application/test lint | FAIL · 852 errors | Includes retained `src/alt` browser-global scripts, existing hook/ref rules and backend/test lint issues. No rules were disabled to conceal failures. Root `pnpm lint` also scans preserved/untracked material, so it is not claimed green. |
| `git diff --check` | PASS | No tracked-diff whitespace errors. |

### Real local backend tests — no response mocks

Used local Supabase and the real Express API with disposable accounts, through Xuhan's `qa-browser.mjs` helper and targeted API requests.

- Supabase signup created local accounts. Confirmation was required; only these disposable accounts were confirmed administratively for further testing. This does **not** verify email delivery or clicking a confirmation link.
- Two adults and one minor saved the four onboarding chapters sequentially; readback confirmed completed profiles for all three. An initial attempt to submit all chapters at once correctly failed; the runner was corrected to follow the actual flow.
- Real email/password UI login, signed-out marketing, private-route protection and logout passed.
- A signed-in account purchased a Geode with development currency and reloaded successfully. Only browser-local Garden persistence was established.
- Real Events listing rendered existing local test data. Signed-out Music, Food and Outdoors filtering, pagination and opening event details passed. Signed-in Events pages also rendered for the three accounts. No production data was used or inserted.
- Real Friends/Dating, conversation and safety requests returned HTTP 503/unavailable. Connection attempts in both directions, blocking and reporting could not complete. No real message delivery or cross-account safety guarantee is claimed.

The earlier read-only database inspection found migrations applied through `20261018160000`, with the newer Friends/Dating namespaces absent. The repository contains ten later October 28–30 feature migrations. No migrations were applied during QA. **At the final follow-up, Docker's local engine was no longer reachable**, so the successful results above describe the completed run, not a claim that the local stack is currently running.

## Remaining blockers and ownership

| Priority | Responsible teammate(s) | Issue / next action |
| --- | --- | --- |
| P1 · environment blocker | Aidan + Xuhan, Daniel for retest | Bring up a safe development backend with the reviewed schema, service capabilities and workers. Reconcile the canonical schema instructions with the newer migrations without resetting existing data. Repeat two-account matching, connection, messaging, block/report and event-group tests. Code presence alone does not establish deployed functionality. |
| P1 · product/policy decision | Daniel + Xuhan + Yaozhou | Friends SQL explicitly says this version is 18+ (`20261028000200_friends_discovery.sql`; active Friends also restricts adults), while the retained policies say Friends 13+/Dating 18+. Friends age filters also begin at 18. Decide the intended release rule and align implementation and policies; this integration did not silently relax backend restrictions. |
| P1 · missing age requirement | Daniel + Xuhan | Onboarding's birthdate check requires a past date but does not establish a 13+ minimum (`src/ui/Profile.tsx`, shared account/profile validation). Agree on and implement the admission rule, then test boundary birthdays and direct API writes. The minor UI fix is not a substitute. |
| P1 if durable Garden ownership is promised | Yaozhou + backend owner to be assigned | Garden has no server ownership/reward contract. New accounts have zero currency; development grants are only for tests. Define earning, authoritative ownership and migration/sync before promising durable or cross-device collections. Alternatively explicitly approve this as a local-only creative feature. Storage-write failure feedback also needs a follow-up; current state emits an event but has no visible listener. |
| P2 · validation debt | Relevant test owners / Xuhan | Resolve Windows-specific unit-test assumptions and the broader lint failures, then rerun CI on the actual target environment. Do not report CI as guaranteed to pass. |
| Release validation | Aidan + Winson | Verify production email/signup, Google sign-in, deployment environment, map configuration, photo storage/access, workers and Android device/deep-link behavior. Android web bundling is not an APK test. |

Backend-dependent features not accepted in this run include real matchmaking persistence, message exchange/read receipts between accounts, blocking enforcement, moderation delivery, event-group matching, photo upload/access and configured Google search-area selection. Browser fixtures cover relevant frontend states but cannot close these gaps.

Optional spacing and visual preferences were not redesigned. Earlier framework known issues were reviewed, not automatically assumed to still reproduce on this new frontend. Existing-message visibility after blocking remains unverified with a working backend.

## Xuhan QA workflow used

Read the skill, area checklists, severity rubric, known issues, role instructions and scripts. Used the real browser helper, area-based review, reproduced findings, targeted fixes and browser retests. Reused the team's current browser suite instead of restoring obsolete screen tests.

Safety adaptations: no database reset, session-directory deletion, destructive baseline cleanup, Git staging/merging or isolated-worktree patch workflow. Earlier reports were preserved; this file is the final handoff. Earlier parallel review contributed findings, but the final verification was performed by the lead; no separate final verifier-agent approval is claimed. Earlier reports do not supersede the final results here.

## Changed files and evidence

Integration-specific files beyond the fetched team foundation:

- `src/features/garden/{Garden.tsx,art.ts,art-data.json,community-placement.ts,economy.ts,geodes.ts,icons.tsx,reducer.ts,state.ts,garden.css}` and `public/garden/` artwork.
- `src/App.tsx`, `src/ui/GardenPage.tsx`, `src/ui/DevelopmentNavigator.tsx`.
- `src/ui/{age-visibility.ts,Discover.tsx,Profile.tsx,Settings.tsx,Requests.tsx}`.
- `tests/unit/garden-integration.test.ts`, `tests/browser/{garden-integration.spec.ts,integration-age.spec.ts,wiring.spec.ts}`.
- `vite.config.ts`, `vite.isolated.config.ts`: retain watch exclusions for source copies/archives on Windows.
- `docs/DESIGN.md`, `docs/UI-PLAN.md`: correct Garden location and local-persistence behavior; this status report.
- Local-only verification scripts, logs, screenshots and credential-ignore rule under `tmp/prototype-integration/`. Do not blindly stage this folder or the preserved source copies.

The broad team-snapshot adoption is listed in [foundation-manifest.json](tmp/prototype-integration/resume/foundation-manifest.json). The working-tree path list is [working-tree-status.txt](tmp/prototype-integration/resume/working-tree-status.txt); it was captured before this report was added.

Final evidence under `tmp/prototype-integration/resume/`:

- `browser-accepted.txt`, `garden-verified.txt`, `visual-accepted.txt` and corresponding screenshot directories.
- `build-accepted.txt`, `android-web.txt`, `unit-1.txt`, `lint-focused-accepted.txt`, `lint-scoped-all.txt`, `diff-check.txt`.
- `live-sequential-results.json`, `real-ui-results.json`, `real-events-results.json`, `live-screenshots/`.
- `preservation-check.json`: source hashes, unchanged stash and branch verification.

### Next steps for the team

1. Review this uncommitted integration and the age-rule/Garden-storage decisions.
2. Have Aidan/Xuhan prepare the safe backend and document its schema and enabled capabilities. Do not run a destructive reset against this database.
3. Repeat real two-account flows and record successful server readback and access-denial results. Recheck Events groups and photo/location services.
4. Resolve lint/unit blockers, then have Winson test the Android build on a device and Aidan verify deployment configuration. Only then decide whether to deploy.

For frontend-only reproduction, the run used `pnpm exec playwright test -c tmp/prototype-integration/playwright.config.ts --output=<a-new-output-directory>`. Production compilation uses `pnpm build`. Start Docker/local Supabase before real-service testing; the browser suite's fixtures do not require or prove that backend.
