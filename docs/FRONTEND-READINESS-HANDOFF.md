# Matchmaking, Profile and Settings frontend handoff

2026-10-19. Worktree `reconciled-ui-baseline`, branch `feat/reconciled-ui-baseline`, HEAD `5234604ebffd043d3b02653abca8cbfb07f43446` plus uncommitted UI changes. This supersedes the implementation-status gaps in the earlier audit. No backend/API/schema/configuration/deployment work is included.

**Subsequent backend-sprint supersession for optional owner facts only:** education,
occupation, languages and visibility now have canonical owner resource integration,
enabled only after a valid authenticated GET. Missing backend stays unavailable;
facts no longer use Apply preview or React-memory fallback. The inventory below
records the earlier UI-only handoff. Picture, Settings and public-viewer limitations
remain; see `profile-details-backend.md` for current contracts, parent-reported
offline SQL evidence, frontend verification limits and existing DB activation gate.

**Subsequent Detailed Settings integration:** categories and Friends/Dating
discovery preferences now use their separate versioned owner GET/PUT resource,
with explicit readback/CAS and reconciliation. Server default-off values replace
the former memory-preview defaults; absent backend stays unavailable. Saving
preferences does not verify delivery or live discovery enforcement. Only picture
preview remains in `AccountUiPreviewProvider`; safety stays unavailable. See
`settings-safety-backend.md` for current integration and parent-reported evidence.

## Product rules confirmed by the owner

- One global interest catalogue/selection and one global weekly schedule. Explicit Profile and Friends saves update the shared source in both directions. They are not separate temporary-search copies.
- Active matching takes priority and turns downtime off. No automatic downtime resume.
- One global picture and bio. Photo galleries and Dating-specific photo/bio overrides are deferred.
- Education, occupation and languages are optional shared Profile facts with visibility controls.
- Own gender plus sexuality resolves clear Dating targets. The owner approved a brief matching clarification for combinations that do not resolve targets. This clarification is not a change to identity or field visibility.
- Friends remains a real queue with manual checking and at most one candidate. Never invent groups/lobbies, completed matches, presence or rewards. Existing Messaging/Connections contracts are unchanged.
- Dating remains a local prototype, with the exact disclosure: “Local prototype recommendations — not live Dating matches.” No Dating APIs, storage, persistence, query filtering or matching mutations were added.

## Feature-by-feature frontend inventory

