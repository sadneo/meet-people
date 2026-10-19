# Discovery and raw-access privacy containment candidate

`discovery-privacy-migration.sql` requires the verified owner/contact, direct-social,
facts and detailed-settings candidates plus actual historical queue/Event definitions.
It is source for a reviewed atomic rollout, **not app database activation**. Definitions
collide rather than adopt unknown helper schemas. Replacement function owners must
match the reviewed installer; untrusted public CREATE and effective inherited raw
column/table/sequence/function grants abort installation.

The candidate withdraws browser raw access to profiles (including private DOB and
coordinates), interests, availability, queue entries, Events participation, outcomes
and legacy meetups. Canonical owner definer getters/saves remain available; no shared
profile/preferences are rewritten. Direct arbitrary-person scoring, schedule, profile
text, provider helpers, outcome writes and the old queue result RPC are withdrawn.
The active matcher replacement must restore only the reviewed result implementation.
Do not deploy this withdrawal alone and call production matching integrated.

Search requires current canonical readiness, adult campus-date eligibility, actual
global discovery consent and explicit Friends discovery on both sides. Bilateral
blocks exclude. The existing search result projection and legacy status names are
preserved; no DOB, coordinates or private schedules are projected. Queue status
returns the actual owner's mode and NULL for the withheld other-person count, never
a fabricated zero. Queue writers bind auth.uid(), prohibit Dating admission and
recheck actual canonical/global/mode consent. Active replacing downtime still uses
the existing single-row queue; no automatic background resume or lifecycle redesign.

Connections also enforce current readiness/discovery through legacy elevated DML.
Existing accepted connections retain their contact audience while discovery is off;
pending names are hidden once either person's audience is withdrawn. Retained message
bodies do not authorize live peer metadata after a block/inactivation/disconnection
or after unblocking a quarantined connection. Peer names/avatars become opaque.

Legacy hosted-event browse/recommendation/compatibility readers add current global
readiness/discovery and bilateral block checks while retaining existing ranking and
lifecycle. Compatibility still requires the actor's real event opt-in and a current
public event. Interested counts count only the actor plus eligible unblocked peers.
Raw participant rosters are denied. A new hosted-event interest is pair-fenced against
host blocks; withdrawing an old interest stays possible. Queue/event writers are
pinned to an empty search path and qualified relations. Legacy ranking readers use
`pg_catalog,public,pg_temp` with the public schema CREATE guard, so implicit temporary
relation precedence cannot redirect them. Existing event-group profile eligibility is
extended only when its exact reviewed source body/owner is present. No groups,
notifications, proposals or post-match lifecycle are created or redesigned.

## Executed verification

`tests/discovery-privacy.sql` ran in network-none PostgreSQL 17 with actual historical
core/RLS/04/05/06/07/08 definitions and reviewed candidate prerequisites. Only actual
pure interest helpers were loaded, with no provider HTTP/embedding functions/triggers.
It rolls back all fixtures and covers:

- Both ordinary browser roles: inherited DOB-column grants and 24 inherited sequence
  grant cases reject with the exact expected authorization error, retaining original
  grants after failed installs. Final raw table/column/sequence and scoring access denied.
- Unknown consent versus explicit consent, search exclusion, actual active-priority
  queue membership/readback/leave, no roster count and no legacy Dating enrollment.
- Hosted event visible before block and hidden after reverse block; hosted interest
  denied; a real unrelated eligible attendee remains stored but cannot bypass the
  blocked host audience. Positive provider-dependent scoring is **not** verified.
- Live metadata hidden after block/unblock quarantine, exact historical body retained,
  pending peer hidden after current global discovery withdrawal, owner facts readable.
- Hostile temporary queue/interest tables remain unchanged and cannot redirect the
  definer writes, owner status or event-interest counts.

Real concurrency: the original 32 owner/contact cases reran after privacy admission
with complete synthetic canonical profiles, preventing wrong-reason readiness denials.
Four hosted-interest/block commit/rollback orderings also passed with observed
`pg_blocking_pids` waits and asserted row poststate. The API-to-real-SQL direct-social
flow passed with privacy installed. Logs/drivers remain in ignored
`worktree/safety-owner-review/`.

Actual failures repaired: an initially quoted multi-schema search_path represented
one nonexistent schema; the first hosted-event race then exposed the old unpinned
writer failing under an empty-path caller. Neither failed run is counted as a pass.
The recommendation limit is bounded 1–30; this is pagination/resource protection,
not a new match-fit threshold.

Focused command: `pnpm --config.verify-deps-before-run=false exec vitest run
--configLoader runner --config vite.isolated.config.ts --environment node
tests/discovery-privacy.test.ts tests/social-api.test.ts tests/safety-owner-candidate.test.ts
tests/matchmaking-contracts.test.ts` (25 passed after the final writer repair). Frontend/API typechecks and git diff --check passed at checkpoint. Complete final
privacy source also installed for the first time in the separate original network-none
disposable; expanded SQL acceptance and the API-to-SQL flow passed again.

## Remaining enforcement and rollout gates

No all-surface safety certification. Full current event-group schema/worker/notification
integration is not exercised by this scaffold; UUID event-group Messaging is explicitly
unavailable pending its existing lifecycle contract. Positive provider-dependent Events
ranking, live PostgREST/Auth, full provider-extension migration replay and installed-app
verification remain unexecuted. Raw grants on an unknown existing DB require reviewed
catalog evidence, not assumptions from these tests. Trusted location issuance, real
nearby-first active matching, secure picture lifecycle and integrated rollout remain.
Downtime matching framework stays deferred/last. No provider or app DB action occurred.
