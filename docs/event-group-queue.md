# Imported-event group queue and in-app inbox (source only)

## Readiness and consent

Event detail and wide preview now mount **one** `EventGroupQueue`: sign in once,
save a matching profile, **Find a group to go with**, persisted waiting state /
**Leave queue**, in-app notification, **Review proposal**. A proposal is a
suggestion of **2–4** people, not a confirmed group, invitation, RSVP, connection
or chat. There is no email/push delivery or event-local email reentry.

**An uninstalled additive SQL candidate now exists** at
`docs/event-group-queue-migration.sql`, with behavioral test source at
`tests/event-group-queue.sql`. See [SQL README](event-group-queue-sql-README.md) for
exact parent-only commands, dependencies, mechanisms, tradeoffs and unknowns.
The parent reported the preceding draft passed schema-only disposable tests and
removed that DB. This repaired SQL revision has not been run/SQL-validated here
or applied to an app database; prior draft evidence does not validate the repairs.
Existing profile and listing-compatibility migrations are not this contract.
Missing RPCs return an honest 503; there is no production fixture/fallback queue.
Background processing remains disabled. Joining does not claim a group was found.
Mocked UI/transport tests are not live persistence, secure ranking or provider proof.

Company was retired on 2026-10-22 (see [events-backend.md](events-backend.md));
legacy compatibility source/API remain intact but unmounted. Past Company interest,
Company membership and old compatibility opt-in **do not** enroll anyone into
this new queue. No backfill, implicit migration or reinterpretation of consent.
Ingestion, imported images/card alignment and existing Winso scoring are unchanged.

## Authenticated HTTP and actor SQL contracts

Every request uses the existing Supabase session, Express `auth.getUser` Bearer
verification, and a **public key + that same user JWT** for fixed actor RPCs.
There is no service-role actor authorization or second browser Supabase client.
Candidate actor functions derive identity solely from `auth.uid()`, enforce ownership
and reject anonymous access. Revoke default PUBLIC/anon EXECUTE; grant the five
actor functions to authenticated (registry-gated worker wrappers are separate).
Pin SECURITY DEFINER search paths
and validate caller/row ownership even if RLS is bypassed. Private queue/jobs,
membership and notification tables must not expose cross-user raw rows.

| HTTP under `/api/matchmaking` | Fixed proposed SQL RPC |
| --- | --- |
| `GET /events/:listingId/group-queue` | `get_event_group_queue(listing_id_in uuid) returns jsonb` |
| `POST /events/:listingId/group-queue` with `{}` | `join_event_group_queue(listing_id_in uuid) returns jsonb` |
| `DELETE /events/:listingId/group-queue` | `leave_event_group_queue(listing_id_in uuid) returns jsonb` |
| `GET /notifications` | `get_matching_notifications() returns jsonb` |
| `POST /notifications/:id/read` with `{}` | `mark_matching_notification_read(notification_id_in uuid) returns jsonb` |

IDs are listing/notification UUIDs, never Winso meetup IDs. Extra body/query fields
are rejected: clients cannot choose actors, members, notification text or RPCs.
Join also reads `get_matchmaking_profile()` and requires a valid saved profile;
SQL must enforce that prerequisite atomically too. Status and leave remain
available after missing/failed profile loading. None of these five RPCs may score,
create embeddings, send mail, invoke providers or write chats/invitations.

All three queue functions return the complete confirmed snapshot:

```ts
{ state: 'idle' | 'waiting' | 'proposal', proposal: null | {
  id: UUID, eventId: UUID,
  members: Array<{ id: UUID, name: string, avatar: HTTPS | null }>
} }
```

`proposal` is non-null **iff** state is `proposal`; members are 2–4 distinct real
profiles, include the current actor, and refer to this exact event. Express and
client validate those invariants and project only display fields (no scoring,
embedding, bio, email or arbitrary raw identities). Names use the shared bounded
label contract; avatar uses the shared restricted HTTPS policy. SQL must validate
same-event **new** consent, active/saved profiles, current listing status/time,
freshness/cancellation, and active membership under write locks. Unknown/expired
events must not enroll; existing users must still be able to leave. A canceled or
invalid proposal must not continue to expose withdrawn peers' identities.

Notification RPCs return the same actor-owned bounded snapshot:

```ts
{ notifications: Array<{
  id: UUID, eventId: UUID, proposalId: UUID, title: string,
  readAt: ISO | null, createdAt: ISO
}>, unreadCount: number }
```

Maximum 200 distinct notifications; unreadCount equals unread entries in this
snapshot (not a hidden global total). Parent must define a bounded retention/feed
window consistently. Title is server-generated neutral proposal copy, never
user-controlled content. No member identities in this feed. Mark-read must be
owned, explicit, idempotent, and preserve first read time. Forged/foreign IDs must
not reveal existence or another person's feed. Stale/canceled proposals require
safe suppression/invalidation in the feed and queue; no phantom review links.

