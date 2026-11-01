# Friends / Dating demo acceptance

2026-10-19. Source/offline acceptance is complete for the bounded demo slice. The local
Supabase schema is now activated with exact approval; real local development-user
Auth/API/PostgREST readback passed. Two-real-user Friends/Dating matching acceptance has now passed against local Supabase.
Daniel authorized real signed-in Dating, one shared uploaded photo, and prioritizing
these two modes for the demo. This supersedes earlier prototype-only development
restrictions. Preserve the exact prototype disclosure whenever capability is absent.

| Feature | Implemented | Verified | Activated / remaining gate |
| --- | --- | --- | --- |
| Canonical onboarding, interests and week | Yes | Real API/SQL saves and readback, browser hydration | Activated locally; real Auth and both users verified |
| Friends saved independent filters / nearby-first | Yes | Actual manual queue/candidate/browser, prior 24 races | Activated; two-real-user manual match passed |
| Dating consent and reciprocal discovery | Yes | Actual SQL/API/browser; candidate/request concurrency | Activated; two-real-user candidate/request passed |
| Dating request / recipient acceptance | Yes | Actual browser request, accept, persisted message/reload | Activated; recipient acceptance/readback passed; live chat send unexecuted |
| Shared private picture upload/removal | Yes | Real raw HTTP/Sharp/SQL/readback; quotas, CAS, removal; mobile/desktop | Sharp available in API runtime; app schema |
| Bilateral block/privacy fences | Bounded subset | Actual SQL and concurrency, inherited-ACL denial | No all-surface Events/group/worker certification |
| Downtime / group lifecycle | Deferred | Not certified | Product decisions; not in this demo |

## Behavior and limits

Friends retains preferences -> Find Friends -> real queue -> manual Check -> at most
one real person. Both queued users must satisfy reciprocal ages/radii/current
owner-bound location references and discovery/safety. Strict nearby distance wins;
normalized custom interests and exact weekly overlap are softer tie signals. No
invented group, completed match or rewards. Goals are saved, not hard matching rules.

Dating is separately opted in. Save disabled details/search, explicitly start,
manually find someone, send a connection request; recipient accepts in Messages.
One heart is not a mutual match. Clear gender/sexuality combinations resolve targets;
ambiguous cases require explicit clarification. Adults, reciprocal targets/age/radius,
current trusted locations, discovery and bilateral safety gate discovery/requests.
Nearest-first then shared-interest/UUID ties; no invented compatibility percentage.
Pause is possible after a location expires. Editing enabled preferences requires pause.
No Dating queue or legacy completed-match records. Skip is visit-local only.

Photo upload is one shared global image. Accepted input: still JPEG/PNG/WebP, <=5MB,
<=16 megapixels. API auto-orients, strips metadata, bounds to512px and baseline JPEG
<=256KiB. Database independently validates the bounded JPEG envelope. Private bytes,
actor-bound request idempotency/CAS, confirmed authoritative readback, opaque denial,
no public storage URL. Current photo tombstones suppress stale legacy avatar fallback.
No credentials/cloud storage/provider required for this bounded implementation.
Upload limits5/hour20/day; actual current-image deletion remains possible at limit.
Removal clears current bytes; this does **not** promise physical erasure from old
PostgreSQL tuples, WAL or backups. Retention/purge and larger-scale object storage
remain operational decisions. The request log has no automatic retention job.

## Executed acceptance

All databases below are fixed, marker-verified, network-none, no-port PostgreSQL17
containers with synthetic Auth and synthetic reviewed catalogue. No app data.
The fresh final target is `pebble-demo-final-20261019`, database
`pebble_safety_owner_disposable`. No live JWT, Supabase Auth or PostgREST claim.

