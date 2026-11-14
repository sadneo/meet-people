# Pebble earning and account Gardens

Implemented on `yz/prototype-integration` after fetching and fast-forwarding to
`origin/dev` **a799a30** (24 new commits). Retains the team's separate public web
and mobile products, Android backend/push work, loading skeletons, Maps/deployment
configuration and account deletion. No commit, push or deployment performed.

## Economy

| Action | Pebbles | Limit |
| --- | ---: | --- |
| First account Garden | 300 | Once per confirmed account; initialized on first read |
| Finish onboarding, then collect | 100 | Once; eligibility comes from stored `get_account()` chapters |
| Check in from the flag panel | 20 | Once per UTC calendar day |
| Check in on five distinct days | 50 | Automatically with the fifth claim in a Monday–Sunday UTC week |

| Build a connection | 30 | Once per peer for life, at most two claims per UTC week; verified mutual exchanges on two shared days, at least 24h apart |
| Keep in touch | 20 | Once per UTC week overall; fresh mutual exchanges with a previously rewarded peer, at least 7 days after that award |

Maximum recurring earnings: **270 per week** (190 existing + up to 80 social).
No streak penalty, advertisements, payments, transfers, referral rewards, or rewards
for raw request/message volume. Both social accounts must be confirmed, non-anonymous,
at least 7 days old, active, connected and unblocked. Initial qualifying exchanges
must be within the last 30 days and after acceptance/current visible membership.
For keep-in-touch, both exchange days must be in this UTC week and at least 7 days
after the initial reward. Both participants need exchanges spanning at least 24h.
Friends and Dating use the same accepted connection and permanent per-peer reward key.
Removing/recreating a connection, switching mode, reset and repeated requests do not
re-award it. Claims select the eligible peer on the server, without accepting peer IDs.
The same safety pair lock used by blocking protects claims; eligibility is rechecked.
This verifies sustained in-app conversation, **not** a real meeting or the quality of
conversation. Determined coordinated accounts can still qualify within the caps;
there is no claim that software can prove friendship or eliminate all collusion.
No attendance or real-world-meeting claims. The current Event Group UI explicitly
states that suggested groups do not confirm attendance, so there is no event reward. Current item prices:
decorations 10–70, landscapes 20–80, buildings 90/120/150 (Pebble Cave costs 150), rare/random rocks 300.
The starter allowance can buy a rock immediately or a useful collection of basic
items; ongoing check-ins fund a 300-Pebble collectible in roughly two weeks.

## Persistence and anti-abuse

- `/api/garden` reuses the verified bearer-token/actor transport, including Android's
  existing API base URL. Authenticated non-anonymous, email-confirmed accounts only.
- A private wallet, earnings/spending ledger and idempotency receipts live in
  PostgreSQL. The public RPC derives ownership from `auth.uid()`; callers cannot
  submit balances, timestamps, random outcomes, arbitrary snapshots or another owner.
- Row locks serialize claims and purchases across tabs/devices. Every command has
  a UUID request ID and expected revision. Replays cannot spend or award twice;
  changed request-ID reuse and stale revisions fail. Server-selected random rocks
  never duplicate; all four disable further unlocks.
- 60 new commands/account/minute in SQL; 120 API requests/IP/minute. Monetary values
  are bounded integers; maximum balance 1,000,000. Confirmed accounts can still be
  farmed by a determined person; this is not proof of one human per account.
  Nontransferable cosmetic currency and capped rewards limit that incentive.
- Refunds use actual server-stored costs. Reset/refund/undo cannot create income.
  Undo uses the last 20 server snapshots, preserves later earnings, and cannot
  undo a random unlock. Unlocks survive reset; placing them again costs zero.
- Direct table access is revoked with RLS enabled. Deleting the Auth account
  cascades to its Garden rows. No additional retention deadline is promised.
- Writes are not optimistic. Timeout/lost response leaves an explicit uncertain
  state and disabled actions until a read-only refresh reconciles the account.
  Neither storage edits nor clearing storage changes the account balance.

## Existing Gardens and development

Old `pebble:full-ui:community:v1:<owner>` saves are preserved untouched. They include
editable preview/test balances and cannot establish trusted currency or ownership.
The first server Garden starts with 300 and an empty platform. **Existing device
inventory/unlocks are not imported.** This migration detail stays in the handoff,
not in the compact earning menu. Any future
grandfathering should be an audited team-controlled migration, not a browser upload.

Server display cache uses `pebble:account-garden:v1:<owner>`. Historical daily scene
previews remain device-local, separate from earning history; they do not authorize
wallet mutations. Art, pixel rendering, drag controls, reset view and reduced motion
are retained. Test-Pebble controls enter a labeled in-memory development preview;
reload/Return to saved Garden discards it without touching the account. Production
clients cannot grant themselves test funds.

## Activation / review before rollout

1. Apply additive `supabase/migrations/20261105000000_garden_economy.sql` through the
   team's normal migration process, after the current dev migrations. Do not reset
   a database. It requires existing Supabase Auth and `public.get_account()`.
   Then apply **`20261105010000_garden_social_rewards.sql`**. This additive migration
   preserves existing data and the original RPC logic behind a private wrapper;
   it supports both existing native UUID and activated legacy bigint messaging
   stores, with their existing safety migrations. The earlier
   installed migration was not edited. The new migration has NOT been applied to
   your app database; only an isolated test database. Until applied, existing rewards
   still work, social rewards stay disabled, and weekday history is not fabricated.