Queue join/leave must be idempotent and serialized with proposal completion and
profile/consent changes. Leave revokes participation and invalidates pending
leases/proposals as required; it never erases or changes Company records. Proposal
membership and one deduplicated notification per member must commit atomically.
Read RPCs do not create enrollment, bridges, jobs, proposals or notification reads.
Map missing functions to 503, invalid auth to 401, invalid input to 400; proposed
SQL PT404/PT409 errors signal unavailable event/unmet prerequisites, not success.

## UI lifecycle

Public browsing remains public. Signed-out queue action goes to
`/login?returnTo=<encoded canonical /events/:uuid>`; the email callback preserves
only validated relative internal destinations. Absolute/network URLs,
backslashes/control characters and encoded variants are rejected. Existing auth
session/subscription is reused; no demo session or implicit enrollment on callback.

Queue and inbox quietly poll **reads only**, initially and every 30 seconds while
authenticated and the page is visible, plus on returning to visibility. Overlapping
queue/feed read/write conflicts visibly disable their controls until the bounded
request settles. Profile reads are deduplicated separately: queue status, Refresh
and Leave do not wait for profile loading; joining stays gated on a loaded saved
profile. Session identity/token/event changes remount scoped
state; late old responses cannot appear in a new session. Errors retain the last
confirmed queue/feed. Failed join/leave reconciles with a read; failed reconciliation
does not invent success. Refresh recovers server state after navigation/reload.
The shared matching client applies a 15000ms AbortController deadline through
fetch **and JSON body consumption**. Timeout preserves confirmed state and does
not prove rollback; uncertain queue writes still reconcile with a read. Inbox
close remains available during requests; reopening does not re-enable a control
while its old request is still pending.

The shell bell has its own unread badge (not demo Messages counts), desktop/mobile
44px control and native keyboard modal with Escape/focus restoration. Opening or
polling the inbox does **not** mark anything read. Explicit **View proposal** posts
mark-read then links to canonical `/events/:uuid`; failed reads retain unread state.
The event's **Review proposal** reveals validated member display fields and a clear
suggestion-only disclosure. No accept/RSVP or messaging actions were added.

## Disabled local worker and required secure parent functions

`api/event-group-worker.ts` exposes injected transport, bounded cycle, and
deterministic member selection. `scripts/event-group-worker.mjs` is a source-only
one-cycle entrypoint for separately authorized local scheduling; **not executed,
scheduled or activated in this task**. It imports no SDK and performs no network
operation unless **both** `EVENT_GROUP_WORKER_ENABLED=true` and
`MATCHMAKING_SCORING_ENABLED=true` are explicit. No service/systemd activation,
configuration edits or credential reading were performed. There is no HTTP/client
worker trigger. Do not activate just because source builds.

After separate authorization, the transport requires a configured server URL,
public Supabase key and **dedicated worker-bound JWT**; credentials never belong in
frontend code. The worker JWT must map to the private enabled registry. Candidate
worker RPCs grant authenticated EXECUTE for that JWT, but every body denies
ordinary/unregistered/disabled actors before private lookup/scoring; anon has no
EXECUTE and nobody can self-register. Parent must validate those gates; generic service access or calling
`get_queue_match`/`get_event_matches` with a service-role actor is not a substitute.

Exact proposed fixed worker RPC names, named parameters and return shapes:

| RPC | JSON result |
| --- | --- |
| `claim_event_group_job(worker_id text, lease_seconds int)` | `null` or `{jobId:UUID, leaseToken:UUID, eventId:UUID, anchorId:UUID}` |
| `worker_rank_event_group(job_id_in uuid, lease_token_in uuid)` | ordered array `[{profile_id:UUID}]`, max7 peers from a snapshot of max8 profiles |
| `complete_event_group_job(job_id_in uuid, lease_token_in uuid, members uuid[])` | `{state:'completed'}` |
| `fail_event_group_job(job_id_in uuid, lease_token_in uuid, reason_code text)` | `{state:'failed'}` |
| `reconcile_event_group_job(job_id_in uuid, lease_token_in uuid)` | `{state:'completed'|'leased'|'expired'|'failed'}` |

These ten contracts are implemented in the **uninstalled, unexecuted candidate**,
not deployed readiness. Concrete mechanisms and caveats are in the SQL README:

- Claim only eligible, explicitly new-consented same-event work; atomic locking /
  skip-locked claiming, random fencing token, worker-bound ownership, bounded lease,
  stable idempotency keys. No arbitrary caller-selected anchor. Pending zero-peer
  work must not immediately reclaim/spin; parent defines deferral and no-score policy.
  Candidate claim excludes exhausted per-enrollment permits for both anchor and
  peers; rank consumes all snapshot permits before scoring. No alternate pending
  anchor can reuse spent queue revisions after rank rollback/failure/expiry.
