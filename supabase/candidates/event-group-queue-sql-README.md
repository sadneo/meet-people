# Historical event group queue SQL candidate

This is the original review artifact. The installable migration now lives at
`supabase/migrations/20261009060000_event_group_queue.sql`; deploy through the
[deployment runbook](../../docs/deployment.md), not by replaying this candidate.
The mechanisms and test limitations below describe the original review.

## Files / execution boundary

- `supabase/candidates/event-group-queue-migration.sql`: additive candidate with all ten RPCs.
  Intended parent install path:
  `supabase/migrations/20261009060000_event_group_queue.sql`. This task does not
  write that path or change old migrations.
- `tests/integration/sql/event-group-queue.sql`: single rollback-only behavioral test transaction.
  **This repaired revision is not executed or SQL-validated here**, and not run
  by Vitest/Playwright. Parent reported the preceding draft passed in a schema-only
  disposable DB, subsequently removed; that is not evidence for these repairs.
- `docs/event-group-queue.md`: consumer DTOs and activation caveats.

No database/Docker command, application DB application, credentials, provider or
worker/service activation is authorized here. Commands below are for the parent,
in an explicitly **disposable** database, never an app/shared/deployed database.

## Dependencies / exact parent commands

Use a disposable Supabase PostgreSQL DB with `auth.users`, `auth.uid()`, roles
anon/authenticated/service_role, and existing migrations through
`20261009040000_listing_matchmaking_bridge.sql`. Dependencies include profiles,
user_interests, availability, listings, meetups, event_interest, blocks, connections,
unchanged Winso `get_event_matches` and helpers, and saved-profile RPCs. PostgreSQL
must provide JSONB, PL/pgSQL, `sha256(bytea)` and `gen_random_uuid()`. Install as the
trusted owner (normally disposable postgres). Public-schema CREATE for anon or
authenticated makes ranking fail closed.

The parent supplies its disposable connection locally; do not paste credentials:

```sh
psql "$DISPOSABLE_DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/candidates/event-group-queue-migration.sql
psql "$DISPOSABLE_DB_URL" -X -v ON_ERROR_STOP=1 -f tests/integration/sql/event-group-queue.sql
```

Candidate has atomic BEGIN/COMMIT. Test has BEGIN/ROLLBACK and explicitly enables
`plpgsql.check_asserts`. On error, ON_ERROR_STOP/connection termination must roll
back the uncommitted transaction. Test-only users, flags, registry rows, functions
and trigger replacements must never persist.

Before fixtures, tests replace the embedding helper with a counter that raises
on any attempt. Disabled server/registry gates and singleton no-claim run first.
A deterministic transaction-only replacement of the original rank RPC verifies
the ephemeral universe/anchor and supplies fixture order; a second raises to test
rollback and safe errors. An interest-trigger fixture supplies zero vectors for
fingerprint mutation tests. All restore on rollback. **These are not algorithm,
embedding, provider, real-JWT or runtime rank proof.** Old identity sequences can
advance despite rollback; gaps are expected, so tests are disposable-only.

Tests cover private privileges/RLS, new-only consent, idempotent join/leave, exact
2–4 completion, foreign worker/token denial, unranked/spoofed/repeated completion,
atomic membership/notices, owned/idempotent reads, foreign/missing ID behavior,
newest-200 feed counts, stale/cancelled listing suppression, inactive/missing
profiles, expired leave/leases, interest/availability fingerprints, rollback-spent
rank attempts, JWT restoration, no committed ephemeral rows and zero provider calls.
Added regressions check spent cohorts cannot move to alternate pending anchors
after rollback/failure/expiry, fresh unrelated enrollments still work, all spent
participants need explicit rejoin, old permits/tokens remain fenced, social SHARE
locks are present, social changes reject completion, and metadata-only refresh
preserves ranked inputs/proposals while semantic listing changes suppress them.
Single-session lock assertions are not two-session concurrency/deadlock proof.

## Implemented choices / important limitations

