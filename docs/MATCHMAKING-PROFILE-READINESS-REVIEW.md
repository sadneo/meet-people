# Matchmaking, Profile and Settings readiness review

Implementation status below is the pre-implementation audit snapshot. See [the frontend handoff](FRONTEND-READINESS-HANDOFF.md) for subsequent work, current verification and remaining backend contracts.

Reviewed 2026-10-19 against the user's setting-ownership table, amended by the user's subsequent corrections. Checkout: `feat/reconciled-ui-baseline`, HEAD `5234604ebffd043d3b02653abca8cbfb07f43446` plus the existing uncommitted UI continuation. This is an audit, not an implementation of the table or a backend/security certification. Source review is limited to frontend code and shared contracts; no backend, database, provider or live-service inspection/actions.

Verdict: the table is sufficient for a useful first version. The current UI is a good visual/interaction foundation but does **not** yet implement the table completely. Resolve ownership and product rules before freezing database/API contracts. Do not derive a new schema simply from the current legacy `MatchingProfile` or four account-setting booleans.

## Findings in priority order

### Corrected scope — Shared interests and weekly availability

The user clarified that Profile and matchmaking intentionally share one global interest selection. Changes in either place should appear in the other. Shared interest writes are therefore **not an ownership defect**. Do not introduce separate usual/active/downtime interest stores or force users to maintain duplicate selections. `MatchingScreen.tsx` and `useMatchmaking.ts:129–135` save through the same profile resource that Profile reads; this aligns with the clarified interest ownership. A shared catalogue alone would not establish selection ownership, but the user explicitly requires both-way selection updates here.

The user also explicitly confirmed availability is shared. Profile and Friends matchmaking use the same saved weekly schedule and interest selection, with edits in either view reflected in the other. Neither shared write is an ownership defect. Do not create separate active/usual/downtime copies of these selections. Search/session state remains operational and separate; define whether an in-flight search snapshots or reloads later shared edits before backend implementation.

### Corrected scope — Active matching turns downtime off

The user explicitly wants active matching to take priority and turn downtime off. The current one-queue replacement and off switch are consistent with that rule; automatic background resume and a separate paused-but-enabled switch are not required by the clarified brief. Keep explicit consent before switching queues, truthful server-confirmed state and off by default when no queue is joined. Do not silently restart downtime when active ends. Any independent long-term consent flag beyond this is a future product decision, not a defect established by this audit.

### Corrected scope — Sexuality-based Dating compatibility

The user wants own gender plus sexuality to determine Dating targets, e.g. Man + Straight targets Woman. A separate who-to-date selector is therefore **not required**. The earlier recommendation to mandate one is superseded. `DatingPreferenceFields.tsx` already exposes the inputs; `MatchingViews.tsx:149` still keeps them local and fixture recommendations do not use them.

Before real matching, define an explicit reciprocal compatibility matrix across the supported options. Woman/Man + Straight/Gay/Lesbian can have documented mappings; Nonbinary, Other, Queer, Questioning, Asexual and blank states need deliberate product rules rather than invented binary fallbacks. Asexual does not itself specify romantic gender preference. Bisexual/Pansexual inclusion must be defined explicitly. Where a label does not resolve the intended targets, use a small clarification at activation or a clearly defined non-active state; do not silently guess. Both users' rules must allow each other. Visibility of sexuality remains independent from using the saved value for compatibility. No matching implementation or mapping was added during this correction.

### P1 — Privacy toggles and safety UI are incomplete contracts

`Social.tsx:170–177` exposes discovery/availability booleans and one combined notification boolean. Settings changes are routed through canonical account save/readback (`PebbleApp.tsx`, `useUnifiedAccount.ts`), but a saved flag alone does not prove filtering, field redaction or delivery behavior. There are no education/occupation/language visibility controls. The Settings blocked-user dialog explicitly manages sample profiles (`Social.tsx:189`), not a real account blocklist. Source reviewed here cannot establish backend enforcement of privacy settings.

Required outcome: define discovery audience/mode scope, field visibility and availability audience, plus real account-wide block/unblock/report states. Specify effects on existing conversations/connections/search sessions and results. Do not present real protection as completed until authoritative services enforce it. This is not a claim that current backend enforcement was inspected or found absent.

### P1 — Date validity is not adult eligibility