- `pnpm --config.verify-deps-before-run=false exec vitest run --configLoader runner --config vite.isolated.config.ts --environment node tests/matchmaking-contracts.test.ts tests/profile-photo-processing.test.ts tests/dating-api.test.ts tests/search-locations-api.test.ts`:45 tests PASS.
- Rendered suite: `pnpm --config.verify-deps-before-run=false exec vitest run --configLoader runner --config vite.isolated.config.ts --environment jsdom tests/profile-photo-editor.test.tsx tests/dating-views.test.tsx tests/friends-preferences-render.test.tsx`:42 tests PASS.
- `pnpm --config.verify-deps-before-run=false exec tsx tests/offline/account-active-flow.ts --fresh-demo`: PASS real canonical four-chapter saves/readback, trusted location, actual queue/candidate, shared edits affect next manual result, invalid-edit rollback.
- `pnpm --config.verify-deps-before-run=false exec tsx tests/offline/profile-photo-api.ts --fresh-demo`: PASS actual upload/metadata/CAS/idempotency/private read/hourly+daily quota/removal/non-restoring replay.
- `pnpm --config.verify-deps-before-run=false exec tsx tests/offline/dating-live-api.ts --fresh-demo`: PASS real discovery/photo/pause/request/accept/message/block.
- `python3 tests/offline/dating-live-races.py`:96 PASS real observed-wait cases: candidate, request, photo bytes and photo reference vs reverse block/pause/discovery/filters/home/catalogue, both orders and commit/rollback. Admission exclusion DL409/photo PT404; no deadlock counted as authorization proof.
- `python3 tests/offline/profile-photo-races.py`:10 PASS earlier real block/removal/CAS cases; expanded Dating photo privacy cases above passed after final repair.
- `python3 tests/offline/demo-acl-guards.py`:9 inherited privilege guards PASS, every injected role/grant rolled back.
- `tests/dating-live.sql`: actual guarded rollback acceptance PASS, including anonymous actor/recipient exclusion, independent Friends state, paused/blocked request denial, no fabricated legacy matches.
- `pnpm --config.verify-deps-before-run=false test:e2e --config worktree/safety-owner-review/location-browser.config.ts e2e/matchmaking-real-api.spec.ts e2e/dating-live.spec.ts e2e/profile-photo.spec.ts`:8 PASS. The first test forwards real browser HTTP to actual Express/SQL; only Auth SDK/issuer is synthetic. Others intercept API to exercise UI state/errors at320/390/1440. Screenshots visually inspected at320/390/1440, including long names, age, filter icon, readable actions and photo editor. No external browser requests allowed.

Fresh replay used actual chronological account13/identity18/reconciliation twice,
profile facts/settings, safety owner/contact, UUID social compatibility, discovery
privacy, Friends prefs, Dating aggregate, trusted location, active matcher, photo,
real Dating, nonanonymous boundary, Friends capability. Synthetic core/Auth and
historical SQL prerequisites exclude HTTP/embedding/provider extensions. The exact
local assembled scaffold/replay is ignored under `worktree/safety-owner-review/`;
this is not a complete fresh install of all historical Supabase migrations.

## Demo activation gates

1. Identify the exact **demo** database/project and authorize a bounded read-only
   inventory. No credentials in chat, notes or output; do not read `.env` files.
2. Compare installed tables, function signatures/owners/ACLs and migration versions
   with candidates. Candidates create resources and are **not blindly rerunnable**.
   Prepare the exact missing dependency list and target-specific transaction plan.
3. Get exact approval for that target-specific app-schema activation, schema cache
   refresh if required, and API/frontend process refresh. No shared service restart
   or app database write has been performed by this sprint verification.
4. Use two real nonanonymous signed-in accounts with canonical onboarding completed,
   global + mode discovery enabled, and current trusted areas. A real reviewed
   place catalogue import needs approval. Explicit browser location is an alternative
   only with saved opt-in and valid recent accurate readings; area text is insufficient.
5. Verify actual JWT/PostgREST permissions and save/readback using those users;
   Friends manual queue/check, Dating consent/discovery/request/accept/message,
   upload/reload/remove, reverse-block/opt-out failure paths. No fabricated users,
   coordinates, fixture memberships or successful backend messages in the app DB.

Do not label the demo ready before step5. No push/PR/deployment is authorized.
Preserve concurrent changes in auth files and `android/gradlew`, exclude from this slice.

## Local activation and launch checkpoint

Exact-approved atomic15-source bundle applied to `supabase_db_meet-people/postgres`
on2026-10-19; SHA2563301bc861fae7c2e4d194e67c4188a5579269689ddf08c41d6128767e154a7e7.
Builder: `python3 scripts/prepare-local-demo-activation.py`; do not reapply it to
this now-activated schema. The builder checks for a fresh reviewed target and stops.
PostgREST schema cache notified; function/resource metadata confirmed. Historical
migration files/history unchanged. Candidates remain documented separately.

