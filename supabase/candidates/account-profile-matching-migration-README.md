# Historical account profile migration candidate

This is an earlier review artifact, not the current installation guide. Active
schema inputs are in [`../schema-sources/`](../schema-sources/README.md); applied
history is in `supabase/migrations/`. The candidate remains for its source-contract
test and disposable namespace harness. Do not install it over the current schema.

`account-profile-matching-migration.sql` is a candidate, not an applied migration.
No `supabase/**` file is changed. The revised candidate now replaces the legacy
save RPC in the candidate transaction; its historical validation/persistence body
is retained outside the reviewed lock/isolation/ownership additions. The parent
owns disposable execution and any separately approved installation. The agent has
not executed SQL or the database harness. Prior parent baseline passes do not
establish that this revised candidate or new concurrent harness passes.

## Preconditions and review

- Existing `public.profiles` has `id`, `username`, `display_name`, `bio`,
  `avatar_url`, `updated_at`; IDs reference real Auth accounts. Existing
  `get_matchmaking_profile()` / `save_matchmaking_profile(jsonb)` remain installed.
- Confirm the installed legacy definition matches the historical source before
  considering the candidate replacement; do not overwrite a newer deployed RPC.
- Browser writes must be RPC-only. Source RLS policies still allow own-row
  INSERT/UPDATE on `profiles` if corresponding grants exist. The candidate aborts
  with `42501` before creating objects if `anon`/`authenticated` have table DML or
  column INSERT/UPDATE rights (including inherited/PUBLIC rights). It deliberately
  does not revoke product access silently. Review/restrict conflicting grants in
  a separately approved installation plan. RLS policies and existing grants are
  otherwise unchanged. Owner/superuser/service-role maintenance is trusted and
  outside this guarantee; coordinate it explicitly, and audit any other definer
  RPC identity writers before installation. Do not permit uncoordinated bypasses.
- Review column types, uniqueness/collation, existing profile triggers, grants,
  SQL/Zod Unicode trimming and URL parity, and profile RLS before installation.
  Candidate uses PostgreSQL `btrim`; JavaScript trims additional Unicode
  whitespace. Backfill preserves existing identity text byte-for-byte.
- Review username reservation between legacy and account-only actors. The
  two existing unique constraints are retained. Both candidate save RPCs acquire
  the identical `profile-username-namespace` transaction advisory lock before
  actor/row locks and before writes. Canonical checks other legacy owners; legacy
  checks other canonical owners after choosing its own canonical effective
  username. Cross-owner conflicts raise `23505`; no case folding/new reservation
  table is introduced. Only `read committed` is supported; both reject other
  isolation settings with `25001` before locks/writes. Namespace contention lasts
  through the transaction, including synchronous legacy embedding work.
- Candidate has no Auth signup trigger. Accounts are not populated from email,
  metadata or anonymous handles. Backfill copies valid existing profiles only;
  invalid legacy rows/data are retained and require explicit account correction.

## Contracts and compatibility

`get_account_profile()` returns SQL NULL or exactly
`{username, display_name, bio, avatar_url}` for `auth.uid()`.
`save_account_profile(profile_in jsonb)` accepts exactly those four required keys;
names are nonempty, bio/avatar nullable. It saves atomically and returns the
persisted snapshot. Identity is never a request parameter. RPCs are restricted
to authenticated, with fixed empty search paths and qualified tables. Table
select is own-row RLS; direct insert/update/delete is not granted.

Canonical account identity is mirrored to **existing** `profiles` identity
columns for existing ranking and response projections. Account save creates no
matching profile, changes no interests/windows/coordinates/queue, and does not
call an embedding function. A projection trigger prevents stale legacy matching
writes from replacing canonical identity after installation. For actors without
canonical accounts, legacy behavior remains available. The old matching RPC
names, full payload shape, tables and algorithm are retained.

The frontend adapter supplies canonical identity to the full legacy profile
write when supported. Preferences contain only birthdate, area, interests and
availability in that state. If canonical RPCs are missing or fail, the current
shared Profile UI blocks saves and shows unavailable/read-only retry until the
required backend support exists. No fabricated identity, legacy identity write
fallback or browser/Express dual-write fallback is used.

## Parent-only validation and rollback

### Exact parent-only harness handoff

