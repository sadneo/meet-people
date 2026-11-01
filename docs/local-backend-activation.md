# Local backend activation — October 29, 2026

The alternate frontend's Express routes depend on feature RPCs maintained in the
reviewed SQL sources now under `supabase/schema-sources/`. At the time of this
activation, the migrations alone did not install these features. Fresh databases
now install the generated prerequisites described in [deployment](deployment.md).
The local database had 34 missing API RPCs,
causing unavailable states for profile facts/photos, detailed settings, Friends
and Dating, search locations, safety, connections and messaging.

The local `supabase_db_meet-people/postgres` database has now been activated with
explicit user approval. No hosted database was changed.

## Native UUID messaging compatibility

The original 15-source demo bundle assumes the earlier bigint conversation/message
tables. The installed `20261013125000_messaging.sql` migration has already replaced
those tables with native UUID conversations/messages, conversation participants,
per-conversation sequence numbers and client request IDs. The original activation
failed its safety prerequisite and rolled back in full.

Use the native UUID variant for this schema:

```sh
python3 scripts/prepare-local-demo-activation.py --uuid-messaging
```

This prepares a reviewable bundle; it does not connect to or apply SQL. It replaces
the three legacy safety/social sources with
`supabase/schema-sources/uuid-safety-owner-migration.sql` and
`supabase/schema-sources/uuid-social-contact-migration.sql`. The other feature sources and their
dependency order remain the same. Do not modify or replay historical migrations
to make the legacy bundle accept a UUID database.

The adapters derive the actor from the authenticated JWT and retain the installed
service-only messaging implementation for membership, history pagination, native
IDs, message ordering, rate limits and read positions. Owner block/report RPCs,
pair locks, private metadata projections and contact quarantine follow the
existing feature contracts. Retry keys are also checked across conversations.
The native connection lifecycle and daily request log remain in place.

Prepared and applied bundle:

- `worktree/safety-owner-review/local-uuid-activation.sql`
- Manifest: `worktree/safety-owner-review/local-uuid-activation-manifest.json`
- 14 source files, one guarded transaction, bounded locks/statements and a
  PostgREST schema-cache notification.
- SHA-256: `bdc56c366cceab7fa6703f3926c2d9c29c1a10f3c318ae3488bdf876de9ea699`.

This is a one-time activation, not an idempotent installer. Existing feature
schemas or publisher roles require inventory and review. Do not rerun it on this
already activated database.

## Data preservation and validation

An owner-only custom-format backup and table-hash baselines are retained in the
ignored `worktree/local-backend-activation-20261030T010239Z/` directory. The backup
contains the affected public app schema/data and migration history. Treat it as
private; it is not committed.

Immediately after migration, all 24 pre-existing public tables retained their row
counts and data hashes except `account_settings`. Its derived completion markers
were reconciled; hashing all its other fields confirmed they were preserved.
No profiles, conversations, messages, event listings or queue memberships were
reset. UUID chat rows were neither copied nor replaced.

Before applying locally, the entire adapted bundle passed against an empty
schema-only disposable database. No live app/Auth rows were copied. Embedding
generation was replaced with an offline raising stub in that disposable database.
`tests/integration/sql/uuid-social.sql` passed synthetic onboarding, facts/settings
saves, capability reads, connection request/accept, inbox/history, idempotent sends,
read positions, unrelated-user and anonymous denial, and block/unblock quarantine.
The test rolls back fixture mutations and refuses the app database. Disposable
databases and the test-only publisher role were removed before local activation.

Live acceptance used the dedicated development account:

- All 54 API-referenced public RPC names are installed.
- All 17 checked API reads returned HTTP 200, including the previously failing
  resources. Unchanged-value facts/settings saves passed authoritative readback.
- Actual browser sign-in, Profile, Settings, Messages, Activity, event cards/details
  and group-queue reads, Friends, Dating, and both preference dialogs passed.
- The new social API tests cover native messaging denial, conflict, invalid-input
  and rate-limit errors. All 353 unit tests passed, along with TypeScript, the API
  build, focused lint and diff checks.

This verifies installed capabilities and the specified reads/saves. It does not
claim a new live match, sent message, uploaded photo, reported person, provider
delivery, or all-surface concurrency certification. Matching still requires
explicit discovery consent, mode preferences and a usable search location.
The reviewed location catalogue starts empty; no user/device coordinates or
unreviewed catalogue entries were added during activation. Garden remains local,
and the existing limitations on event-group chats and account deletion/export
still apply.