| Feature | Implemented frontend behavior | Current integration boundary |
| --- | --- | --- |
| Name, bio, birthdate and home | Existing canonical Profile form and readback retained; future/invalid dates rejected in the edit/onboarding form; DOB private and age calculated | Existing identity/profile contracts; authoritative adult eligibility still required |
| Interests | One catalogue, 30 selections and 120-character custom labels; saved case/spacing/newlines preserved; canonical Profile ↔ Friends synchronization tested | Existing shared-profile save path |
| Weekly availability | Shared coarse/exact editor, partial cells, midnight/custom windows, validation and explicit save/cancel preserved; draft caption corrected | Existing shared-profile path, America/New_York wall time |
| Education / occupation | Optional 120-character fields, owner summary, per-field visibility, draft/cancel/apply | Explicit React-memory preview; new resource contract needed |
| Languages | Add/remove up to 12 unique languages, 60 characters each, case-insensitive duplicate prevention, optional visibility | Explicit React-memory preview |
| Profile picture | One JPG/PNG/WebP up to 5 MB; file read/decode/error/loading, remove/cancel/apply and owner preview | Nothing uploaded or persisted; no object-storage endpoint invented |
| Public profile preview | Own name/age/home/bio/picture, visible optional facts only; no private DOB | Illustrative local preview, not proof of live public redaction |
| Friends filters | Integer distance 1–100, adult age 18–99, independent handles, equal ages, draft/reset/cancel; Apply filter preview retains local values within that component | No numeric filter API or queue payload change; preview does not affect real search |
| Friendship goals | Multi-select options plus retained existing goals, seeded from existing account intents, with draft/cancel | Goals are part of the disclosed filter preview; no goal write piggybacked into profile |
| Temporary search area | Separate home/temporary source, text validation, reset by choosing Home, Profile link; per-mode drafts | No coordinates measured and home never overwritten; geospatial contract needed |
| New friend count | Existing 1–3 presentation selector retained and honestly disclosed | Real results still max one; no group-session implementation |
| Dating identity/details | Fixed identity enums + Other, relationship intentions/style, optional height in feet/inches including zero, visibility opt-in, one sheet and one action | Component-memory only; no live account write |
| Dating compatibility clarification | Clear mappings shown; other combinations conditionally ask genders to meet; choices reset when identity changes; reciprocal requirement explained | Fixture recommendations do not change; no real scoring/eligibility implied |
| Dating legacy identity | Existing custom label can display as “Other — existing label kept” and remain intact until explicitly changed | UI draft preservation only; real stored-data migration still requires canonical contract |
| Mobile sheet dismissal | Pull down 100px from handle/header at scroll top; shorter/cancelled pull snaps back, draft discarded on dismissal, focus restored; no interference with form scroll | Friends and Dating; pending guard and reduced motion preserved |
| Notifications | Existing persisted master switch retained; message, plan and match-update category previews, dirty/cancel/apply feedback, device permission status | Categories do not send notifications; no delivery API or permission request |
| Discovery | Existing persisted global switch retained; separate Friends/Dating preview choices, disabled under global-off; Dating preview default off | No query enforcement or actual activation claimed |
| Location access | Read-only browser permission status, denied/unsupported/error/fallback wording, refresh status; home/nearby/radius kept separate | No coordinates read, geolocation requested, or remote service contacted |
| Downtime | Existing confirmed queue opt-in, active replacement consent, error/reconciliation and status retained; copy/link to shared Friends preferences | Existing one-queue contract; background does not restart automatically |
| Blocked users | Unavailable/loading/error/empty/list, unblock confirmation, pending lock, failure/readback reconciliation and cross-resource isolation | Optional `BlocklistAdapter`; production has no adapter, so it shows unavailable, never an invented empty list |
| Candidate safety | Block/report entry, reason/context form, clear unavailable action and no false success | Actual block/report submission disabled until service exists |
| Credentials / logout | Existing session/credential management, confirmation/recovery/error and logout behavior retained | Existing Auth UI; no provider/configuration modifications |
| Queue/session state | Existing join/check/cancel/replacement and uncertain-outcome handling retained; candidate safety controls added | Existing single-candidate contract; group/ready states deliberately not invented |
| Balance / purchases / rewards | No profile controls added; existing economy left untouched | Wallet/inventory are outside this frontend scope |

## Ownership and state boundaries

`AccountUiPreviewProvider` is keyed by the current actor in the existing shell. It owns only new unsupported optional facts, picture preview and detailed Settings choices. These values have no localStorage/sessionStorage keys, events or API writes and reset on reload/tree replacement/account switch. Facts, picture and detailed Settings explicitly say Apply preview and describe their lifetime. Existing shared identity/interests/week and master Settings retain the established canonical save/readback flow; unsupported fields are never added to that legacy payload.

Friends numeric/search drafts belong to its mounted page and are independent of Dating's drafts. Closing a sheet discards unsaved edits. Reset in the sheet changes distance/age only, leaving personal details/goals/area untouched. Choosing Home explicitly clears the temporary area. Profile edit, facts, photo and detail forms have cancel semantics. Existing mandatory account/onboarding gates remain ahead of all private routes; no preview route or production guest bypass was added.

`BlocklistPanel` receives an optional authenticated adapter with `read(signal)` and `unblock(id, signal)`. The resource child remounts when that adapter changes. Operations abort/fence late reads; a completed unblock is not removed until readback confirms absence. Production does not wire a fake adapter. Browser tests inject fictional data into a render-only component fixture, not an app route or live service.

## Dating target rules for the backend handoff

The UI directly resolves:

| Own gender | Sexuality | Target shown |
| --- | --- | --- |
| Man | Straight | Woman |
| Woman | Straight | Man |
| Man | Gay | Man |
| Woman | Gay | Woman |
| Woman | Lesbian | Woman |

