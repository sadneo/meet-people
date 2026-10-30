# Dating rules: initial backend slice

Branch: `feat/new-matchmaking`. This is an incremental implementation, not a
completed replacement of the redesign's fixture flows. No migration, provider
configuration or hosted service has been changed by writing these files.

## Implemented boundary

Postgres filters by eligibility/geography. Express reads a maximum of 100 private
candidate signal records through a **service-role-only RPC**. TypeScript computes
compatibility, then an actor-JWT RPC locks and revalidates each selected person
before constructing a separate public profile. At most three candidates are
revalidated per request. Private inputs/scores are never returned by HTTP.

`DATING_RULES_ENABLED=false` is the default. With it off, existing candidate lookup
remains active. With it on, missing server credentials fail startup; unavailable
SQL/scoring fails the request rather than silently using legacy ranking.

The matching calculation makes no Gemini/LLM/embedding calls. Legacy interest-save
triggers and the deployed embedding function are outside this slice and must be
separately disabled/verified before claiming the whole app is Gemini-free.

## Profile and preferences

Use canonical profile interests and `public.availability`; no duplicate schedule
is introduced. Preserve the existing three-interest readiness minimum and
30-interest storage limit pending a decision about the redesign's five-interest
limit. Bio, education, occupation, languages, pronouns, sexuality, height and
relationship style do not affect compatibility scores. Gender is used only for
explicit reciprocal partner targets.

`clarifiedTargets` remains the wire/storage name for explicitly selected partner
genders. All sexualities use explicit selection; no sexuality-derived targets.
The existing two-save identity-change confirmation rule is preserved. The new
migration makes `dating_clear_targets` return NULL, so the existing SQL validator
accepts explicit targets for every identity. Existing enabled profiles lacking
explicit targets are paused with incremented revisions. No inferred preferences
are backfilled, and no existing connection/message is removed.

Shared owner-only schedule settings (`20261028000000_matching_signals.sql`) add a revision, nullable IANA timezone and
`showAvailability` (default false). The discovery-profile-details migration adds
one coarse shared weekday/period only when both accounts opt in and have at least
30 common minutes in the upcoming 14 days. It exposes no exact schedules, dates,
or private interval bounds. The existing React Dating screen has a lazily loaded
explicit timezone form. It never assumes the browser timezone, writes on mount,
or copies profile home/device location into Dating search.

The standalone `src/alt` app still uses fixture authentication and data. It is not
silently connected to real accounts by this change. Its remaining integration
requires the existing real authentication/account boundary.

## Eligibility

Keep existing canonical readiness, active account, persisted global + Dating
consent, explicit Dating enablement, current selected mode anchor, bilateral
blocks, reciprocal age and exact target checks. Add explicit anonymous/deleted/
banned Auth exclusions to the new path. Keep the existing adult campus calendar
(`America/New_York`, age 18+) and strict age/distance bounds. Flexibility switches
do not relax anything. Relationship style is not a hard filter.

Geography uses the existing `dating_search_location_refs`, an expression GiST
index, `ST_DWithin` in meters and spheroidal `ST_Distance`. Both radius limits must
hold. There is no fallback to profile coordinates or device location.

Established or pending contacts are excluded from fresh recommendations. Existing
request handling is retained and uses the new bilateral hard checks at commit.
It remains connection requests, not a new, mode-isolated mutual-like protocol.
Profile/Auth/consent/location locks fence projection and request writes. SQL
integration and concurrency acceptance still need execution in a disposable DB.

## Scoring v1

All components are 0–1. Scores are internal compatibility signals, not acceptance
probabilities. Fixed weights avoid rewarding missing fields through per-user
weight redistribution. Unknown signals use a fixed 0.5 prior, never perfect fit.
Known zero overlap is 0. Missing timezone is unknown, not a claim of overlap.
The prior remains a hypothesis and missing-data manipulation must be evaluated.

| Component | Weight | Calculation |
| --- | --- | --- |
| Dating intention | 0.35 | Explicit long/short willingness sets. `sqrt(common / size(A) * common / size(B))`. “Still figuring it out” and absent intention use the neutral prior. |
| Interests | 0.30 | Canonical set intersection / union. Empty union uses the neutral prior. |
| Availability | 0.20 | Merge intervals, intersect UTC instants, count only continuous overlaps of at least 60 minutes; total capped at 240 minutes over the next 14 days. |
| Distance | 0.15 | `sqrt(max(0,1-distance/radiusA) * max(0,1-distance/radiusB))`. Radius eligibility is separately enforced. |

Intention mapping is an initial documented hypothesis, not a validated model:
long-term → {long}; long-term/open-to-short and short-term/open-to-long →
{long,short}; casual → {short}. Style and sexuality never supply these values.

Interest aliases are editable in `shared/interests.ts` and versioned. NFC,
whitespace collapse and lowercase preserve labels while matching normalized custom
entries. Only curated aliases merge; no fuzzy matching, embeddings, broad/subtopic
merging or bio extraction. Canonical sets prevent alias double counting. This
slice does not yet persist stable interest UUIDs or implement suggestion search.

Postgres expands weekly windows onto actual dates with the user's confirmed IANA
zone and returns clipped UTC intervals. Adjacent-day pieces represent overnight
windows; TypeScript merges them. The existing editor/storage only accepts same-day
pieces; a new overnight editor adapter is not included yet. Spring-gap endpoints
that do not round-trip are discarded. Ambiguous fall endpoints use PostgreSQL's
standard-time interpretation. Actual elapsed time is intersected, not naive weekly
clock minutes. SQL DST conversion acceptance is supplied but not yet executed.

The current pool is the nearest 100 eligible candidates. Rank within that bounded
pool with deterministic UUID ties. No all-user pair matrix is generated. Each
request recomputes the ranking; this is **not yet a stable persisted batch**.