Dependencies: Python 3 standard library, `psql`/PostgreSQL with existing source
schema, legacy profile RPCs, `auth.users`/`auth.uid()` and `anon`/`authenticated`
roles. No Python package, HTTP client, dblink, provider key or download is needed.
Parent creates a **fresh schema-only network-none disposable database** named
exactly `pebble_namespace_disposable`, with a local Unix socket and a trusted
local `postgres` connection (peer/trust in this disposable environment only).
Never point this harness or fixtures at the running database. No production data,
seed scripts, Edge service, live Auth operation or provider access belongs here.

Parent sequence, after preparing that disposable schema only:

1. Load `tests/integration/sql/account-profile-namespace-fixture.sql`. This file explicitly guards
   the database name, restricts direct browser DML/schema CREATE **only in the
   disposable fixture**, and replaces `get_gemini_embedding(text)` with a raising
   `PZ001` guard. There are no fake vectors or disabled interest triggers.
2. Load `supabase/candidates/account-profile-matching-migration.sql` with `psql -X -v
   ON_ERROR_STOP=1`. It must install atomically or fail the grants precondition.
3. Run `tests/integration/sql/account-profile-matching.sql` with the same fail-on-error setting;
   this older single-session behavioral test rolls its fixtures back.
4. Run the persistent-session concurrency harness once on the fresh disposable DB:

```sh
python3 tests/integration/local/test-account-profile-namespace.py --socket /ABSOLUTE/DISPOSABLE/SOCKET --psql /usr/bin/psql --disposable-network-none
```

For the three SQL file loads use the parent's local `psql` executable with
`-X --no-password --host=/ABSOLUTE/DISPOSABLE/SOCKET --username=postgres
--dbname=pebble_namespace_disposable -v ON_ERROR_STOP=1 -f FILE`. Parent must
disable credential/service-file lookup for these commands too; no `.env`,
`.pgpass`, network DSN or credentials are needed. The Python harness itself uses
an explicit minimal environment with nonexistent credential/config file paths,
no psql startup file and no password prompts. It accepts only a local absolute
socket directory and the fixed disposable database name, verifies a fixture
marker and the raising provider guard, and does not install SQL or manage Docker.
Network-none is an explicit parent attestation, not something SQL can prove.

The harness commits synthetic rows and refuses fixture reuse rather than deleting
or truncating tables; use a fresh disposable DB for each run. Parent owns disposal.
It observes the losing backend's advisory-lock wait and blocker PID before
releasing the winner, rather than relying on `pg_sleep` or a lucky schedule.
It covers sequential conflicts in both directions, concurrent canonical-first
and legacy-first commits, rollback then competitor commit, retry after rollback,
same-actor both directions, rename/release both directions, lock timeout `55P03`,
rejected READ UNCOMMITTED/REPEATABLE READ/SERIALIZABLE `25001`, effective canonical
projection of stale legacy usernames, unchanged trim/case equality, browser DML
denial, and provider-guard failure with atomic rollback. It reports SQLSTATE
assertions and ownership counts, not fabricated concurrency success.

These database tests are **unexecuted by the agent**. Source parity/ordering tests,
Python AST parsing and diffcheck do not validate PostgreSQL syntax, execution,
locking, grants, backfill, or concurrency. Parent should additionally capture
before/after protected fields, triggers, grants and algorithm definitions and run
the existing matching-profile SQL regressions under the same network isolation.

Agent source-check handoff: `pnpm typecheck`, `pnpm lint` and `git diff --check`
passed. Execution policy denied `pnpm exec vitest run
tests/unit/account-profile-candidate-source.test.ts`, Python AST parsing and
`sha256sum`; none was retried through another launcher. The four authored source
assertions, Python parsing, all SQL tests and candidate hashes still need parent
verification. No test counts here imply executed database/concurrency evidence.

Rollback review (not execution): first restore the exact prior legacy save RPC
definition/owner/ACL from the parent-reviewed baseline; the candidate replacement
references the canonical table. Then remove `account_identity_projection`, then
`project_account_identity()`, `save_account_profile(jsonb)`,
`get_account_profile()`. Preserve/export the canonical table as appropriate before
dropping `account_profiles` and `valid_account_identity(jsonb)`. Existing
`profiles` and matching tables/RPCs must remain. Rolling back canonical support
returns the UI to explicit legacy compatibility; identity already projected to
legacy profiles remains real persisted data. Never run a schema rollback or restore
from this document without separate installation/rollback authorization.