- Rank validates worker/lease, pins the job's anchor as the **server-owned acting
  user**, and safely wraps existing Winso `get_event_matches` for the linked event.
  It must enforce consent for anchor and peers without inserting/migrating old
  compatibility consent. The secure actor-context technique and isolated exposure
  of the new queue universe use a rollback-only ephemeral meetup/interest snapshot
  of at most eight profiles; SQL runtime validation remains parent work. Do not pretend that a
  raw worker JWT call provides `auth.uid()` of the anchor. Preserve Winso's ranking
  order/tie behavior and scoring; filter to real active same-event queue peers
  without reranking or changing formulas. Parent must bound ranking/provider work
  *inside SQL*, not merely truncate rows after an unbounded expensive call.
- Adapter uses anchor + first three distinct eligible ranked peers in returned
  order; fewer than two means no proposal. This is a **proposed** min2/max4
  anchor-ranking aggregation, not pairwise/group cohesion scoring or an invented
  similarity threshold. No fabricated peers or runtime ranking proof is claimed.
- Complete cannot trust a raw client-supplied members array: validate it against
  this lease's persisted ranked result, same event, all new consents, active current
  profiles, current availability and unexpired uncanceled listing/bridge. Fence
  concurrent leaves/profile changes/other completions, then atomically persist
  proposal, all memberships and notifications. Repeated complete returns the same
  committed result, never duplicate proposals/notifications. No invitation/chat.
  Candidate profile fences are followed by global blocks/connections SHARE locks
  through rank/complete commit; this adds social-write contention. Listing freshness
  hashes semantic event fields only, excluding sync/updated metadata.
- Failure reasons are fixed `no_candidates`, `scoring_uncertain`,
  `completion_uncertain`; no provider errors, PII or credentials. Fail/reconcile
  must be lease-owned/idempotent, and cannot undo a committed proposal. Cancellation
  and lease expiry must fence late ranking/completion. Expiry or uncertainty must
  **not automatically rescore**: each spent enrollment requires explicit Leave/
  rejoin for a new revision/permit; old sequences and tokens are never renewed.
  This is not crash-proof provider-once execution; separate crash recovery proof is needed
  to avoid repeating Gemini costs. Parent must prove races with in-flight RPCs.

Cycle limits: injected maxJobs 1–5 (script 3), max4 members; adapter max100 ranked
rows, candidate SQL max8 snapshot profiles and max7 ranked peers,
one ranking attempt per claimed job, ≤5 RPC invocations per job / ≤25 per cycle
(script ≤15), 1–15000ms per-call wait, 120–600s lease. Network transport also aborts
after 15000ms, with cancellation attached to the entire Supabase RPC/body parsing
and SDK retries explicitly disabled; timeout is still an **uncertain** server
outcome, not rollback proof.
Scoring failure/timeout uses one fixed failure call and stops, never retries ranking.
Uncertain completion performs one reconciliation; only confirmed still-leased work
gets one fail call. Unknown outcomes stop and remain parent-recovery work. Logs
contain only aggregate state/count, never job IDs, actors or credentials.

## Evidence and remaining blockers

Unit/API tests cover fixed actor RPC names/public-key JWT use, no scoring on open/
join/leave, strict input/privacy, authenticated notifications, count/read lifecycle,
profile prerequisite, 2–4 proposal invariants, queue reload/error reconciliation,
stale identity/event/feed suppression, visible-only reads, safe sign-in return paths,
worker gates/order/caps/lease calls/timeouts/no retries and reconciliation.
Browser tests mock the real module boundary and RPC responses, exercise mobile/
desktop keyboard inbox, read persistence, queue reload/leave errors, wide preview,
missing RPC and central sign-in. Legacy Company and compatibility standalone/API
tests remain; old mounting expectations were replaced, not old data/semantics.

Review fixes demonstrated RED→GREEN: eight initial regression failures covered
polling conflicts, profile/status coupling, and header/body deadlines. Additional
tests cover UI recovery after profile/queue/feed body timeouts and worker uncertain
ranking/completion without rescoring. The mocked browser flow covers slow profile
reads and visibly disabled queue/inbox controls recovering after reads settle.

Final source verification: `pnpm verify` passed (28 test files / 145 tests,
typecheck, lint, frontend/API builds); `pnpm test:e2e` passed (69 browser tests);
`git diff --check` passed. The existing nonblocking bundle-size warning remains.
Worker entrypoint was not executed; worker transport tests use injected in-memory
fetch only. No database, provider, Gemini, deployment or live worker checks ran.

Before live readiness: parent separately reviews/validates/installs the candidate and tests
actor ownership/privileges, freshness/expiry/cancellation, profile/leave/completion
races, ranked-result binding, notification atomicity/idempotency, worker leases,
server-pinned ranking context and bounded provider costs on a disposable database.
DB application, real-JWT group queue/inbox checks, and any provider/Gemini-backed
matching require **separate authorization**. No SQL/deployment/provider proof from
this source-only slice; SQL behavioral tests were authored but not executed here,
and worker/scoring/server registry enablement remain paused.
