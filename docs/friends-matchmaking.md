# Passive Friends discovery

This backend implements individual Friends discovery on `feat/new-matchmaking`.
The user explicitly selected **18+ for this version**. It does not implement
Messages-based active group matching, change existing queue behavior, or connect
the redesign frontend. Those are the next separate steps.

## Architecture and eligibility

1. Verified Express middleware derives the actor from the session token.
2. A separate service-role transport calls `get_friends_scoring_pool` for at most
   100 eligible nearby candidates. Private inputs never travel through an actor
   RPC or HTTP response.
3. TypeScript ranks the pool using `api/matching/friends-scoring.ts`.
4. One actor-JWT `project_friends_candidates` transaction rechecks up to 30 ranked
   IDs, drops withdrawn candidates, and projects public fields.
5. Return at most 10 people in rank order. A missing/blocked/ineligible candidate
   is omitted; no fixture or legacy scorer fills an uncertain result.

Hard rules precede scores: persisted canonical account readiness, active real
nonanonymous/nonsuspended/nondeleted Auth account, age 18–99, global and Friends
reciprocal discovery consent, current mode-specific trusted anchors, reciprocal
age/radius preferences, bilateral blocks, and exclusion of established/pending
contacts. Dating identity, participation, target preferences and sexuality have
no effect. Zero shared interests, goals or time overlap do not cause exclusion.

The new path never reads or writes `queue_entries`. It does not call the legacy
`get_queue_match` or create group outcomes. Existing active/downtime queue consent
behavior is unchanged; the future Messages group-search lifecycle must establish
its own explicit participation independently of passive discovery.

Candidate queries use the Friends location-reference GiST index, `ST_DWithin`
and spheroidal meter distances. They never substitute profile home coordinates
or device coordinates for a missing mode anchor. Reciprocal distance must satisfy
both radii. Current reference and catalogue TTLs are checked again with the wall
clock after lock waits, in addition to the existing trusted-location proof.

## Scoring configuration

All components are 0–1. Weights and thresholds are starting hypotheses, versioned
in `api/matching/friends-config.ts`, not calibrated acceptance probabilities.

| Component | Weight | Calculation |
| --- | --- | --- |
| Interests | 40% | Jaccard intersection/union of canonical normalized interest sets. |
| Availability | 35% | Usable continuous UTC overlap; 60-minute minimum window, saturation at 240 minutes over the next 14 days. |
| Friendship goals | 15% | `sqrt(common / count(A) * common / count(B))` using normalized exact goal labels. |
| Distance | 10% | Geometric mean of each person's `max(0,1-distance/radius)` convenience. |

Canonical interests use the shared versioned alias dictionary, whitespace/case
normalization and NFC. Unknown custom labels match immediately by normalized
identity. Aliases do not double count. No fuzzy, bio-keyword, sensitive-attribute
or broad/subtopic inference is performed. Friendship goals have exact normalized
matching; interest aliases are not applied to goals.

Missing optional goals or unknown availability use the fixed 0.5 prior; weights
are not redistributed per profile. Known nonoverlap is zero. This missing-data
prior remains an experimental assumption, not evidence of compatibility. Bio,
education, occupation, languages and public visibility do not change the score.

## Shared availability

Both modes now use `matching_private.scoring_settings`, holding the timezone for
canonical `public.availability`, a revision, and availability-summary visibility.
There are no duplicate mode-specific weekly schedules or automatic timezone
inferences. Dating's existing owner setting RPC names forward to this resource.
The shared contract is `shared/matching-scoring.ts`; Dating import names remain
compatibility aliases.

Postgres expands actual dated intervals in the chosen IANA zone and clips them
to the next 14 days. Spring-gap endpoints that fail a round trip are omitted;
ambiguous fall endpoints use PostgreSQL standard-time interpretation. Overlap
calculation merges duplicate/adjacent intervals, including two-piece overnight
windows. Without a confirmed timezone, availability is unknown rather than
assumed to be in the backend timezone. Raw schedules, goals and timezone are never
projected to other people. Availability explanations are not exposed in this
version, even if the owner has enabled summary visibility.

## API contract

All paths below are under `/api/matchmaking/friends`, require a bearer token, and
return `Cache-Control: no-store`. Friends recommendations are enabled by default
with configured server credentials and authenticated actor transport; there is
no environment rollout flag. Missing configuration remains an unavailable state.

### POST `/recommendations`

```json
{ "excludedIds": [], "limit": 10 }
```

`excludedIds` is required, allows up to 200 distinct UUIDs and is normalized to
lowercase. `limit` defaults to 10, range 1–10. No actor ID, profile, weights,
coordinates or unsaved filters can be supplied by the client.

```json
{
  "candidates": [
    {
      "id": "fc000000-0000-4000-8000-000000000002",
      "name": "Alex",
      "age": 24,
      "city": "Campus",
      "bio": null,
      "avatar": null,
      "photoRevision": 1,
      "interests": ["Coffee", "Board games", "Sculpture"],
      "areaDistanceMiles": 2
    }
  ],
  "algorithmVersion": "friends-rules-v1"
}
```

An exhausted/withdrawn pool returns an empty array. Internal scores, private
components, exact DOB/location, goals and schedules never enter this schema.

This is a bounded **batch API, not a persistent server cache**. It recomputes on
each request. The future frontend can hold ten cards locally, preload photos,
and refill around three remaining; it should include already loaded/shown IDs in
exclusions. Deterministic UUID tie-breaking preserves ordering for unchanged
inputs; no server cursor or cross-session skip history is claimed. Invalidate
held cards on relevant account/settings/block changes and recheck actions with
the backend. Already delivered bytes cannot be revoked by a database cache check.