**Storage/auth:** seven tables in `event_group_private`: settings, workers, queue,
proposals, members, notifications, jobs. RLS is enabled without browser policies;
schema/table/helper privileges are denied. Queue is unique(event,actor) with rejoin
revision; notices are unique(proposal,actor) and FK-bound to members. Registry is
initially empty, worker entries default disabled, server scoring defaults false.
Only a separately authorized administrator can register an **existing** auth user
or enable flags; candidate creates no production accounts or self-registration.
Worker public functions grant authenticated EXECUTE for a dedicated worker JWT,
but every body rejects a nonregistered/disabled auth.uid before lookup/scoring;
claim also verifies its registry label. Lease lookups pin owner/token. No service-
role impersonation or arbitrary caller anchor is used.

**Validity/locks:** saved profiles must be active with valid bounded names/fields,
restricted HTTPS avatars, ≤30 distinct trimmed interests, and ≤56 integer-second,
same-day nonoverlapping windows. Fingerprints hash the full profile row plus all
interest rows (including embeddings) and availability, not just updated_at.
Listing fingerprints include only type/status/title/description/category,
location name/address/city/region/postal code, coordinates and start/end instants
(epoch representation). Sync/updated/created timestamps, missed-sync counts,
source metadata and image changes do not invalidate suggestions. Semantic changes
still do. No dates/coordinates are fabricated.

Order: **listing → profiles/interests/availability SHARE table fences (fixed order)
→ sorted profile IDs FOR SHARE → blocks/connections SHARE fences (that order)
→ jobs → proposal/member/notification writes**.
Claim only inspects jobs before listing/profile locks, then uses listing/job
SKIP LOCKED. Leave serializes by listing before private invalidation; mark-read
takes listing before its notice. Getters are read-only. No old advisory/child-row
locks or old-table triggers are added.

The global SHARE table fences protect raw child updates and insert phantoms
without rewriting old save RPCs. They block profile/interest/availability AND
block/connection writes
**system-wide**, including during rank. Existing profile save writes those tables
in the same order; privileged multi-table writers must also follow it. Parent
must prove concurrency/acceptable contention, not call this cheap per-user locking.
Social absence checks are protected against INSERT phantoms through rank/complete
commit, including peer-to-peer blocks; connections retain Winso's anchor-only
exclusion, not a new all-pairs rule. Join also uses the common fence helper.
Raw social writers/FK locks, cascades and queued profile writers require parent
two-session (and lock-queue) deadlock tests; consistent candidate ordering alone
does not prove every legacy transaction is deadlock-free.

**Ranking/universe:** claim excludes singleton/ineligible work before its 20-job
scan window and revalidates under locks. It chooses anchor + first seven eligible
peers by joined_at/actor_id, at most eight total; this is a FIFO bounded subset,
not global event-wide best ranking. Inside that subset, unchanged Winso
get_event_matches runs once and its order/unspecified ties are retained. No new
formula, threshold, embedding writes or pairwise cohesion scoring.

Rank inserts a host-NULL, non-public same-field meetup and only that snapshot's
event_interest rows in a deliberately aborted exception subtransaction. It pins
both JWT sub representations to the stored anchor, uses trusted
`pg_catalog,public,pg_temp` resolution, captures ordered IDs, then raises/catches a
rollback sentinel. No ephemeral row or legacy consent change commits. Caller JWT
context is restored; provider/helper errors become fixed uncertainty errors.

Seven peers × two textual score occurrences × two profile_embedding calls gives
a conservative source estimate ≤28 direct embedding-helper invocations. This is
**not measured Gemini requests/billing proof**. Unchanged collaborative_fit still
reads global outcomes, so total historical CPU work is not bounded here. External
embedding SDK retries/logging/configuration remain separate provider-readiness
work; the existing embedding source is not deployed-readiness evidence.

**Attempts/uncertainty:** every new join revision creates an immutable private
cache-1 sequence named `enroll_<random permit UUID without hyphens>`; idempotent join
does not replace it. Queue stores that revision's unique permit UUID. Explicit
leave/rejoin advances the revision and creates a NEW permit, never resetting the
old sequence. Claim excludes exhausted anchor AND peer permits, regardless of
which job originally used them or whether its state rolled back/failed/expired.
Rank checks all snapshot permits, then advances ALL of them before invoking the
unchanged RPC, including lower-ranked candidates not selected for the proposal.
Ordinary transaction/subtransaction rollback cannot unspend these permits, so an
alternate existing anchor or fresh peer job cannot rescore spent enrollments.
A private per-job `rank_<job UUID without hyphens>` sequence additionally prevents
repeating that lease's call. Neither enrollment nor job sequence is reset/reused.
Cancellation partway through permit consumption may conservatively spend a subset
without scoring; the provider boundary is reached only AFTER all permits advance.
Expiry before any rank starts does not spend enrollments (no provider attempt).
No failure/expiry auto-requeues the same job. This is **not** provider-once proof
across hard server crashes: sequence WAL/provider recovery needs separate review;
no automatic restart/replay after crashes or uncertain outcomes is authorized.
Enrollment/per-job sequences may remain orphaned after a listing/account cascade; retention
and separately authorized cleanup of terminal jobs/sequences remain operator work.