Other combinations—including Nonbinary/Other, Queer, Questioning, Asexual, Bisexual and Pansexual—ask the owner to clarify using the supported gender choices. No binary fallback or automatic identity coercion. Empty identity/clarification remains incomplete for real activation, though a local draft can be kept. Both people's eventual compatibility rules must admit each other. Visibility never determines eligibility or consent. Clarified targets are cleared when own gender/sexuality changes. Existing custom labels are retained safely in drafts; the actual migration and public data model remain backend work.

The UI explains that real Dating requires age 18+. A known underage/missing-birthdate account sees an unavailable eligibility explanation; local fictional-card preview is not real activation. Global onboarding policy was not changed to an adult-only application. Backend must reject future/invalid dates and enforce its approved adult Dating policy independently of slider limits or client controls.

## Backend contracts still required

These are required behavior/domain contracts, not implemented endpoints or proposed database migrations:

1. **Global optional facts and visibility**: owner read/update plus public redacted response, defaults, field length/enum/version validation and conflict handling. Bind read/write to the signed-in actor. Apply facts/visibility together or disclose partial outcomes; never serialize unsupported keys into the current strict account schema.
2. **Picture upload**: authenticated size/type/content validation, storage ownership/cleanup, metadata handling and canonical avatar readback. The local data URL is not a canonical avatar URL and must never be sent to the current HTTPS-only profile field. One global picture is enough.
3. **Friends/Dating search preferences**: independent saved numeric bounds, goals and temporary area source/location resolution. Current queue join accepts mode only. Do not enable real filter claims until the saved revision is consumed by matching. Preserve global interests/week, and define how changes during a session affect the active search.
4. **Dating profile and search scopes**: canonical relationship/identity/height/visibility and matching clarification. Persist exact integer total height inches (not competing feet/inches/cm sources); legacy conversion/enum migration must preserve owner data. One UI action needs atomic/coordinated save/readback across the two domains, with no success on partial/uncertain failure.
5. **Detailed Settings**: category preferences, global/mode discovery precedence and opt-in semantics, actual channel/device permission integration and public redaction. Saving a boolean is not proof of delivery or privacy enforcement. Default-off downtime and active priority must stay explicit.
6. **Safety**: authoritative blocklist read, block/unblock/report mutation and reconciliation, mutual exclusion from discovery/matching/contact, moderation receipt/error states. Never substitute sample-local blocks or fabricate a report receipt.
7. **Matching sessions**: keep current mode-only/single-candidate behavior until the separate group/member/ready state contract exists. The visible 1–3 preference is not evidence that such a service exists. No rewards, presence or auto-results should be inferred.

Account security, rate limiting, authorization, privacy/eligibility enforcement, delivery, geospatial matching and migrations require backend verification. No such verification or implementation is claimed here. Campus timezone remains America/New_York; switching area does not silently convert schedules.

## Changed paths in this implementation pass

Frontend additions:
- `src/features/account/AccountDialog.tsx`, `AccountUiPreview.tsx`, `account-ui-preview-context.ts`, `ProfileDetails.tsx`, `SafetyControls.tsx`, `SettingsDetails.tsx`, `profile-rules.ts`, `global-interests.ts`, `account-preferences.css`.
- `src/features/matchmaking/SearchPreferenceFields.tsx`, `search-preferences.ts`, `dating-preferences.ts` and extension of the prior `DatingPreferenceFields.tsx`/`MatchFilterSheet.tsx`/`match-filter-sheet.css`.

Integration updates: account `OwnerProfile.tsx`/`ProfileEditDialog.tsx`; matching `MatchingScreen.tsx`/`MatchingViews.tsx`/`FriendsPresentation.tsx`/`dating-views.css`; prototype `Social.tsx`/`ProfileInterests.tsx`; `src/routes/PebbleApp.tsx` only adds the actor-keyed preview provider, not new navigation or route access.

Focused test updates: `tests/frontend-preference-rules.test.tsx` (new), `tests/{account-profile-ui,shared-user-profile,find-friends,friends-presentation,profile-creation,registration-onboarding}.test.tsx`; `e2e/account-matchmaking-readiness.spec.ts` (new), `e2e/{profile-unification,friends-light-theme,friends-visual}.spec.ts` and `shared-profile-fixture.ts`. Existing unrelated uncommitted baseline-continuation files remain retained; do not treat them as new changes from this pass.

