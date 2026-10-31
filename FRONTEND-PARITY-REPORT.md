# Pebble frontend parity and QA

Updated October 31, 2026 (America/New_York). Target: `yz/prototype-integration`,
HEAD `f1d3a21`. Reference: **`Pebble-Garden-Asset-Work/Pebble.html`**, read-only.

## Result and ownership

The real React app now follows the finalized prototype across its main screens,
with the existing service clients and private-route guards retained. This work
integrates Yaozhou's Garden artwork, currency icon, unique Mystery Geodes,
inventory/reset behavior and frontend QA fixes. It does not replace teammates'
authentication, matching, messaging, Events or Android implementations with simulations.
The app is suitable for frontend review. **Full backend/deployment acceptance is
still blocked by the local database's older product schema and unavailable services.**

The earlier integration is already in the user's `f1d3a21` work-in-progress commit.
This continuation did not create that commit and has not committed or pushed its
additional fixes. The pre-existing Android IDE change is untouched.

## Why the screenshots differed

The React Garden was a separately styled workspace, not the finalized sky layout.
Its dotted background and controls came from React shell CSS. Copying the artwork
had not transferred the surrounding composition, and stylesheet order let generic
workspace rules win. The source HTML's embedded styles match its adjacent source
styles; the discrepancy was not an old HTML file or a different Garden asset set.

The integrated Garden now has the reference's pale sky, pixel clouds, floating
illustrative islands, forest-green wordmark, cream Build tray, inventory styling
and matching platform projection. Scoped `sky.css` loads after the shell. During
shutdown recovery, a NUL-filled `src/main.tsx` was backed up under
`tmp/frontend-parity/main-shutdown-corruption.bin` and its known entry imports restored.

## Latest GitHub review — reused rather than rebuilt

Remote references were refreshed with `git fetch origin`. Times below are commit
timestamps, not independently verified push times. No branch was switched or merged.

| Branch / commit | Confirmed work and disposition |
| --- | --- |
| `origin/dev` `7a4c32b` | Existing authentication, deployment, public services and native foundation. Still the older frontend baseline. |
| `origin/alt-frontend` `806e09d`; `fix/ui-demo` `3436eed`; `feat/new-matchmaking` `a08442d` | Daniel's React redesign, matching/preferences and search-area UI are the integration foundation. Existing clients and feature contracts retained. |
| `origin/wiring` through `9d132fe` | Reused compatible polling, failed-save reconciliation, message input, event-group status and connection-request feedback fixes. |
| `origin/wiring` `00740c8`, `ab05a54` (Oct 30, 18:01 / 18:09) | Reviewed new onboarding, scoped query caching, readiness/allowance contracts and authentication polish. Reused editable-email/password controls and precise request-limit feedback without replacing the integrated layouts. |
| `origin/wiring` `dde440c` (Oct 30, 23:16; author QuiteKewl), plus `f636e70`/`b25a754` | Reused unchanged-base account/Friends/Dating preference hooks and their session-boundary tests. Reviewed new UUID product prerequisite/projection migrations and deployment tooling; none were applied locally. |
| `origin/feature/android` `3e63c03` and Winson's contributions already in the foundation | Kept native files and frontend API boundary intact; did not rebuild Android or claim device acceptance. |
| Aidan/sadneo deployment/auth history, including `feat/mvp-deploy-final` `44f378d` | Retained callback, real session, recovery and protected-route behavior. Did not change hosting or provider configuration. |
| `origin/yz/prototype-integration` `f1d3a21` | Matches the local committed integration base at the latest fetch. New fixes below remain uncommitted. |

### Significant overlaps still requiring reconciliation

Do not copy all of `origin/wiring` over this tree: its App/Profile/onboarding changes
would discard integrated navigation, Garden and profile-overview work. The newer
query-cache provider, dedicated onboarding journey, request allowance UI, discovery
readiness schemas and UUID product migrations are a coordinated integration, not
independent CSS changes. They are reviewed but **not all incorporated here**.
The current four persisted onboarding chapters and real matching APIs remain.
This report does not claim the working tree contains every feature on `wiring`.

## Screen-by-screen parity

Comparison captures cover 390px and 1280px, including dialogs and editors. Browser
regressions also exercise 320px and other widths. API-unavailable states are kept
honest instead of filling production screens with prototype people and plans.