`ReadyPreferencesSchema` checks a nonempty valid date, not age/future birthdate. `tests/profile-readiness.test.ts` explicitly accepts `2026-10-18` as a birthdate; the filter sheet independently restricts requested ages to 18–99. `OwnerProfile.profileAge` calculates an age but is not an eligibility gate. The present UI therefore has inconsistent age semantics.

Required outcome: decide supported ages, enforce them before Dating activation and at the authoritative boundary, and reject future dates. Keep birthdate private; expose calculated age only to the approved audience. Define correction/change rules and birthday/time-zone calculation. Do not silently change global onboarding eligibility in this audit; preserve existing gates until an approved policy is implemented.

### P2 — Visible controls are ahead of implemented capabilities

Friends' numeric age/distance sheet has disabled Save and an honest missing-contract explanation. It seeds distance from a legacy account-wide string setting, not independently saved Friends values (`MatchingScreen.tsx:132`). Dating values are ephemeral and do not change fixture recommendations. `FriendsPartyPreference` owns local presentation-only 1–3 state; no request consumes it and the result schema permits one candidate. Temporary search location does not exist. These distinctions must remain visible until supported; do not simulate successful matching or group readiness.

Required outcome: independent per-mode filters, explicit location override with reset-to-home, and a separate active-search target count. Keep one-candidate behavior until real session/group contracts exist; 1–3 new people must not be confused with total group size including the user. Friendship goals currently appear in onboarding account preferences but have no Friends editor.

### P2 — Shared profile fields and single-photo flow

The user confirmed one uploaded global profile picture is sufficient for now; a photo gallery, reordering and Dating-specific photo/bio overrides are not required. Shared bio remains the baseline. The current owner view displays a single avatar URL but has no upload/replace/remove control in the reviewed Profile editor; the upload path still needs to exist or be connected before it can be considered complete.

Education, occupation and languages are explicitly requested in global Profile and remain missing, including their visibility controls. Add these with draft/cancel, empty/error and readback states. Profile's main edit dialog saves identity then facts separately (`ProfileEditDialog.tsx:32–37`); it explains partial confirmation rather than claiming atomic completion. Agree versioned/partial-save reconciliation when adding fields. Preserve canonical identity/readback and actor guards. A real blocklist is confirmed future work, not an implemented capability.

### P2 — Time and baseline semantics need definition

Availability is a same-day recurring week hardcoded to America/New_York, including custom windows and 24:00. No timezone selector or dated temporary-search representation exists. That is valid for a campus-only prototype but not a general location-aware service. Decide campus-only vs account timezone and daylight-saving behavior. The approved schedule is shared and recurring; a dated temporary schedule is not required by the clarified scope. Define search/session expiry separately. Preserve exact partial windows; do not round them into coarse blocks. Usual-week Clear currently cannot be saved empty under mandatory readiness; decide whether that remains intentional without weakening onboarding by accident.

### P2 — Regression coverage still encodes the old ownership model

Expanded tests found four failing unit tests and three failing browser tests. They expect the replaced Friends Preferences dialog to edit shared interests/windows or have enabled Save. This is a test/product-contract mismatch; it is not evidence that restoring shared writes is correct. Shared interest writes are now confirmed intentional; the old filter-menu selectors and enabled numeric-filter Save assumptions are still outdated. Reconcile tests with the clarified global-interest contract and preserve the now-confirmed shared availability behavior when changing behavioral assertions.

### P3 — Smaller UX/documentation work

- Add a reliable discard warning for dirty Profile/search drafts when navigating away; mobile pull/close currently intentionally discards local sheet drafts.
- Profile usual-week caption counts draft windows while calling them saved; differentiate unsaved state consistently.
- State hard filters vs ranking preferences, particularly age/distance and empty-result relaxation; never silently widen an identity/age filter.
- Provide understandable no-results, unavailable-location/permission-denied and expired-search states.
- `docs/DESIGN.md` and `docs/UI-PLAN.md` still describe dark Friends. Update them to the later approved light palette before they guide further implementation.

## Row-by-row coverage of the requested table

“Partial” means some UI exists; it does not imply real persistence or service enforcement. “Present” is limited to the frontend behaviors described.