2. Release API and mobile builds together after the migration. Web remains public
   marketing/events. An old/missing backend fails closed; it does not silently use
   local money. For local browser review, use `pnpm dev:mobile` and the existing API.
3. Review the device-to-account transition with the team before rollout. The current
   Terms/Privacy/Cookie text still describes Garden session/local storage. Legal
   content was preserved; update those specific disclosures for server-owned Garden
   state/ledger and local history before enabling this publicly.
4. Smoke-test real Supabase login and claims on the intended sandbox, plus Android.
   No migration was applied to the existing local or hosted app databases in this
   task, and nothing was deployed. Only a dedicated disposable test DB was changed.

## Verification (2026-11-05)

- 7 real PostgreSQL acceptance tests: starting grant, daily/profile/weekly caps,
  replay/forged fields, refunds/undo, four unique unlocks, insufficient funds,
  ownership, anonymous/unconfirmed denial, direct-table denial, concurrent requests,
  and account throttling. Uses a disposable `pebble-economy-qa-*` Docker container.
  Auth and account-completion prerequisites are fixtures; the economy SQL is real.
- React → actual Express Garden route → actual PostgreSQL RPC passed in two browser
  contexts, including earning, purchasing, cross-browser reads and reset. Auth and
  non-Garden app services are fixtures; this does not prove hosted signup or Android.
- All **228** normal browser tests passed. Screenshots reviewed at 390 and 1280;
  retained Garden layout/history checks also cover 320. Three final earning tests
  passed after making the flag refresh server reward availability on open.
- 18 focused unit tests passed; focused lint and typecheck passed. Production
  web/API (`pnpm build`) and mobile (`pnpm build:mobile`) builds passed with bundle-size
  warnings.
- Whole unit suite: **671 passed, 5 failed** in unchanged
  `worker-deployment.test.ts`, `product-migrations.test.ts`, and
  `account-profile-candidate-source.test.ts`. Windows shell availability and CRLF
  byte/source-boundary checks are involved; those unrelated files were not changed.
- Whole-repository lint scans preserved untracked prototypes/output/scratch copies,
  causing 1,254 findings including conflicting tsconfig roots under `tmp`. No files
  were deleted and lint rules were not weakened; all changed code passes focused lint.

Logs and screenshots: `tmp/pebble-economy-20261105/`.

Focused commands (PowerShell):
```powershell
pnpm exec vitest run tests/unit/api-garden.test.ts tests/unit/garden-integration.test.ts tests/unit/garden-history.test.ts
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe'
pnpm exec playwright test garden-economy.spec.ts garden-integration.spec.ts
pnpm build
pnpm build:mobile
```

Optional database acceptance must use a **dedicated disposable** container, not
`supabase_db_meet-people` or any existing application DB. The test intentionally
rejects container names without `pebble-economy-qa-`. It installs minimal Auth/account
fixtures and the real migration there; it does not reset a database.
```powershell
docker run -d --name pebble-economy-qa-review -e POSTGRES_PASSWORD=disposable-test-only public.ecr.aws/supabase/postgres:17.6.1.167
$env:GARDEN_QA_CONTAINER='pebble-economy-qa-review'
node --test tests/integration/garden-economy.mjs
pnpm exec playwright test garden-database.spec.ts
docker stop pebble-economy-qa-review
```

## Social reward UI and validation (2026-11-05 refinement)

- Muted sage flag with a red, accessible reward-available dot. Server eligibility
  controls the dot, including refresh on open, focus, visibility and once a minute
  while the Garden is visible. No dot for error states or test-Pebble preview.
- Compact mobile bottom sheet, short reward rows, 44px minimum buttons, expandable
  rules. Monday–Sunday circles come from actual server ledger dates (UTC), not
  device history or the weekly count. Existing 300/20/50/100 awards are unchanged.
- New SQL acceptance in `tests/integration/garden-social-rewards.mjs` uses the real
  reward migration and repository contact/safety locking functions, minimal social
  schema fixtures and disposable messages. It does not test real signup or assert
  that the seeded conversations were created through the messaging UI.
- Run base SQL tests first, then social tests, then base again to check purchases,
  Geodes, reset, undo and old claims through the new wrapper. The base harness will
  not overwrite an installed social wrapper. Only isolated test functions temporarily
  use a fixed Wednesday clock for deterministic later-week eligibility checks.

```powershell
$env:GARDEN_QA_CONTAINER='pebble-economy-qa-review'
node --test tests/integration/garden-economy.mjs
node --test tests/integration/garden-social-rewards.mjs
node --test tests/integration/garden-economy.mjs
pnpm exec playwright test garden-social-rewards.spec.ts garden-economy.spec.ts garden-integration.spec.ts garden-database.spec.ts
```

Final refinement checks: **8 social SQL tests + 7 original economy SQL tests passed**
through the additive wrapper; **20 focused unit tests passed**; **15 focused browser
scenarios passed**, including a real React → Express → PostgreSQL connection reward,
second-browser balance read, purchase and reset. Mobile screenshots reviewed at
320/390px and desktop at 1280px. Focused ESLint, TypeScript, production web/API build
and mobile build passed (existing bundle-size warnings only). The final timezone
run uses Pacific/Honolulu to ensure weekday marks remain tied to UTC dates.
Screenshots: `tmp/pebble-social-rewards-20261105/final-confirmed-browser/`.
The retained Undo regression now waits for the asynchronous account save before
checking local display cache; its expected result is unchanged.
The existing application database, original installed economy migration, prototype,
legal worktree, Git stashes and unrelated files were not modified.
