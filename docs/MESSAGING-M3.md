# Messaging (M3)

## Status

`feature/messaging-backend` includes `dev` (forest UI, matchmaking, event group
queue), a reworked messaging backend and connection requests. Both migrations,
`tests/messaging.sql` and `tests/connections.sql` pass against `dev`'s full
migration chain in a disposable Supabase Postgres 17 container. Neither migration
has been applied to the team database.

Messages is real and authenticated: inbox, history, sending, polling, unread
counts, read receipts, and leaving group chats. There are no sample chats or
local-storage fallbacks. Signed-out visitors are sent to central sign-in.

**How a chat starts.** **Connect** on a matchmaking candidate sends a request.
The other person sees it under **Requests** at the top of Messages (and a dot
on the Messages tab); **Accept** opens the new direct chat. Once connected, the
candidate card shows **Message**. Event-group chats still exist in the backend
but have no entry point: **Message group** lives in
`src/features/events/Company.tsx`, which `dev` no longer mounts.

## What changed from the first version

| Problem | Resolution |
| --- | --- |
| Clashed with `dev`'s draft `conversations`/`messages` (`relation already exists`) | The migration replaces the draft tables, functions and connection trigger. Draft rows carry over as direct chats. |
| Leaving a group kept chat access | Membership follows its source: leaving the group or ending the connection leaves the chat. |
| Blocks ignored | `public.blocks` hides messages between the pair everywhere and stops sends in direct chats. |
| Deleting an account erased its messages for everyone | Messages stay; `sender_id` becomes null ("Deleted user"). |
| No rate limit | 30 messages per sender per minute, enforced in SQL. |
| Errors were silent and `42501` looked like "not a participant" | SQL raises app-specific codes (`MSG01`–`MSG12`); anything else is logged and returns 503. |
| No incoming messages without Refresh | Visible-tab polling: open chat every 5s (`after=` cursor), inbox every 30s, or every 5s while a request you sent is waiting so its chat appears soon after it is accepted. A sent request's **Connect** card also checks every 5s and switches to **Message**. |
| No unread counts or read receipts | Per-member `last_read_seq`; inbox unread dot, "Seen" / "Seen by …" on your latest message. |
| Names from `event_profiles` only, no avatars | `profiles.display_name`/`avatar_url` (active profiles only, https avatars only), then the event name, then "Student". |
| Hand-written `database.ts` | Regenerated from the migrated database; it now also includes `dev`'s own tables. |
| Old `e2e/messages.spec.ts` assumed sample chats | Removed; specs that visited `/messages` now expect the real signed-out or mocked signed-in UI. |

## Database (`supabase/migrations/20261013125000_messaging.sql`)

| Table | Notes |
| --- | --- |
| `conversations` | `kind` (`direct` \| `event_group`), unique `source_key` (`direct:<a>:<b>` sorted, or `event_group:<group id>`), `last_seq`. One chat per source. |
| `conversation_participants` | `(conversation_id, user_id)`; `joined_after_seq`, `last_read_seq`, `left_at`. Only rows with `left_at is null` are members. |
| `messages` | `seq` is unique per conversation and taken under the conversation row lock, so seq order is commit order. Sender FK sets `sender_id` null on account deletion. Unique `(conversation_id, sender_id, client_request_id)` makes retries idempotent. |

RLS is on and browser roles have no table or function access; every
`messaging_*` function is executable by `service_role` only. Express verifies the
token and passes the user ID. All functions pin an empty `search_path`.

Membership rules:

- **Direct:** a trigger on `connections` opens the chat when a connection
  becomes accepted and closes it for both when it stops being accepted or is
  deleted (so a `block_user` that removes the connection closes the chat).
  Reopening restores the history. Direct chats cannot be left separately.
- **Event group:** `POST /api/conversations` creates the chat for the current
  members (caller must be a member of a group of 2+). Triggers on
  `event_group_members` add later joiners and remove leavers. A new or returning
  member only sees messages sent after they (re)joined. Members may also leave
  the chat alone; another member opening the chat does not re-add them.
  Deleting the event itself does not remove anyone.
- **Blocks:** a member never sees messages from someone they have a block with
  (either direction). Direct sends across a block fail with the same message
  either way round, so nobody learns they were blocked. Group sends are allowed.
- Sending needs at least one other current member.

Trigger functions are `SECURITY DEFINER` because browsers accept connections
directly under RLS. They write only to messaging tables.

## Connections (`supabase/migrations/20261013130000_connection_requests.sql`)

Browsers can read their own `connections` rows but cannot write any. `dev`'s
accept policy only checked the new status, so a recipient could rewrite a
pending request into an accepted connection between themselves and anyone
(verified, then closed). All writes now go through service-only functions:

| Function | Rule |
| --- | --- |
| `connection_request` | Not yourself; requester needs a profile; target must be active and not in a block (same `CON02` either way). If they already asked you, this accepts. A pair lock makes simultaneous requests end as one accepted row. |
| `connection_accept` | Only the recipient of a pending request; only `status` changes. |
| `connection_remove` | Decline, cancel or disconnect. Disconnecting closes the direct chat. |
| `connection_state` / `connection_list` | Per-person state, and incoming/sent/connected lists (blocked pairs and inactive profiles left out). |

The insert trigger now raises `CON02`/`CON04` and counts requests per initiator
in `connection_request_log` (10 per day). The old count used `auth.uid()`, which
is empty for server calls, and counted live rows, so cancelling refunded a slot.

## API (`/api/conversations`, Bearer Supabase access token)