Expiry is terminal by clock checks; fail/reconcile materialize expired. Complete
requires rank, unchanged listing/all eight input snapshots, and only anchor +
first three persisted ranks, exact unique 2–4 ordered members. Consent, active
profiles, current availability, conflicts/blocks are rechecked under fences.
Proposal/members/notices commit together. Repeated exact complete acknowledges
the original even after expiry. Fail refuses completed work; reconcile cannot
undo it. Fail on an expired job acknowledges `{state:'failed'}` while stored state
remains expired. No rescore is allowed on a spent attempt permit.

Read getters suppress stale proposals/notices; leave additionally cancels proposal
and uncompleted jobs. Terminal/stale work with retained consent is not silently
rescheduled: each spent participant needs explicit leave/rejoin (new revision).
Unspent enrollments can still participate in another eligible peer's pending job;
spent enrollments cannot. Status remains waiting without a valid proposal;
Refresh/idempotent Join does not recover spent enrollment. Feed is newest 200 **valid owned** notices and unread
count covers exactly that window. Old private history remains until separately
authorized cleanup. Invalid/missing/foreign notification IDs return the same own
feed, without existence leakage.

## Parent-only disposable rollback

Drop these new public wrappers **before** their dedicated schema (PL/pgSQL body
references are not a reliable dependency-cleanup mechanism):

```sql
BEGIN;
DROP FUNCTION public.get_event_group_queue(uuid);
DROP FUNCTION public.join_event_group_queue(uuid);
DROP FUNCTION public.leave_event_group_queue(uuid);
DROP FUNCTION public.get_matching_notifications();
DROP FUNCTION public.mark_matching_notification_read(uuid);
DROP FUNCTION public.claim_event_group_job(text,integer);
DROP FUNCTION public.worker_rank_event_group(uuid,uuid);
DROP FUNCTION public.complete_event_group_job(uuid,uuid,uuid[]);
DROP FUNCTION public.fail_event_group_job(uuid,uuid,text);
DROP FUNCTION public.reconcile_event_group_job(uuid,uuid);
DROP SCHEMA event_group_private CASCADE;
COMMIT;
```

This destroys the new private queue/history/sequences only. Outside disposable
testing it requires separate explicit authorization. Old migrations, Company,
Winso helpers, ingestion and profiles are dependencies, not rollback targets.

## Remaining parent evidence

No SQL syntax/behavioral execution/concurrency proof for these repairs was produced here. Parent
must run/review the candidate/tests plus two-session leave/profile/raw-child writes
vs rank/complete, social INSERT/UPDATE/DELETE vs completion (including queued FK/
profile writers), competing workers/alternate anchors, lease cancellation/expiry, flag revocation,
account/listing deletion and crash-recovery cases. Verify visibility of the STABLE
legacy RPC inside the volatile subtransaction, lock contention and provider budget.
Only then, under separate authorization, consider installation, real-JWT checks
or provider rank. Worker, registry and scoring activation remain paused.

## Repair-slice app verification (not SQL evidence)

`pnpm verify` passed: typecheck, lint, 28 test files / 145 tests and web/API builds.
First `pnpm test:e2e` run alongside verification passed 68/69, failing the existing
messaging image-loaded assertion; a full standalone rerun passed all 69 tests.
No browser/test source was changed for that rerun. `git diff --check` passed.
The existing bundle-size warning remains nonblocking. None of these commands
execute this SQL candidate or the rollback-only SQL tests. Parent must rerun the
repaired SQL in a separately authorized disposable DB and perform two-session
social-lock/cohort tests; no provider or live readiness is claimed.
