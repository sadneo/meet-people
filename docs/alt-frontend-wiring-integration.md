# Alt frontend and wiring integration

The integration branch starts at `origin/alt-frontend` (`806e09d`) and merges the
preserved wiring checkpoint `0461c3b`. Alt frontend is authoritative for product
layout, passive Friends/Dating recommendations, active Messages groups, profile
settings, relationship modes and the Google search-area picker. Its matching
algorithms and historical SQL migrations are retained.

The wiring changes retain public event reads through the current service-only
RPC, native messaging error handling, Enter/Shift+Enter shortcuts, automatic event
group status updates, the waiting spinner, closed-event join gating and demo
population. Event cards retain the new layout with an invitation to find company;
the retired API no longer supplies public interest counts. The old Find Friends
queue UI is superseded by passive discovery. Development population opts profiles
into that discovery without enrolling them in the legacy queue.

The original checkout and its running server remain on `wiring`. Work is isolated
in `worktree/alt-frontend-wiring`. No remote branch, deployment, account or running
database is changed by this Git integration.

## Existing local database

The current local backend uses native UUID conversations and bigint connections.
The new canonical relationship-mode migration assumes the historical conversation
alias table in its inbox projection. `uuid-relationship-mode-projection.sql`
adapts only that projection to the existing native inbox and annotates the actual
recorded relationship mode. It preserves membership, messages, receipts, ordering,
pagination and the new mode policy.

Prepare the matching upgrade for an already activated native UUID backend:

```sh
python scripts/prepare-local-demo-activation.py --uuid-messaging --matching-upgrade
```

This writes an atomic review bundle and source hashes under
`worktree/safety-owner-review/`. It does not apply SQL. Its inventory guard requires
the reviewed base capabilities, PostGIS in `extensions`, and no existing
`matching_private` schema. A fresh canonical bigint environment uses the unchanged
alt frontend migration track instead. Do not reset or replace an existing database
to change tracks. Google map search still requires its documented configuration.

The disposable population test installs the exact native upgrade bundle against
an empty schema-only copy, creates synthetic identities, exercises passive
Friends/Dating, native inbox relationship-mode metadata, fixture reruns and actual
event groups. Its embedding function raises on every call; event grouping uses
the local interest/availability policy without Gemini.

## Validation

App/API builds and demo TypeScript checks passed. All 470 unit tests and all 120
browser tests passed, covering the new product flows and retained wiring behavior.
The disposable database population/upgrade test passed, including actual Friends
request acceptance with recorded mode in the native UUID inbox and real event
groups without provider calls. Focused lint on changed wiring files passed.
The inherited full
repository lint failures include the standalone `src/alt` prototype, Node script
globals and older hooks; changed wiring files are linted separately. Live migration
activation and provider credentials are separate from this merge's verification.