| Endpoint | Contract |
| --- | --- |
| `GET /?page=1` | `{ conversations: [{ id, kind, created_at, participants, latest_message, unread_count }], hasMore }`, 50 per page, latest activity first. |
| `POST /` `{ eventGroupId }` | `{ conversationId }` for a verified event group. |
| `GET /:id/messages` | `{ kind, canSend, messages, participants, nextCursor }`, newest 50 in seq order. `?before=<seq>` pages back; `?after=<seq>` returns up to 50 newer messages (polling). |
| `POST /:id/messages` `{ body, clientRequestId }` | The saved message `{ id, conversation_id, seq, sender_id, body, created_at }`. |
| `POST /:id/read` `{ seq }` | `{ lastReadSeq }`; never moves past the last message. |
| `POST /:id/leave` `{}` | 204; group chats only. |
| `GET /activity` | `{ unreadConversations, incomingRequests }` for the Messages tab dot. |

`/api/connections`, keyed by the other person's user ID:

| Endpoint | Contract |
| --- | --- |
| `GET /` | `{ incoming, sent, connected }`; people are `{ id, display_name, avatar_url }`, connected ones with `conversationId`. |
| `GET /:userId` | `{ status: 'none' \| 'sent' \| 'incoming' \| 'connected', conversationId }` |
| `POST /:userId` `{}` | Request (or accept if they asked); returns the state. |
| `POST /:userId/accept` `{}` | Accept; returns `{ status: 'connected', conversationId }`. |
| `DELETE /:userId` | Decline, cancel or disconnect; returns the state. |

Connection codes: `CON01` 400 yourself, `CON02` 404 unavailable or blocked,
`CON03` 409 nothing to accept, `CON04` 429 daily limit, `CON05` 409 no profile.

Participants are `{ id, display_name, avatar_url, last_read_seq }` for current
members. Status codes: 401 session, 400 input/cursor (`MSG08`, `MSG09`), 403 not
a member/blocked (`MSG03`–`MSG05`), 404 missing (`MSG01`, `MSG02`), 409 state
(`MSG06`, `MSG07`, `MSG10`, `MSG12`), 429 rate limit (`MSG11`), 503 anything else
(logged server-side, generic to the client).

## Adding a new conversation source

Add a `kind`, give it a `source_key`, and keep membership in step from the
source of truth (a trigger or an ensure function that checks it). Do not add an
endpoint or helper that accepts an arbitrary participant list. Matchmaking event
proposals are suggestions, not acceptance, so they should not open chats.

## Verification

| Check | Result |
| --- | --- |
| Migrations on `dev`'s chain (fresh DB, and with seeded draft rows) | Apply; draft rows carried over correctly (accepted pair open, disconnected pair closed, whitespace-only message dropped). |
| `tests/connections.sql` | Passes: request/accept/remove from both sides, connect-back accepts, chat opens and closes, unavailable and blocked people, rate limit not refunded by cancelling, no browser writes or write policies. The rewrite exploit now fails with `permission denied`. |
| `tests/messaging.sql` | Passes: connection accept under RLS, idempotent sends, membership, cursors, unread/read, rate limit, blocks, close/reopen, group join/leave/rejoin, leave-only-the-chat, account deletion, event deletion, inactive profiles, grants. |
| `src/types/database.ts` | Identical to `supabase gen types` output for the migrated DB. |
| `pnpm typecheck`, `pnpm lint`, `pnpm build` | Pass. |
| `pnpm test` | All messaging and connection tests pass. 1 failure in `tests/community-history.test.tsx`, which fails identically on `dev`. |
| `pnpm exec playwright test` | 101 passed, including `e2e/connections.spec.ts`. 2 failures in `e2e/community-refinements.spec.ts`, which fail identically on `dev`. |

UI and API tests mock the transport; only the two SQL tests exercise real
PostgreSQL. To run them: apply migrations to a **test** database, then
`psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/messaging.sql` and the same for
`tests/connections.sql` (both roll back).

## Local demo

1. Apply migrations locally (`pnpm supabase:reset` on a disposable local DB, or
   `pnpm exec supabase migration up --local`), then `pnpm env:local` and `pnpm dev`.
2. Sign in at `/login` as two seeded users in two browser profiles, for
   example `alice@example.com` and `erin@example.com` (password `password123`).
   Seeded users have finished onboarding, and erin's request to alice is pending.
3. For new pairs, have them meet in matchmaking, or call
   `POST /api/connections/<other user id>` from one browser's session. On
   **Connect**, the other sees **Requests** in Messages and a dot on the tab;
   **Accept** opens the chat.
4. Open `/messages` in both browsers. Send from one; the other sees it within
   about 5 seconds, with an unread dot in the inbox until opened. The sender
   sees "Seen" once the other opens it.
5. Insert a `blocks` row for the pair: sending stops for both. Disconnect
   (`DELETE /api/connections/<id>`): the chat disappears for both. Reconnect:
   it returns with its history.

## Limits and follow-ups

- Connect lives only on the matchmaking candidate card. The real other-user
  profile is on `feature/profile-settings`; once merged, put
  `<ConnectButton key={id} userId={id} name={name} />` next to block and report.
- No UI to disconnect yet (`DELETE /api/connections/:userId` exists).
- Group chats need the event group queue to add acceptance first; proposals are
  suggestions, not consent.
- Polling, not realtime. Supabase Realtime would need browser read access, which
  this server-only design avoids; a server-sent broadcast could replace polling.
- Hidden-profile visibility and `user_reports` from `feature/profile-settings`
  are not on `dev` yet. Once merged, apply the hidden rule in
  `messaging_participants_json` and add "Report message".
- No mute, attachments, calls, typing indicators or unread badge in navigation.
- The Plan Card in Messages is still the local prototype plan, labelled
  "Local demo plan" and not linked to saved conversations. The prototype
  planning flow's **Open group chat** now opens real Messages.