Documentation: `docs/DESIGN.md`, `docs/UI-PLAN.md` light-Friends/ownership alignment, historical audit cross-reference and this handoff. Canonical Obsidian context/index updated during Profile work, during final verification and at completion. No commit/push/PR, remote change, protected-worktree access, forbidden path/environment/credential read/edit or external-service operation in this pass.

## Actual visual review

Inspected rendered PNGs from isolated Chromium, not source CSS alone:
- 320px education/work/languages editor and Profile picture, 1440px Profile details/public/picture preview; private main edit dialog with initial focus.
- 320px Friends filter/goals/temporary area and Dating clarification/height states; desktop equivalents generated and layout-tested.
- 320px Settings detail labels/checkboxes corrected after visual review, desktop Settings/location, blocklist unavailable.
- Mobile/desktop safety confirmation, rejected unblock, empty list and disabled report form using clearly fictional render-only test data.
- 390×420 dialog/action reachability; compact/expanded 800px boundary, artwork/queue/navigation regressions are exercised by the existing focused browser suites.

Screenshots are under ignored `worktree/friends-light-review/results/` and `worktree/friends-light-review/existing-visual/`. Later test runs can replace results. No raster artwork bytes were changed. A DOM-only test cannot establish native touch hardware or backend behavior; physical-device touch and native browser zoom remain unverified.

## Verification

Final broad regression results: 118 focused unit tests / 12 files passed, and 58 scoped browser tests passed. The later component-only run adds a long-interest wrapping check. Earlier audit failures were reconciled with the current form architecture, while preserving real shared-write behavior and all onboarding/readback assertions. Focused lint on all new preference/dialog/model modules completed with zero warnings/errors after separating React components from domain constants/helpers. Full `pnpm build` was not run: it includes backend build work, outside this UI-only pass. Full test/lint suites include unrelated/backend surfaces and were not run. Tests use isolated mocked Auth/APIs and block external traffic; no live sign-in or successful backend action is implied.


Exact commands (all from the reconciled worktree):

```text
pnpm --config.verify-deps-before-run=false typecheck
PASS

git diff --check
PASS

pnpm --config.verify-deps-before-run=false exec vitest run --configLoader runner --config vite.isolated.config.ts --environment jsdom tests/frontend-preference-rules.test.tsx tests/shared-user-profile.test.tsx tests/account-profile-ui.test.tsx tests/dating-views.test.tsx tests/find-friends.test.tsx tests/match-filter-sheet.test.tsx tests/unified-account-readback.test.tsx tests/profile-readiness.test.ts tests/profile-interests.test.tsx tests/friends-presentation.test.tsx tests/registration-onboarding.test.tsx tests/profile-creation.test.tsx
118 tests passed / 12 files

pnpm --config.verify-deps-before-run=false test:e2e --config worktree/friends-light-review/playwright.config.ts e2e/account-matchmaking-readiness.spec.ts e2e/profile-unification.spec.ts e2e/settings-downtime.spec.ts e2e/settings-account-actions.spec.ts e2e/dating-reference.spec.ts e2e/friends-light-theme.spec.ts e2e/friends-visual.spec.ts
58 tests passed

pnpm --config.verify-deps-before-run=false exec eslint src/features/account/AccountDialog.tsx src/features/account/AccountUiPreview.tsx src/features/account/ProfileDetails.tsx src/features/account/SafetyControls.tsx src/features/account/SettingsDetails.tsx src/features/account/profile-rules.ts src/features/account/account-ui-preview-context.ts src/features/account/global-interests.ts src/features/matchmaking/SearchPreferenceFields.tsx src/features/matchmaking/DatingPreferenceFields.tsx src/features/matchmaking/dating-preferences.ts src/features/matchmaking/search-preferences.ts
PASS; zero errors/warnings
```