| Requested setting | Current UI / ownership | Readiness |
| --- | --- | --- |
| Name, birthdate / age | Shared Profile editor; birthdate private on owner view, age derived; no adult eligibility check | Partial |
| Single profile picture, general bio | Shared bio and single-avatar display; upload/replace UI not present in reviewed editor | Partial; no gallery required |
| Home city / campus | Shared Profile owner/editor and Settings link; text only, no temporary-area writes | Present as text; geospatial contract needed |
| Education, occupation, languages | No owner editors or visibility controls | Missing |
| Global interests | Profile and matchmaking share one saved selection by design | Ownership aligned; verify synchronization |
| Usual weekly availability | Profile and active Friends currently write the same week | Shared ownership confirmed |
| Relationship intentions | Correct Dating-only inline dropdown | Local prototype only |
| Relationship style | Correct Dating-only inline dropdown | Local prototype only |
| Own gender | Fixed choices + Other, initially blank/hidden; independent of sexuality | Local prototype; legacy migration not implemented |
| Sexuality | Fixed choices + Other, initially blank/hidden | Local prototype; legacy migration not implemented |
| Height | Paired feet/inches and visibility, blank optional, 0 inches validated | Local prototype; canonical height/migration absent |
| Dating-specific photos / bio | Reuse global picture/bio for now | Deferred; not a current requirement |
| Friendship goals | Social intent saved during onboarding; generic account preferences, no Friends editor | Partial / misplaced editing surface |
| Per-mode distance / ages | Friends Save disabled; Dating local state; legacy shared distance strings remain required in onboarding | Partial; independent stores absent |
| Who user wants to date | Derived from own gender + sexuality by approved rule | Compatibility matrix/ambiguous cases not defined; no separate selector required |
| Interests in matchmaking | Same global selection as Profile; updates in either direction | Intended shared ownership |
| Free time for active search | Current writes update shared week | Shared ownership confirmed; original temporary-time row superseded |
| Number of new friends | 1–3 visual selection; no search payload; max one candidate | Presentation only |
| Temporary search location | No per-mode override UI or reset | Missing |
| Downtime participation | Active priority replaces downtime and turns switch off | Matches clarified priority rule; no automatic resume required |
| Downtime preferences | No separate background interests/week/filter editor; route leads to Settings | Missing independent scope |
| Notifications | One persisted plan/message boolean; no separate match-update control/channel semantics | Partial |
| Discovery / field visibility | Account discovery and availability switches; Dating sensitive-field preview toggles | Partial; audience/enforcement contracts needed |
| Location permission / nearby | Nearby preference separate from home; explicitly does not request device location | Partial; permission/denied/fallback UI absent |
| Blocked users / security / logout | Sample blocked-users dialog; existing credential management and logout flows with error handling | Partial: real blocklist missing; auth UI present |
| Queue / members / ready | Real Friends queue/manual candidate UI separated from profile; no Friends group/lobby/ready implementation | Correct current boundary; future group-session UI absent |
| Pebble balance / purchases / rewards | Separate prototype Community/economy; not editable Profile preferences; not an authoritative wallet | Correct UI separation; production ledger absent |

## Enough settings for a good experience?

Yes, the requested table is a sufficient scope. The gap is implementation and semantics, not a need for many more filters. Avoid a large mandatory questionnaire. Keep education/occupation/languages, identity visibility, height and Dating presentation optional; do not require disclosure to match unless explicitly justified by an approved rule.

Before implementation, add or clarify only a few essentials:

1. A reciprocal gender/sexuality compatibility matrix, including blank/ambiguous states; separate mode discovery/activation from visibility of sensitive fields.
2. Timezone and search/session duration/expiry; make it clear that schedule edits update the shared week.
3. Location source (home/device/temporary), permission-denied fallback and reset-to-home. Never expose precise coordinates as profile text.
4. Match-update notifications alongside plans/messages; distinguish saved preference from actual device/channel permission.
5. A simple See my profile as others see it preview so sensitive-field visibility is understandable. This is a proposed UX addition, not an existing feature.

Other compatibility topics (smoking, drinking, children, religion, etc.) can wait for demonstrated product need; the current brief does not need them to start.

## Proposed ownership boundaries for the backend handoff

These are conceptual domains, not proposed SQL tables or authorized API edits:

- Global profile: shared identity/facts/single picture/home and one global interest selection; private birthdate and explicit field visibility. Weekly schedule is shared between Profile and matchmaking.
- Dating profile: own gender/sexuality/relationships/height/visibility, used by the approved reciprocal compatibility matrix. Global picture/bio reused for now.
- Friends preferences: friendship goals and applicable filters. Interest selection is global, not separate background/active copies. Availability also uses the shared global week.
- Per-mode search preferences: separate Friends/Dating age, distance and temporary location. Dating targets derive from the approved matrix; define temporary-location lifetime.
- Active-search/session snapshot: chosen interests/times/location/count and immutable preference revision for that search; queue, members and readiness are operational resources.
- Settings: default-off downtime entry with active-search priority and no implicit auto-resume, mode discovery/notifications/location choices. Permission state comes from the device.
- Safety and wallet: authoritative block/report and ledger/inventory resources; no editable preference representation of balances/rewards.

For each resource define owner/public read shape, validation, defaults, enum migration, version/conflict behavior, pending/error/uncertain-write/readback states and cache invalidation. One UI sheet can edit two domains without merging their canonical ownership. Save atomicity and server authorization must be proven later; mocked UI tests do not prove them.

Minimum acceptance before live integration: interest changes synchronize globally in both directions; schedule changes synchronize globally in both directions; mode filters save independently; active matching turns downtime off without automatic resume; no writes on cancel; shared picture/bio render consistently; reciprocal sexuality/gender rules handle ambiguous states explicitly; hidden data is omitted from public results; failed/partial writes and stale revisions remain clear; private/onboarding gates are retained; real block and permission semantics are tested. Keep the current single-candidate Friends and local-only Dating disclosures until capabilities truly change.

## Verification and limits

Commands run during this review:

```text
pnpm --config.verify-deps-before-run=false typecheck
PASS

git diff --check
PASS

pnpm --config.verify-deps-before-run=false exec vitest run --configLoader runner --config vite.isolated.config.ts --environment jsdom tests/shared-user-profile.test.tsx tests/account-profile-ui.test.tsx tests/unified-account-readback.test.tsx tests/profile-readiness.test.ts tests/dating-views.test.tsx tests/find-friends.test.tsx tests/match-filter-sheet.test.tsx tests/profile-interests.test.tsx
80 passed, 4 failed / 8 files (6 files passed, 2 failed)

pnpm --config.verify-deps-before-run=false test:e2e --config worktree/friends-light-review/playwright.config.ts e2e/profile-unification.spec.ts e2e/settings-downtime.spec.ts e2e/settings-account-actions.spec.ts e2e/dating-reference.spec.ts e2e/friends-light-theme.spec.ts
30 passed, 3 failed / 33 tests
```

Failing units:
- `shared-user-profile`: held matching save/focus restoration; matching edits read back on Profile. Both expect interest buttons inside the replaced filter sheet.
- `account-profile-ui`: canonical identity helper copy in preferences; Save enabled after identity loading. Both assume the old shared-preference editor in the filter dialog.

Failing browsers: `profile-unification` at 320/390/1440 expects dialog “Your preferences” with enabled shared-preference Save. Current dialog is “Your kind of connection.” and has numeric-only fields with disabled Friends Save. The earlier Profile editing assertions run before that failure; these are not full passing end-to-end Profile flows.

Existing Dating/Friends visual/gesture, Settings credential UI and downtime operational tests passed within that browser run. Source and existing test evidence reviewed for account gates, authoritative readback, cross-actor fencing, private birthdate rendering, exact windows and save failures. Screenshots from the isolated run are under ignored `worktree/friends-light-review/results/` and `worktree/settings-account-actions/`; tests use mock auth/API and block external traffic. No new tests were needed for this documentation-only audit. No failures were hidden or reclassified as passes.

Full suite/build/lint, physical-device touch/zoom, exhaustive visual/contrast audit, real persistence, backend authorization/privacy, blocklist enforcement, notifications delivery and geospatial matching were not verified. Source tests currently accept a near-newborn birthdate; that is explicit evidence of an eligibility gap, not a policy decision. No backend/database/provider/cloud/deployment/configuration/environment/credential files or protected worktree were changed/read for this audit. No push/PR/commit. Product UI is unchanged by this review; only this report and canonical project notes are updated.