| Area | Implemented parity / retained interactions | Intentional or unfinished difference |
| --- | --- | --- |
| Public marketing | Reference composition, artwork, Friends/Dating preview toggle, signup navigation, responsive footer. | Preview people are explicitly illustrative; legal pages retain the updated policies. |
| Login / registration | Warm centered layout, wordmark, email-first flow, signup guidance, policy return path, editable email, password reveal controls and recovery links. | Real Supabase confirmation/OAuth/recovery replace prototype shortcuts. Email edits clear password state. |
| Onboarding | Warm narrow layout, interests and availability forms, persisted chapters, age guidance. | Four real saved chapters rather than a one-screen simulated completion. Newer `wiring` onboarding journey remains to reconcile. |
| Navigation / Home | Garden is the signed-in landing screen. Desktop side navigation and mobile five-tab bar follow the reference; route aliases highlight Garden correctly. | Supporting Activity/Matches routes retained; no fake Home statistics. |
| Friends / Dating | Card geometry, tabs, preference sheets, canonical interest editing, age visibility, map-area picker and matching settings. | Real empty/error states and extra backend-supported filters retained. No fabricated recommendations or synthetic production map. |
| Matches / Requests | Prototype tabs and compact hierarchy; separate request screen, real accept/decline/safety actions. | No invented past-plan history or simulated plan creation. Request limits only claim “not sent” for an explicit `request_limit` response. |
| Messages / groups | Responsive inbox/chat, relationship labels from the response, timestamps outside bubbles, pill composer, member sheet and group-search layout. Enter/Shift+Enter/IME behavior retained. | Group consent, uncertain-send handling and actual queue state retained. No fake group leader, rename API, member profile or contact history. |
| Events | Cards, filters, details and group-queue UI styled consistently. Category reset works. | Unsupported prototype time/area/cost filters are not invented. Real queue/proposal controls replace simulated plans. |
| Garden / inventory | Exact transferred artwork, blank platform + Pebble, crisp stepped idle, flowing river, sky scene, Build tray/swipe, drag, fixed landscapes, Undo/view/reset controls and Geode reveal. | Actual local collection count replaces fake weekly activity. Floating islands are illustrative, not another account's saved Garden. |
| Profile | Saved overview, Preview, gear, About you / Interests & availability / adult Dating sections, real photo upload and saved summaries. Editor selection follows URL and browser Back/Forward. | Preview omits private birthdate/full schedule; additional real profile fields remain. |
| Settings | Prototype section hub, compact account/security disclosures, responsive sheets and real settings forms. | Current backend supports fewer notification channels. Session management, export and account deletion are not simulated. |
| Legal / safety | Updated legal text retained; policy navigation and safety receipt UI preserved. | Actual blocking/reporting backend still needs acceptance; frontend tests do not establish moderation operations. |

## Garden guarantees checked

- New browser inventory starts with a blank platform and one central Pebble.
- Garnet, Sapphire, Emerald and Citrine remain direct purchases; the four unique
  geode rocks are Amethyst (sleepy), Rose Quartz (bashful), Aquamarine (surprised)
  and Pyrite (confident). Currency artwork is reused consistently.
- A 300-Pebble geode unlocks one unowned rock. Four purchases collect all four;
  purchases are then disabled. Insufficient funds do not spend/unlock.
- Owned geode rocks can be placed for free. Reset returns them to inventory without
  refunding the unlock price or rerolling ownership. Reload preserves ownership.
- Decoration dragging works immediately after purchase; landscapes remain fixed.
  Reduced motion stops decorative movement. Account-keyed browser state is isolated.
- **Ownership, currency and placements are browser-local, not server-synchronized.**
  Developer currency is a testing tool, not a real earned-reward or payment system.

## Development login: confirmed cause and fix

The error had two independently verified causes:

1. Docker Desktop and the existing Supabase containers were stopped after shutdown.
   Starting Docker Desktop restored the existing containers and data; no reset,
   migration or seed command was run.
2. The credential reader used Unix `getuid()` and mode-0600 checks on Windows.
   Windows uses NTFS access rules, so the valid existing file was rejected before
   authentication. `dev/private-development-file.ts` now validates current-user
   ownership, excludes reparse files and permits only that user, SYSTEM and
   Administrators. Unix permission checks and all loopback/same-origin guards remain.

A third first-use defect was fixed in `dev/provision-development-account.ts`:
provisioning saved one onboarding chapter, while login required all four. It now
performs the four sequential writes, stopping on any failure. A completed account
is preserved. This first-use path is tested with mocked RPCs; the existing account
was tested against real local Supabase without changing its completed profile.

Real browser evidence: `tmp/frontend-parity/dev-login-oct31.json` and
`dev-login-oct31.png`. Clicking **Sign in as dev** returned HTTP 200, opened Garden,
and survived reload. No credential contents are included in this report.

## Validation and evidence

| Check | Result / scope |
| --- | --- |
| Integrated Playwright suite | **142 passed**. Disposable API fixtures; real React interactions, not proof of backend acceptance. `tmp/frontend-parity/browser-oct31-verified.txt`. |
| Focused unit suite | **108 passed** across 9 files. Login permissions/provisioning, session-boundary preference hooks, Garden economy and matching client. Final result in `tmp/frontend-parity/unit-oct31-final.txt`. |
| Production build | TypeScript, web bundle and API compilation passed. Existing large-chunk warning remains. `tmp/frontend-parity/build-oct31-final.txt`. |
| Focused lint | Frontend/Garden/changed hooks and development-login files checked; see `lint-oct31.txt` and `lint-oct31-final.txt`. |
| Visual comparisons | **4 comparison tests + 2 public/auth tests passed**, visually reviewed. Mobile and desktop screenshots of 26 screen/dialog pairs plus onboarding; public/auth separately. `tmp/frontend-parity/screens-oct31-final/` and `public-oct31/`. |
| Real public entry | **1 passed**: signed-out landing, authentication entry, private-route protection and Events response; `tmp/frontend-parity/live-public-oct31.txt`. |
| Actual local accounts | Three existing disposable accounts: real password grants and account reads passed; 15 page visits had no horizontal overflow. `tmp/frontend-parity/real-accounts-oct31/results.json`. |
| Prototype and stash preservation | All 408 original reference-file hashes unchanged; preserved stash unchanged. `tmp/frontend-parity/preservation-oct31.json`. |

