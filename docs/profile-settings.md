# Profile and settings backend

Backs the prototype's Profile, Other User Profile, Settings, and Onboarding
screens. Like the events API, every route verifies the caller's Supabase bearer
token and then uses the service role; identity always comes from the token and
user IDs in request bodies are rejected. Schemas shared with the browser live in
`shared/profile.ts`.

## Schema (`20261008120000_profile_settings.sql`)

- `profiles` gains `pronouns`, `intents`, `usual_times`, `max_distance_miles`
  (1–100, default 5), `group_preference` (`one_on_one` | `group` | `either`), and
  `onboarded_at`, plus constraints matching the API limits. Usernames are
  lowercase `[a-z0-9_]{3,30}` and unique.
- `profiles.username_changed_at`: usernames can change once every 30 days
  (choosing the first one is free). The own-profile view includes
  `username_changeable_at`.
- `user_settings`: one row per profile, created by trigger. Users may read/update
  only their own row via RLS.

  | Column | Default | Effect |
  | --- | --- | --- |
  | `notifications` | on | Stored; no notification system yet |
  | `discoverable` | on | Hides the profile from others (API + RLS) |
  | `share_availability` | on | Connections see free-time windows |
  | `nearby_suggestions` | off | Stored; should gate use of saved coordinates |
  | `dating_enabled` | **off** | Dating is opt-in (see follow-ups) |
  | `downtime_matching` | off | Stay in the downtime queue while away (see follow-ups) |
  | `locale` | null | BCP 47 tag; null follows the device |
  | `timezone` | null | IANA zone; null follows the device |
- `data_export_requests` + private `exports` bucket: JSON exports kept 7 days.
- `user_reports`: written by the API, readable only by the service role for
  moderation. Reasons: `harassment`, `inappropriate_content`, `impersonation`,
  `other`.
- `avatars` storage bucket: public read, 2 MB, JPEG/PNG/WebP. Only the API issues
  uploads, always into `<user id>/`.
- Service-role functions: `save_profile`, `profile_snapshot`, `block_user`,
  `blocked_users`, `list_sessions`, `revoke_sessions`, `export_user_data`.
- `config.toml` enables TOTP (authenticator app) MFA. Enrolment and
  verification use the Supabase client SDK directly (`supabase.auth.mfa.*`).
- `is_discoverable(uuid)` is callable by anyone. The profiles read policy uses it,
  so hidden profiles disappear from direct reads. **Matching functions
  (`get_queue_match`, `get_dating_match`, `search_people`, event flow) are
  `security definer` and do not check it yet.** Add
  `and public.is_discoverable(p.id)` next to their `p.is_active = true` filters.
  Likewise `join_queue` should refuse `dating` unless `dating_enabled`, and
  `downtime_matching` should keep the user's `downtime` queue entry in sync.
- The interest-embedding trigger now saves the interest with a null embedding,
  rather than failing the whole save, when the embedding service is
  unavailable. Matching already ignores null embeddings.

## API

All routes need `Authorization: Bearer <access token>`.

| Route | Purpose |
| --- | --- |
| `GET /api/me` | `{ account, profile, settings }`. `profile`/`settings` are `null` before onboarding. Updates `last_seen_at`. |
| `PATCH /api/me/profile` | Create (first call needs `username` + `display_name`) or partially edit. Absent fields are unchanged and `null` clears them. `interests` and `availability` replace the whole set. `onboarded: true` stamps `onboarded_at` once. Returns the profile. 409 when the username is taken. |
| `GET /api/me/username?username=` | `{ username, available }` (normalized; your own counts as available). |
| `GET`/`PATCH /api/me/settings` | Read or partially update the four toggles. |
| `POST /api/me/avatar` | `{ content_type }` → `{ path, token, signed_url, public_url }`. Upload with `supabase.storage.from('avatars').uploadToSignedUrl(path, token, file)`. |
| `PUT /api/me/avatar` | `{ path }` after uploading: sets `avatar_url` and deletes older avatar files. |
| `DELETE /api/me/avatar` | Clears the avatar and its files. |
| `GET /api/me/blocks` | `{ blocked: [{ id, username, display_name, avatar_url, blocked_at }] }`. |
| `POST /api/me/email` | `{ email }` → 202 `{ pending_email }`. Supabase emails both addresses; the change applies once both confirm. 409 if taken. |
| `POST /api/me/password` | `{ password }` (8–72). Sets or replaces the password, so email-link users can add one. 204. |
| `GET /api/me/sessions` | `{ sessions: [{ id, created_at, last_active_at, user_agent, ip, aal, current }] }`. |
| `DELETE /api/me/sessions` | Signs out every other device → `{ revoked }`. The client signs itself out with `supabase.auth.signOut()`. |
| `DELETE /api/me/sessions/:id` | Signs out one session. Its access token is rejected immediately. 204. |
| `POST /api/me/exports` | Builds a JSON export of everything stored about the user → 201 `{ id, created_at, expires_at, download_url }` (link valid 1 h). Once per 24 h (429). |
| `GET /api/me/exports` | Unexpired exports with fresh links; expired ones are deleted. |
| `DELETE /api/me` | Body `{ "confirm": "DELETE" }`. Permanently deletes avatar files and the auth user; everything else cascades. 204. |
| `GET /api/profiles/:id` | Public profile. 404 if inactive, hidden, or blocked in either direction. `availability` is non-null only for an accepted connection of someone sharing it. |
| `POST`/`DELETE /api/profiles/:id/block` | Block (idempotent; also removes any connection and ends dating matches) or unblock. 204. |
| `POST /api/profiles/:id/report` | `{ reason, details? }` (details ≤ 400). 201. Max 10 per reporter per 24 h (429). |

**Two-factor step-up:** once a user has a verified MFA factor, the email,
password, session-revocation, export, and account-deletion routes return
`403 { code: "mfa_required" }` unless the access token is `aal2`. The client
should then run `supabase.auth.mfa.challenge`/`verify` and retry.

`GET /api/me` also returns `account.pending_email`, `account.providers`, and
`account.mfa_enabled`. A username change within 30 days returns 429.

Validation highlights: display name ≤ 30, bio ≤ 160, pronouns ≤ 30, city ≤ 80,
age ≥ 13, coordinates set/cleared together, ≤ 20 interests / 10 intents / 7 usual
times (case-insensitively unique), availability windows `HH:MM` 24-hour with no
same-day overlap.

## Verification

```bash
pnpm verify
```

`tests/profile-api.test.ts` covers the routes against a mocked Supabase.
`tests/profile-settings.sql` covers the SQL (partial edits, uniqueness,
visibility, availability sharing, blocking side effects, cascading deletion,
role privileges, and RLS) inside a transaction that rolls back. Run it after
the migrations:

```bash
docker exec -i supabase_db_meet-people psql -U postgres -v ON_ERROR_STOP=1 < tests/profile-settings.sql
```

## Prototype Settings screen

`src/features/prototype/Settings.tsx` shows every setting and account control in
the existing Settings style, using local demo state only. It does not call this
API yet. Username, email, password, two-factor (including the code prompt before
sensitive actions), sessions, data download, delete account, language, and time
zone all work against the prototype reducer. The Downtime Matchmaking toggle and
the Settings "Downtime matching" switch share one setting, saved on the device.
When the screens are connected to real data, swap the reducer actions for the
routes above.
