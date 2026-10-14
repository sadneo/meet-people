# Account profile migration candidate — parent review/install only

`account-profile-matching-migration.sql` is a candidate, not an applied migration.
No `supabase/**` file is changed. `tests/account-profile-matching.sql` is an
unexecuted transactional behavioral test candidate. The parent owns installation
and disposable DB validation; do not apply this to a running environment here.

## Preconditions and review

- Existing `public.profiles` has `id`, `username`, `display_name`, `bio`,
  `avatar_url`, `updated_at`; IDs reference real Auth accounts. Existing
  `get_matchmaking_profile()` / `save_matchmaking_profile(jsonb)` remain installed.
- Review column types, uniqueness/collation, existing profile triggers, grants,
  SQL/Zod Unicode trimming and URL parity, and profile RLS before installation.
  Candidate uses PostgreSQL `btrim`; JavaScript trims additional Unicode
  whitespace. Backfill preserves existing identity text byte-for-byte.
- Review username reservation between legacy and account-only actors. The
  account unique constraint and legacy unique constraint enforce committed
  writes; run concurrent account/legacy creation and rename probes, including
  actors without a legacy profile. Account-only usernames are projected when a
  legacy row is later created. No uniqueness rule is relaxed.
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
availability in that state. If account RPCs are missing or fail, the UI explicitly
shows full legacy compatibility, not an account save. No dual-write fallback is
implemented in Express or the browser. Account UI has an unavailable state until
the candidate RPCs exist.

## Parent-only validation and rollback

In a disposable database with synthetic Auth fixtures, run the SQL candidate
tests and the existing matching-profile regression tests. Stub any embedding
boundary to reject HTTP; these candidate tests add no interests and perform no
scoring. Verify invalid/extra fields, missing auth, anonymous denial, RLS isolation,
username-conflict rollback, protected-column preservation, old RPC payloads,
backfill preservation, unchanged algorithm definition, and concurrent account /
legacy writes. Capture before/after protected-column and table counts. Candidate
SQL has **not** been executed, including syntax/transaction/concurrency checks.

Rollback: remove `account_identity_projection`, then
`project_account_identity()`, `save_account_profile(jsonb)`,
`get_account_profile()`. Preserve/export the canonical table as appropriate before
dropping `account_profiles` and `valid_account_identity(jsonb)`. Existing
`profiles` and matching tables/RPCs must remain. Rolling back canonical support
returns the UI to explicit legacy compatibility; identity already projected to
legacy profiles remains real persisted data.