One operator-requested public Stony Brook campus anchor was published using
`supabase/schema-sources/stony-brook-demo-location.sql`, seven-day expiry and primary IGN coordinate
provenance. No device/user coordinates or shared profile/search settings were
changed. Local postgres needed explicit SET membership in the narrow publisher role;
no app-role privilege was added. First denied publication rolled back, then approved
membership/publication passed. Real reviewed catalogue entries expire; renew only
with operator review rather than silently extending trust.

Existing port3006 frontend and3001 API were stale; exact-approved scoped refresh
exposed Android emulator URLs in the inherited launch configuration. No environment
or credential files were inspected/edited. Correct PC launch:

```sh
node scripts/start-local-demo-api.mjs
VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_API_BASE_URL=http://127.0.0.1:3006 pnpm dev:web --port 3006
```

The API launcher requires exact-approved runtime public-key use: local CLI status is
captured in memory, only its validated public anon key selected for the child,
service-role configuration excluded, no key output/files or `.env` reads. Real user
JWTs remain required for actor-scoped RPCs. Do not paste status output into notes/chat.

Real local browser smoke (explicit operator-only
`tests/offline/local-demo.config.ts`) PASS: actual development
sign-in, local Auth getUser, canonical account, detailed settings, real Dating runtime
and preferences, own private photo state/editor and owner facts all200 through the
real API/PostgREST. No SDK/API interception, external browser origins blocked, no
profile/filter/queue/photo changes. No message history contents or credentials logged.
This establishes live local capability/readback, not a completed two-real-user match.

### User demo sequence

Open http://127.0.0.1:3006. Both real users must finish canonical onboarding and opt
into relevant discovery in Settings. Each mode keeps its own age/distance/search
area; select the reviewed Stony Brook entry and explicitly save. Friends: both click
Find Friends, then manually Check for a match. Dating: complete own Dating details
and target clarification if needed, explicitly Start discovery, then Find someone;
a request opens a conversation only after recipient acceptance in Messages. Upload
one shared photo on Profile. No seeded candidates or automatic participation.

Two-real-user Friends/Dating candidate and request acceptance now PASS as recorded
below. Actual photo write/message/block live actions remain separately bounded.
No deployment/push/PR.

### Final real-user acceptance (2026-10-19)

Both actual local Auth accounts authenticated and had completed canonical onboarding.
Daniel explicitly approved compatible demo Dating choices, Stony Brook, ages18–99,
15-mile filters and demo setup. Through each real user JWT, saved mode-independent
temporary search areas, confirmed versioned preference/settings readback, and opted
into Friends/Dating discovery. Development account Man/Straight and second account
Woman/Straight, both Long-term relationship/Monogamy; shared profile facts/bio/photos,
home area, birthdate, interests and week remain unchanged.

`scripts/verify-local-demo-pair.mjs` PASS through actual local Auth, Express and
PostgREST/database: both UI Find Friends -> both queues -> manual Check -> genuine
other-account result. Both queues explicitly left. Both UI Start Dating -> actual
reciprocal candidate -> UI request -> recipient Connections API acceptance -> same
persisted accepted connection/conversation reference after reload. No fake users,
candidates or photos, no chat message sent. Actual connection/preferences/discovery
retained for the demo. First request check ran before async UI completion; corrected
the harness to await the confirmed status, reran all steps and PASS. Input credentials
arrive only on stdin, never saved/logged; no raw input examples in documentation.

The normal second-user **Use password** UI path also PASS through real Auth and
canonical gate into enabled real Dating. Earlier warning about `/api/auth/email`
was overbroad: that endpoint is referenced by the separately edited, currently
UNMOUNTED `AuthScreen.tsx`. The current App login route uses `Auth`/`EmailLinkSignIn`,
which has working normal password entry and does not need that endpoint. Preserve
both requested auth files and their concurrent test; none changed by this agent.
Any future activation of that other screen must resolve its email API contract
without an unrestricted Auth-user enumeration endpoint.

Exact-approved local config change: add only
`http://127.0.0.1:3006/auth/callback**` to the redirect allowlist, preserving all prior
entries and email confirmation. Normal local Supabase stop/start preserved database
volumes; no reset. This was separately approved from schema activation.

Remaining live checks: actual user-supplied photo upload/removal (isolated raw HTTP,
Sharp/SQL lifecycle passed; local own state/editor passed), live message send/read,
and live destructive block/quarantine deliberately unexecuted to preserve this
real demo connection. Isolated equivalents and96 races passed; do not imply those
live actions occurred. Broader Events/group/downtime lifecycle remains deferred.
