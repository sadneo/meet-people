# Direct Messaging and Connections compatibility candidate

This additive candidate implements the existing UUID frontend contracts over the
historical bigint contact tables. It does not replace, delete or rewrite stored
messages, connections or conversation history. Random private UUID alias tables
provide stable public IDs. Historical message IDs provide ordered safe-integer
sequences, with no claim that sequences are consecutive within each conversation.

Prerequisites: historical core/RLS/connection/messaging definitions, prior safety
guard, owner/contact safety candidate, profile-details candidate (pinned text
validation), actual account_settings and detailed-settings candidate. Install
`social-contact-migration.sql` only after those candidates in a reviewed disposable
first. Never apply it to the existing app database without explicit approval.
Schema collisions abort; no unknown schemas are adopted. Private table, column,
helper and inherited effective grants are checked. Historical out-of-range message
sequences abort before backfill instead of creating invalid frontend responses.

`api/social.ts` mounts `/api/connections` and `/api/conversations` using verified
user tokens and the public-key actor transport. No service-role actor client,
request-selected actor, arbitrary function name, anonymous access, or fallback
sample conversation is used. Missing SQL stays unavailable. Errors are bounded;
unknown writes, deadlocks and malformed responses require reload rather than a
success claim or automatic retry. Message retry keys are actor-scoped, retain
exact content, serialize concurrent replay, and conflict on changed body/chat.

| HTTP | Fixed actor RPC |
| --- | --- |
| GET connections | social_connection_list |
| GET/POST/DELETE connections/:target | social_connection(get/request/remove) |
| POST connections/:target/accept | social_connection(accept) |
| GET conversations?page= | social_inbox |
| GET conversations/activity | social_activity |
| GET conversations/:id/messages?before= or after= | social_history |
| POST conversations/:id/messages | social_send |
| POST conversations/:id/read | social_read |

Requesting a person who already sent a request accepts it, as the existing client
contract specifies. A sender cannot accept their own pending request. New requests
and acceptance require current valid persisted onboarding facts, adult campus-date
eligibility and bilateral global discovery consent. Completion follows actual facts, as canonical reconciliation requires; a missing
stored marker does not force valid legacy users to repeat onboarding. A forged
completed marker alone is insufficient: interests, home, DOB, schedule and private intent/distance/group
are rechecked. Existing contact/history reads do not infer new discovery consent.

Daniel delegated the historical visibility choice on 2026-10-19. Recommendation
adopted: members can read existing history after a block, while new contact and
receipts are denied. Blocked participants' current names/avatars and peer read
positions are redacted; IDs are honestly opaque. Blocked histories contribute no
unread count. Removing a connection stops contact but retains history. Unblocking
cannot remove the prior relationship's permanent quarantine or recreate it.
An explicitly removed relationship requires a new request and acceptance before
contact can resume. Read positions only advance and cannot target another chat's
message. Malformed historical sender rows cannot authorize a selected read cursor.

Event-group creation and leaving remain explicitly unavailable. No group lifecycle,
membership conversion, worker or post-match flow is invented. The existing frontend
supports event_group records, but this candidate supplies direct conversations only.
This remains a material gate before any claim that every Messaging/Events surface
is implemented; historical Events source is independently reviewed elsewhere.

## Executed evidence and limits

- Real PostgreSQL acceptance: `tests/social-contact.sql`, rollback-scoped, in the
  verified network-none PostgreSQL 17 disposable. Covers request/accept/readback,
  idempotent send, changed-key conflict, foreign history/send/receipt denial,
  unread/monotonic reads, block directions, retained exact history, non-restoring
  unblock and effective private ACLs. Re-execute after each source repair.
- `tests/social-api.test.ts`: in-memory Express contract and actual SDK envelopes
  with injected fetch. Not database or live Auth proof.
- `pnpm --config.verify-deps-before-run=false exec tsx tests/offline/social-api.ts`:
  actual Express router -> actual candidate SQL, persisted across separate RPC
  transactions, synthetic verifier only. Checks network-none/no ports and the
  fixed disposable marker before writes; collision-checked fixed fixtures cleaned
  afterward. No credentials or app DB connection accepted. This is not live JWT
  verification, PostgREST, provider or deployed integration proof.
- Existing Messaging tests needed fixture reconciliation: obsolete AccountBoundary
  mock plus tokenless signed-in session caused an infinite redirect loop. The
  fixture now uses the real SessionRequired boundary, valid canonical account
  read fixture and central signed-out redirect; assertions on messaging behavior
  and absence of private signed-out requests are retained.

Current executed verification: four API tests, 24 rendered Messaging/Connections
checks, expanded real SQL acceptance and API-to-SQL flow passed. Ten additional
public social send/read versus block and concurrent send-key replay cases passed
with real observed waits and poststate assertions, including winner rollback.
Self-review repaired completed-marker-only eligibility, infinite DOB, exact Unicode
message limits and inactive-profile contact; source now uses canonical profile SHARE
fences before the existing pair fence. The complete repaired candidate then installed from source in a third fresh,
network-none PostgreSQL 17 disposable; expanded SQL acceptance and the actual
API-to-SQL flow passed again. This is bounded prerequisite/candidate replay, not
the complete extension/provider migration history.

Remaining:
raw discovery/queue/privacy closure, Events/group integration and offline frontend
flow/visual inspection. No app activation or all-surface safety certification.