Test reconciliation was behavioral, not simply deleting assertions: shared edits now run through Find Friends and are read back on Profile; numeric filter preview makes no profile writes. First-profile creation checks shared selections in the inline Friends form rather than the replaced filter editor. The onboarding fixture now acknowledges the existing read-only conversation-activity call after entering the private shell, while still requiring exactly four account writes and no queue/result/status actions. Saved custom interest spacing is asserted exactly even though accessible names collapse whitespace.

Initial implementation/test issues (optional birthdate validation, autofocus return, label specificity, repeated-drag timing, module interop in render-only fixtures, and pre-existing outdated test expectations) were corrected before the passing runs. Latest screenshots were inspected after the visual label-layout correction. No passing result is claimed for the full repository suite or live integration.


Additional final component check after the same source changes:

```text
pnpm --config.verify-deps-before-run=false test:e2e --config worktree/friends-light-review/playwright.config.ts e2e/account-matchmaking-readiness.spec.ts
10 tests passed
```

This overlaps the broader 58-test run; counts are not additive. It includes the later 320px 120-character shared-interest wrap case. Inspected its Profile/Friends captures and the short-screen facts/filter action captures. Final branch/HEAD and status/diff were inspected; all source changes stay within matchmaking/Profile/Settings, their minimal preview-provider integration, focused tests and documentation. Backend connection is the next phase; current unsupported actions remain preview/unavailable by design.

## Pending combined frontend checkpoint / onboarding assertion repair

Current approved worktree `/home/Danuu/Projects/meet-people-worktrees/reconciled-ui-baseline`,
branch `feat/reconciled-ui-baseline`, HEAD
`f27f5b0f374787ad3f2b2baaa8f97bd25d400070`. Earlier inventories/results above are
historical, not fresh execution evidence for the current combined tree. In particular,
canonical owner facts and Detailed Settings supersede their old preview inventory
rows; picture alone remains in the preview provider. Public-viewer enforcement,
delivery/live discovery and safety remain unverified/unavailable as documented.

Parent reports final Settings review accepted the source slice with no material
findings, **63 units / seven files and 17 browser tests passed**, both typechecks
and diff passed. Parent's subsequent broader pending-checkpoint run reported
**175 passed / one failed across 19 suites**. The failure was
`tests/registration-onboarding.test.tsx:176`, not a readiness-policy failure:
`getByRole('alert')` found both the expected inline readiness rejection and a
legitimate unavailable optional-facts alert. That test's mocked transport has no
profile-details support; the canonical facts hook honestly presents unavailable.

The bounded repair imports the existing `readinessMessage` and selects that exact
text on an element with `role="alert"`. It retains the removal of one of three
interests, save attempt, zero PUTs and complete persisted readiness assertions.
No facts error is removed/mocked away, no minimum is relaxed, and no runtime source
or fixture behavior changes. Only this test and this evidence/manifest section
are changed in this repair.

### Dependency-coherent path groups in the current dirty inventory

These are review/checkpoint groups, NOT staging or commit operations. Preserve
all of them if the parent chooses the combined prior-frontend + owner-facts +
Detailed Settings checkpoint. They are not independent cherry-pick units: the
existing screen integrations import the new modules. Paths below cover the
tracked and untracked status inventory inspected for this repair; unchanged,
already-checkpointed shared/API contracts are prerequisites from HEAD, not new files.

**Existing transport/polling dependencies:** the already-tracked Connections and
Messaging clients import the untracked authorized request module; do not omit it
merely because it is not Settings-specific. The polling helper has consumers in
Connections, Messaging, matchmaking and Events; retain its compatible signature.

```text
src/auth/authorizedRequest.ts
tests/authorized-request.test.ts
src/features/matchmaking/useVisiblePolling.ts
```

**Shared account shell, catalog/rules, local picture and unavailable safety UI:**

```text
src/features/account/AccountDialog.tsx
src/features/account/AccountUiPreview.tsx
src/features/account/account-ui-preview-context.ts
src/features/account/account-preferences.css
src/features/account/profile-rules.ts
src/features/account/global-interests.ts
src/features/account/SafetyControls.tsx
src/features/account/OwnerProfile.tsx
src/features/account/ProfileEditDialog.tsx
src/features/prototype/ProfileInterests.tsx
src/features/prototype/Social.tsx
src/routes/PebbleApp.tsx
```