### POST `/requests/:targetId`

Input `{}`. Output existing `{status:"sent"|"connected",conversationId:null|uuid}`.
Requires the same current bilateral eligibility under a pair lock. Repeating an
outgoing request is idempotent. If the target already requested the actor, this
endpoint returns conflict; it does **not** silently accept their incoming request.

### POST `/requests/:targetId/accept`

Input `{}`. Requires an actual incoming request, except idempotent readback of an
already accepted connection. Output connected state and its existing conversation
UUID. The established contact graph and conversation triggers are reused; this
version does not add a separate mode-tagged request store or rewrite history.

Both writes recheck hard eligibility and existing safety quarantine. Unknown write
outcomes require reading Connections; no automatic write retry or fabricated
success. Existing chats survive passive-discovery withdrawal. Private photo
projection/read fences now also honor Friends reciprocal filters and location
expiry, preserving the existing contact and Dating audiences.

### GET/PUT `/scoring-settings`

GET returns `{revision,timeZone,showAvailability}`; absent storage is revision 0,
null timezone and false visibility. PUT takes
`{expectedRevision,timeZone,showAvailability}` and confirms saved values by a
separate canonical readback. This edits **shared weekly schedule metadata**, not
Friends participation, search area, radius, or a group-search queue.

Friends age/radius/goals/anchor settings continue through the existing versioned
`/api/matchmaking/friends-search-preferences` resource. Mode opt-ins remain in
existing detailed settings. The new endpoints do not opt anyone in automatically.

## Deployment and verification

No running database or hosted configuration was changed. The new Friends flag is
off by default and disabled endpoints return unavailable; there is no legacy or
fixture fallback. Startup fails if the flag is on without server and actor
credentials.

After the existing reconciled product contracts listed in
`scripts/product-schema.mjs`, apply:

1. `supabase/migrations/20261028000000_matching_signals.sql`
2. `supabase/migrations/20261028000100_dating_rules.sql` when installing the new
   Dating path; Friends depends on the existing reviewed Dating/photo runtime,
   not the new Dating scorer.
3. `supabase/migrations/20261028000200_friends_discovery.sql`

The historical migration directory alone does not install all reconciled product
contracts. Do not run these before that reconciliation, replace existing stored
schema blindly, or assume optional capability installation from source presence.
Validate in a marked network-isolated disposable database first.

`tests/integration/sql/friends-discovery.sql` supplies rollback acceptance for
passive/no-queue operation, Dating independence, age/block/Auth/reciprocal-filter
revalidation, safe projections, private RPC access, explicit acceptance,
idempotency, one connection/conversation, and unchanged active queue membership.
It replaces external enrichment only inside its rollback fixture transaction.

SQL acceptance, two-session races, installed PostGIS query plans and HTTP/database
load tests still need execution: Docker CLI is present but its daemon was not
available during this implementation. Unit tests and acceptance source do not
prove live Supabase/Auth/PostgREST behavior. No browser/device verification is
claimed because frontend hookup is deferred.

Focused tests cover scoring, aliases, missing data, bounded batches, projection
withdrawal/order/privacy, verified actor binding, missing configuration, request vs
acceptance, uncertain readbacks, and separate service/actor SDK calls. Dating's
existing scorer tests also cover the extracted common interval implementation.

Run `pnpm exec tsx scripts/benchmark-friends-scoring.ts` for a reproducible scorer
microbenchmark. Initial observation: 10,000 synthetic profiles; 1,000 serial
100-candidate rankings; Node v26.12.1, Intel Core Ultra X7 358H, 16 logical CPUs,
31 GiB RAM. 434 ms total; p50 0.408 ms, p95 0.690 ms, p99 0.820 ms. Zero database
queries/provider calls. This is CPU-only at concurrency 1, not a claim about API
latency, SQL load, production capacity or a dollar operating cost. No new paid
provider, dependency, service or worker is introduced.

Rollback API ranking through a reviewed application deployment; preserve all
additive schedule metadata, connections and chat history. Database ACLs remain
authoritative. Do not drop user data to roll back ranking.

## Follow-on work

- Messages-based active group matching and its independent consent/lifecycle.
- Hookup to `origin/wiring`'s `src/ui` screens, including batch retention,
  prefetch, failed-write recovery and relevant preference/block invalidation.
- Approved skip/decline/unmatch resurfacing and persisted recommendation sessions.
- Meaningful impressions, exposure-adjusted popularity, exploration and retention
  policies; no popularity boost is fabricated from raw historical request totals.
- Suggestions and persisted stable interest identifiers, and the five-versus-30
  interest decision. Existing canonical limits remain intact.
- Verify/disable legacy interest-save Gemini enrichment separately before claiming
  that the whole application sends no data to Gemini.

## Subsequent isolated database verification

The combined runner in `tests/integration/offline/run-matching-sql.py` has now
installed these migrations and executed the Dating/Friends rollback acceptance
against real PostgreSQL 18.6/PostGIS 3.6 in a fresh network-isolated Unix-only
cluster. Auth was synthetic; no app/hosted database or provider was contacted.
Earlier pending-execution notes above describe the initial implementation stage.
Active Friends lifecycle/concurrency verification is documented in
`active-friends-matchmaking.md`; its frontend hookup remains separate.
