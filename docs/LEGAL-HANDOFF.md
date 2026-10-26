# M4 legal publication handoff

Reviewed October 23, 2026 against origin/dev d299745.
Work is isolated on codex/m4-legal-cookie. No production configuration or database
was inspected or changed. These are completed working drafts, not legal approval.

## Editorial review — October 24, 2026

The final wording pass simplifies message storage/access and manual deletion,
removes repeated negative assurances, and aligns browser-clearing language across
the policies. It preserves the support email, US launch intention, age rules,
administrator-access disclosure, and the limits on deletion and retention.
Provider confirmation provenance stays in this handoff rather than public copy.
This is an editorial update, not a fresh implementation or production audit.

October 24 validation: all 17 focused legal/public Playwright checks PASS;
focused ESLint PASS; `pnpm build` PASS (existing bundle-size warning only);
`git diff --check` PASS. No test expectations were loosened for this wording pass.
No known technical blocker remains to submitting this change for team review.

### Team-review PR versus public publication

- **Team-review PR:** the unresolved product and legal decisions below do not
  prevent submitting these working drafts for review. Include this handoff in
  the PR and identify the Gemini-free launch assumption. Local focused checks
  are recorded below; they do not establish full CI or production readiness.
- **Public publication:** resolve the age-policy/enforcement mismatch, connect
  and verify launch safety controls, rehearse manual deletion and document its
  scope, verify Gemini removal or disclose actual use, confirm deployed
  providers/storage/access practices, and obtain final legal review. Reconcile
  the public text with the implementation that will actually launch, including
  profile visibility and Garden sharing. Opening a review PR is not approval to
  merge or publish these policies.

## Confirmed team decisions

- Product: Pebble. Drafting operator: **Pebble development team**.
  This is not a corporation name or a statement of equal personal liability.
- Public support/privacy/report/deletion inbox: **pebblesupport.help@gmail.com**.
  Yaozhou monitors support, privacy requests and user reports; Aidan handles
  manual account-deletion requests through that inbox.
- Initial intended audience: United States. No geographic access restriction claimed.
- Participation policy: Friends 13+, Dating 18+.
- No planned advertising or analytics tracking. Intended launch is Gemini-free.
- Supabase, Google Cloud and Resend are team-confirmed providers. Deployment
  configuration, access, retention and provider contracts still need verification.

All three policies share operator, email and date in
`src/features/public/legal-content.ts`. Contact is a working mailto link.
No visible draft banner, placeholder contact, consent popup or fake consent
preferences were added. Legal routes/footer navigation remain public and relative.

## Release blockers: implementation must match the policies

| Priority / owner | Confirmed source finding | Required before public launch |
| --- | --- | --- |
| BLOCKER — Daniel + Aidan | `shared/profile-readiness.ts` requires a birthdate but no 13+ check; `shared/matchmaking.ts` accepts an ISO date. Friends search ages in `shared/friends-search-preferences.ts` and `docs/friends-search-preferences-migration.sql` start at 18. | Enforce the agreed Friends policy across signup/onboarding and server operations; reconcile the exclusion of 13–17-year-olds. Test under 13, exactly 13, 17, exactly 18, direct API access, and birthdate edits. Do not mistake a policy sentence or filter for an age gate. |
| BLOCKER — Daniel + Aidan | `MatchingViews.tsx` routes Dating to a prototype. It shows an under-18 notice but leaves the prototype accessible. `shared/dating.ts`, `docs/dating-aggregate-migration.sql` and `docs/dating-live-migration.sql` contain real adult-eligibility guards. | Gate all Dating entry points and verify installed backend guards with real accounts before making Dating available. Source checks do not establish production enforcement. |
| BLOCKER — Daniel + Aidan | Gemini remains in `supabase/functions/_shared/embedding.ts`; `embed-interest/index.ts` uses GEMINI_API_KEY. The release workflow still deploys it. Interest triggers call the enrichment helper via `20261013121000_optional_interest_enrichment.sql` and `20261016130000_hosted_services.sql`. Calls depend on configuration; production activation was not checked. | Remove/disable the remaining provider calls and deployment hooks, then verify that profile saves and all matching modes send no data to Gemini. The current Friends algorithm avoiding Gemini does not remove the interest-save path. **The draft targets the agreed Gemini-free launch and must not be published unchanged if Gemini still receives user data; disclose the actual processing instead.** |
| BLOCKER — feature owners + Yaozhou | `src/features/account/SafetyControls.tsx` says no block/report is sent without an adapter. Backend safety contracts exist, but their existence is not proof that the visible controls work. | Connect and verify launch blocking/reporting, receipt of reports, and cross-account restrictions. Until then, the terms direct users to the monitored email and acknowledge incomplete in-app tools. |
| BLOCKER — Aidan + Yaozhou | No user-facing automatic account-deletion path was found. Manual inbox ownership is a team decision, not a verified deletion procedure. | Rehearse manual deletion with disposable accounts. Record actual outcomes for Auth, profiles, photos, connections, message content/membership, location records, logs and backups; verify sessions/access afterward. Do not promise total or immediate erasure. |
| REVIEW — Daniel + data owners | Education/occupation/languages have saved visibility flags in `shared/profile-details.ts`, but the public projection is not connected. Dating has separate visibility flags. Candidate responses can include city/availability. `PebbleApp.tsx` keeps signed-in Garden state in memory; `PebbleGarden.tsx` has no shared-history service. | Confirm the public profile audience and every visibility control with two accounts. Do not advertise shared Garden statistics/history or a universally private city setting until implemented. Update the policy when these features change. |