The first screenshot run was interrupted by Vite restarting after a dev-login edit;
it was rerun after the server stabilized. A broad canvas locator and incorrectly
encoded punctuation in a copied test were corrected before the 142-test clean run.
Consumer text encoding was also repaired. No production assertion was weakened.
Xuhan's QA helper (`.claude/skills/qa/scripts/qa-browser.mjs`) was used for the real
account and development-login browser checks. Its destructive setup/reset and
output-cleanup scripts were not run. Existing fixture tests were reused; no second
test infrastructure was introduced. Earlier broad lint/unit runs had unrelated
legacy/Windows failures; focused success is **not a guarantee that all CI is green**.

## Unresolved issues and next team work

1. **Backend activation / P1 integration blocker — team/Xuhan:** local migrations
   stop at `20261018160000`; the product-version table is absent. Friends, Dating,
   conversations, safety blocks and active-group status return 503 for all three
   QA accounts. Newer wiring contains explicit product prerequisite/UUID migration
   work. Review that coordinated update and choose a non-destructive development
   activation path; do not substitute a database reset. Real cross-account sends,
   matching, blocks/reports and participation persistence are still unverified.
2. **Frontend reconciliation — integration owner + Xuhan:** incorporate/retest the
   newer cache/readiness/allowance/onboarding changes as a coordinated update,
   preserving the prototype styling and Garden. They are not silently considered done.
3. **Age requirement — team decision:** UI hides Dating under 18 and rejects
   under-13 profile/onboarding saves. Existing Friends backend requires 18 while
   retained policies describe 13+. Resolve with the owners; UI hiding is not a
   substitute for backend enforcement.
4. **Garden persistence — product/backend decision:** browser-local ownership can
   be lost by clearing browser storage and does not follow the user to Android or
   another device. No missing economy API was invented.
5. **Unsupported prototype interactions:** past plans/history, richer Events filters,
   weekly Garden progression, per-channel notification settings, session management,
   data export/deletion and group rename require confirmed services or requirements.
   Existing service-supported alternatives are preserved and styled consistently.
6. **Deployment acceptance:** hosted email/OAuth/recovery, real map-provider behavior,
   production safety, Android packaging/device layout, iOS and load/performance
   acceptance are not established by these local tests. No deployment was attempted.

## Changed files and contributions

Earlier integration (now in `f1d3a21`) includes `src/features/garden/*`,
`public/garden/*`, the integrated currency usage, `src/ui/parity-*.css`, shared
navigation, screen components, `src/main.tsx`, `src/App.tsx`, and focused browser
regressions. The foundation API/shared/schema/native files are teammates' work,
not claimed as Yaozhou's new implementation.

This continuation changes:

- `dev/development-login.ts`, new `dev/private-development-file.ts`,
  `dev/provision-development-account.ts`: Windows-safe local login and complete
  first-use development onboarding.
- `src/features/account/useDetailedSettings.ts`,
  `src/features/matchmaking/useDatingPreferences.ts`,
  `src/features/matchmaking/useFriendsPreferences.ts`: reused QuiteKewl session-boundary fixes.
- `src/ui/Auth.tsx`, `Settings.tsx`, `common.tsx`: text-encoding repairs.
- `tests/browser/login-layout.spec.ts`, `matching-wiring.spec.ts`: precise Garden
  locator, corrected text and extra ambiguous-429 coverage.
- `tests/unit/development-login-server.test.ts`,
  `development-provisioning.test.ts`, new `private-development-file.test.ts`,
  new `preference-session-fence.test.tsx`: permission, provisioning and teammate regressions.
- `docs/DESIGN.md`, `docs/local-development-login.md`, this report and the existing
  integration status link. Supporting local evidence is under `tmp/frontend-parity/`.

The source prototype, original Pebble-Starter, legal worktree, existing legal
content and stash were not edited. No backend/schema/native application changes
were made in this continuation. No commit, push, merge, reset or deployment.

## Open for manual review

From `C:\Users\yaozh\Downloads\CSE 416\meet-people`, run **`pnpm dev`**.
Open **http://127.0.0.1:3000/** (already started during this pass).
Use **Get started → Sign in as dev** for the existing local development account;
Docker/Supabase must be running. Garden lives at `/community` or `/home` after login.
The read-only HTML reference is served separately at
http://127.0.0.1:3199/Pebble.html. Ports 3194 and screenshot fixtures are test tools,
not the manual-review app. Real unavailable backend messages at port 3000 should
not be mistaken for the prototype's simulated completed flows.