## HTTP contract

All endpoints require a verified bearer token, have no-store responses, reject
unexpected request fields and never accept an actor ID from the client.

| Method/path under `/api/matchmaking` | Input | Output |
| --- | --- | --- |
| GET `/dating/status` | none | Existing runtime/aggregate/eligibility document |
| PUT `/dating/enabled` | expectedProfileRevision, expectedSearchRevision, enabled | Confirmed runtime |
| POST `/dating/candidate` | excludedIds: up to 50 distinct UUIDs | candidate: public profile or null |
| POST `/dating/requests/:target` | empty object | Existing sent/connected state and nullable conversationId |
| GET `/dating/scoring-settings` | none | revision, nullable timeZone, showAvailability |
| PUT `/dating/scoring-settings` | expectedRevision, nullable timeZone, showAvailability | Saved settings after canonical readback |
| GET/PUT `/dating-preferences` | Existing versioned owner aggregate | Existing confirmed owner aggregate |

HTTP status codes: 400 invalid input, 401 sign-in required, 403 unavailable contact,
409 stale revision/eligibility change, 502 malformed upstream response, 503 missing
capability or uncertain operation. Unknown write outcomes require a read; there
are no automatic write retries or provider diagnostic responses.

## Migration and rollout

The new migration is `supabase/migrations/20261028000100_dating_rules.sql`.
It deliberately refuses installation when reviewed product prerequisites are
missing. The repository's historical migration directory alone does not establish
these prerequisites: `scripts/product-schema.mjs` lists the reconciled owner,
settings, safety, social, privacy, Dating aggregate, location, photo, Dating runtime
and real-account-boundary SQL. Verify those exact installed contracts first.
This migration must run **after** that product reconciliation; do not inject it
into an earlier chronological bootstrap or edit applied historical migrations.
The deployment pipeline is not changed to activate it automatically.

1. Keep the flag off. Reproduce the reconciled product schema in an isolated,
   disposable Supabase/Postgres instance with PostGIS. Never point tests at live.
2. Apply the migration there and execute `tests/integration/sql/dating-rules.sql`
   with its required disposable marker. Test old Dating read/request behavior too.
3. Exercise two-session block/consent/filter/Auth changes against projection and
   requests, and stale/duplicate timezone writes. Inspect actual GiST query plans.
4. Resolve the product decisions below and finish remaining lifecycle/frontend
   work before presenting this as the handoff's full Dating system.
5. Deploy the schema before the new explicit-target clients. Confirm saved legacy
   users are paused without losing contacts. Enable the flag only in the sandbox
   after acceptance, then expand gradually.

Rollback the ranking via `DATING_RULES_ENABLED=false`. Do not restore inferred
sexuality defaults or re-enable paused users. Keep additive settings/schema and
existing contacts. Do not drop tables or downgrade explicit consent to roll back
an algorithm. The new explicit-target client requires the SQL target-policy
change even when TypeScript ranking is off.

## Verification and cost evidence

Commands: `pnpm typecheck`, focused Vitest suites, `pnpm build`, changed-file
ESLint, `pnpm exec tsx scripts/benchmark-dating-scoring.ts`.

Initial CPU microbenchmark: 10,000 synthetic profiles, 1,000 serial rankings of
100 candidates each; Node v26.12.1, Intel Core Ultra X7 358H, 16 logical CPUs,
31 GiB host RAM. Observed 292 ms total; p50 0.283 ms, p95 0.354 ms, p99 0.434 ms.
These are local scorer-only measurements at concurrency 1, zero database queries
and zero provider calls. They do not establish HTTP latency, SQL cost, production
throughput, contention behavior, or feasibility on a smaller pilot instance.

No matching provider billing is introduced. API/Postgres compute, storage and
network remain operating costs. The proposed 2–4 vCPU / 4–8 GB pilot remains an
unverified planning assumption pending database/API load testing; no dollar cost
or guaranteed capacity is claimed.

Baseline full unit suite on untouched commit 108e15a: 25 failures in 7 files,
818 passing tests. These concern existing profile/access/routing/logout behavior.
Focused new/revised Dating tests are verified separately. SQL files are acceptance
sources, not evidence that a live Supabase database has accepted the migration.
Browser/device rendering has not been certified by component tests.

## Remaining Dating work and decisions

- Persist stable batches/current-card cursor and incoming-like insertion.
- Separate Dating likes from generic Friends connection requests; atomic mutual
  like creation, skip/undo/decline/unmatch and approved resurfacing rules.
- Meaningful impression definition/deduplication, 90/10 popularity, smoothing,
  retention/access controls and roughly one-in-five exploration. No popularity
  values are fabricated from raw historical counts in this slice.
- Visibility-aware reasons, custom-interest IDs/suggestions, canonical profile
  timezone/overnight editing, and the redesign's authenticated integration.
- Decide five versus 30 interests, intention mapping, flexible filter semantics,
  missing-data prior, and lifecycle/telemetry policies before launch.
- Execute SQL integration/race/load tests and narrow/short viewport checks.
- Prove all legacy profile-save/provider paths are Gemini-free for launch.

Friends discovery, manual groups, group growth and Garden are outside this scope.

## Subsequent isolated database verification

The combined runner in `tests/integration/offline/run-matching-sql.py` has now
installed these migrations and executed the Dating/Friends rollback acceptance
against real PostgreSQL 18.6/PostGIS 3.6 in a fresh network-isolated Unix-only
cluster. Auth was synthetic; no app/hosted database or provider was contacted.
Earlier pending-execution notes above describe the initial implementation stage.
Active Friends lifecycle/concurrency verification is documented in
`active-friends-matchmaking.md`; its frontend hookup remains separate.