**Canonical optional owner facts (requires the shared account integration above):**

```text
src/features/account/ProfileDetails.tsx
src/features/account/profile-details-client.ts
src/features/account/useProfileDetails.ts
tests/profile-details-client.test.ts
tests/profile-details-hook.test.ts
tests/profile-details-ui.test.tsx
```

**Canonical Detailed Settings (requires Social/account integration and shared CSS):**

```text
src/features/account/SettingsDetails.tsx
src/features/account/detailed-settings-client.ts
src/features/account/useDetailedSettings.ts
tests/detailed-settings-fixture.ts
tests/detailed-settings-client.test.ts
tests/detailed-settings-hook.test.ts
tests/detailed-settings-ui.test.tsx
```

**Friends/Dating presentation, shared preferences and disclosed local filter drafts:**

```text
src/features/matchmaking/FriendsPresentation.tsx
src/features/matchmaking/MatchingScreen.tsx
src/features/matchmaking/MatchingViews.tsx
src/features/matchmaking/DatingPreferenceFields.tsx
src/features/matchmaking/MatchFilterSheet.tsx
src/features/matchmaking/SearchPreferenceFields.tsx
src/features/matchmaking/dating-preferences.ts
src/features/matchmaking/search-preferences.ts
src/features/matchmaking/dating-prototype-fixtures.ts
src/features/matchmaking/dating-views.css
src/features/matchmaking/friends.css
src/features/matchmaking/match-filter-sheet.css
```

**Cross-surface frontend regressions (including this assertion repair):**

```text
tests/account-profile-ui.test.tsx
tests/dating-views.test.tsx
tests/find-friends.test.tsx
tests/friends-presentation.test.tsx
tests/profile-creation.test.tsx
tests/registration-onboarding.test.tsx
tests/shared-user-profile.test.tsx
tests/frontend-preference-rules.test.tsx
tests/match-filter-sheet.test.tsx
```

**Synthetic browser fixtures and presentation/readback coverage:**

```text
e2e/shared-profile-fixture.ts
e2e/account-matchmaking-readiness.spec.ts
e2e/detailed-settings.spec.ts
e2e/dating-reference.spec.ts
e2e/friends-light-theme.spec.ts
e2e/friends-visual.spec.ts
e2e/page-canvas.spec.ts
e2e/profile-unification.spec.ts
```

**Design, historical audit, superseding handoff and Settings evidence:**

```text
docs/DESIGN.md
docs/UI-PLAN.md
docs/MATCHMAKING-PROFILE-READINESS-REVIEW.md
docs/FRONTEND-READINESS-HANDOFF.md
docs/settings-safety-backend.md
```

### Fresh verification limits and next parent checks

Agent attempted this smallest allowed regression; it returned **Permission denied:
shell**, not a test result:

```text
pnpm --config.verify-deps-before-run=false exec vitest run --configLoader runner --config vite.isolated.config.ts --environment jsdom tests/registration-onboarding.test.tsx
```

`git diff --check` passed after the assertion repair; final whitespace/status checks
are reported in the completion response. `git diff --stat` was inspected but excludes
untracked files; it is not the dependency-complete manifest or execution evidence.
No fresh unit/typecheck/browser run succeeded in this repair. Parent will rerun the
broad 176-test selection, both typechecks and chosen browser suite before checkpoint.
The exact 19-suite selection and fresh broad browser coverage were not supplied;
do not assume every listed path/consumer is covered by the previous 63/17 results.
In particular Connections/Messaging/Events polling integration, full page-canvas/
Dating/Friends visual coverage, current screenshots and full repository build/lint/
test coverage are not newly verified here. Historical visual passes above do not
substitute for current-tree execution or inspection. No live Auth/PostgREST, public
redaction, real delivery/discovery, full safety/races, native-device behavior or DB
activation is established. Downtime remains last and unchanged; Dating stays prototype.

Initial/final tree remains intentionally dirty; prior work is preserved. Parent
owns staging/commits. No Git mutation, secret/environment access, provider/network
request, DB/Supabase action, service operation, deployment, config or install change
was performed in this repair.