## Production and legal review still needed

- Confirm that “Pebble development team” is a sufficient operator description for
  publication; a legal reviewer should advise on operator identity/contact and
  applicable US state, teen/privacy and contractual requirements. No arbitration,
  governing state, liability cap, retention deadline or compliance badge is invented.
- Check the actual deployment: Supabase project and privileges, Firebase Hosting/
  Cloud Run, Resend email delivery/SMTP, Google sign-in, third-party images and
  event sources. Resend is team-confirmed, not proven by the repository's local
  SMTP example. No dedicated crash-reporting or advertising/analytics SDK was
  found in frontend source/dependencies; check hosted additions separately.
- Decide and document staff/admin access to messages and reports. The API and SQL
  enforce participant paths, but privileged database access is possible and messages
  are not end-to-end encrypted. No operational access policy was inferred.
- Inventory deployed cookies/storage and logs in a clean browser. Check retention,
  backups, account requests, location URLs in logs, and provider agreements.
  Confirm whether any actual deployment or applicable requirements call for
  additional disclosures/controls. The lack of app analytics does not certify compliance.
- Approve final terms and privacy text, an appropriate notice/acceptance process
  for launch and later changes, and a process for reports involving children.
  The 13+ rule alone does not settle children's-privacy obligations.
- Do not collect identity documents or promise a deletion deadline without an
  approved process. Aidan should establish proportionate account-ownership checks,
  completion records and how the requester is told about unresolved data.

FTC reference for review (not a compliance conclusion):
[Children's privacy / COPPA](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions).
The FTC explains that age information can create actual knowledge of under-13
users. That is why missing age enforcement and handling of existing records need
review before launch, rather than just a statement in the terms.

## Verified storage inventory and cookie UI decision

| Mechanism | Source / behavior |
| --- | --- |
| Supabase session local storage, temporary auth verification storage | `src/supabase.ts` uses default persistent Auth storage; tokens and provider expiry are not user analytics. |
| `pebble.matchmaking-display-preferences` | `DeviceDisplayPreferences.tsx`: explicitly saved travel-range/place display choices. No app expiry. |
| `pebble.matchmaking-profile` | Legacy preview reader in `matchmaking-profile.ts`. Existing data may remain. |
| `pebble:full-ui:community:v1` | Legacy guest-preview state in `economy.ts` / `PebbleApp.tsx`; public marketing/legal do not mount it. Signed-in Garden uses app memory. |
| Event filters and location | `events/Browse.tsx`: URL filters, in-memory coordinates; optional coordinates sent in request URL. |
| Matching location | `SearchLocationPicker.tsx` / `docs/search-location-migration.sql`: explicit location choice, server-held search receipts/coordinates. Not a browser cookie and not erased by site-data clearing. |

No direct frontend cookie writer, advertising/analytics SDK or existing consent
manager was found. Keep the existing Cookie Policy link, explain browser site-data
and location-permission controls, and provide the support email. Do not create
Accept/Reject toggles that change nothing, erase authentication under a “Reject”
label, or write an unnecessary consent identifier. No storage behavior was changed.

## Manual deletion handoff (preparation, not a claim of completed capability)

1. Yaozhou receives the request and forwards it to Aidan through the agreed inbox process.
2. Aidan confirms account ownership and identifies the correct account without
   requesting passwords or sign-in codes.
3. Establish and tell the requester what can be removed and what remains.
4. Carry out the reviewed procedure; check related rows/files, session access,
   recipient copies and retention obligations. Record the actual result.
5. Reply with the result and outstanding limitations. Do not mark requests complete
   merely because browser data or an Auth row was removed.

## Validation for this pass

Executed October 23 in the isolated worktree:

- `pnpm build`: PASS (TypeScript, web bundle and API build). Existing large-bundle
  warning remains; no unrelated optimization was attempted.
- Focused ESLint on LegalPage, legal-content and both browser spec files: PASS.
- Focused Playwright: 17 PASS (16 public/legal/layout/storage checks, plus a
  signed-in account-service-failure check). Mocked authentication and isolated
  frontend; this is not production/backend acceptance.
- Layouts checked at 320, 390, 800, 1280, 1440 and 2560 CSS pixels. Visually
  inspected all three desktop policies and mobile policy/contact screenshots;
  no horizontal clipping observed. Keyboard skip/focus and email links checked.
- `git diff --check`: PASS after trimming trailing blank lines.

Focused coverage:
`tests/browser/legal-pages.spec.ts` verifies public access, policy/footer links,
contact mailto, keyboard navigation, readable mobile/desktop layout, and unchanged
browser storage. Existing `tests/browser/public-pages.spec.ts` checks the shared
public experience with updated contact expectations and portable screenshot paths.
No tests or runtime changes were made to auth, Events, matching, messaging or Garden.
