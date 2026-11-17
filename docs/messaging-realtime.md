# Messaging Realtime

Apply `supabase/migrations/20261115030000_messaging_realtime.sql` to the target
Supabase database before rolling out this client. Realtime must be enabled.
Typing indicators also require `20261115040000_messaging_typing.sql`.
The migration supports both native UUID conversations and activated legacy
bigint direct chats, plus active Friends groups. It preserves existing content,
memberships, API contracts and table privileges. No publication/table toggles,
new client keys or additional environment variables are needed.

While Messages or the standalone Requests page is mounted, the client joins private topic `messaging:<auth user
id>` using the existing Supabase session. Its SELECT policy allows only that
account to receive broadcasts; no client INSERT policy is added. Database
triggers emit `changed` with an empty application payload (Realtime may append a
generated broadcast ID) for messages, advancing read
positions, membership changes, group renames, connections and blocks. Departing
members receive a final invalidation; subsequent messages notify active members
only, with bilateral block filtering. The API remains responsible for filtering
content and checking current send/read permissions. No message content is
delivered over Broadcast and no application table becomes browser-readable.

Notifications are combined into short bursts and refresh active cached display
reads. An event during an existing read schedules a fresh read after it completes.
Connection changes also refresh the standalone Requests list. New requests appear
and withdrawn/otherwise resolved requests disappear without reloading. These
notifications never accept/decline a request or clear an uncertain response;
explicit read-only reconciliation is still required after an unconfirmed write.
Hidden tabs defer notification reads; visibility, focus, online and successful
subscription/reconnection trigger catch-up. SDK transport reconnects use its
normal retry behavior. An unavailable subscription shows a reconnect action;
manual history refresh remains available. No periodic HTTP fallback is installed.
Subscription cleanup ignores late callbacks and removes its listeners/channel.
Supabase's shared client manages JWT refresh. Reads never resend a message;
explicit retries retain the original client request ID.

The composer sends throttled typing flags through authenticated
`POST /api/conversations/:id/typing` requests. The server derives the sender and
checks current direct/group membership, contact permissions and bilateral blocks
before emitting `typing` on each other member's existing private channel. Only
conversation ID, sender ID, group kind and a boolean are transmitted; no draft
text is sent or stored. The three-dot indicator names current participants only.
Typing stops on send, empty input, blur, hiding, navigation or permission loss;
inactivity sends a stop after 2.5 seconds, with a five-second receiver expiry if a
stop is lost. Typing failures never block a message send. Sent labels mean a
server-confirmed message; Read appears after other participants' saved read
positions advance and their change notifications refresh history.

Verification:

- `pnpm typecheck`, `pnpm lint`, `pnpm test`.
- `pnpm test:browser tests/browser/messages-realtime.spec.ts tests/browser/messages-retry-navigation.spec.ts`.
- `pnpm test:integration` replays both database tracks in disposable
  containers and checks notification recipients, read no-ops, departures and
  owner-only receive/no client publish permissions. Those containers use a
  test stand-in for the platform-owned Realtime schema; they do not prove
  WebSocket transport or hosted configuration.
- After migrating the local stack, `pnpm exec node tests/integration/local/test-messaging-realtime.mjs`
  checks actual Auth/private WebSocket delivery, owner/anonymous isolation,
  denied client publishing, direct/group changes, read receipts and departures.
  It creates and removes synthetic users/chats/groups; it never resets the database.

Hosted activation must include the migration and enabled Realtime. A client
subscription failure stays visible until a successful reconnect; it does not
silently resume polling. Notification insert failures do not roll back the
message write and issue a database warning. Catch-up reads reconcile later.

## Test against remote Supabase

Put the remote `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` in the ignored root `.env`. Matching `VITE_SUPABASE_*`
values may also be supplied. After the two migrations above are installed on
that project, run:

```sh
pnpm dev --remote
```

Open `http://127.0.0.1:3302/messages` in separate normal/private windows and sign
in with two connected remote accounts. This launcher uses the branch's frontend
and API with that remote database, ignoring `.env.local` and the hosted
`VITE_API_BASE_URL`. It leaves the ordinary local servers and configuration intact.
Local-only development accounts do not exist on the remote project.

With that app running, the Supabase CLI logged in, and the root `.env` targeting
the production project, run the complete acceptance check in another terminal:

```sh
pnpm test:hosted <url> --messaging
```

This opt-in check creates three marked, temporary remote accounts. It checks
hosted API sends/history/deduplication, unread/read state, private notifications,
typing, outsider denial and the branch's real two-browser experience. It removes
the test pair's conversation/connection through scoped SQL, deletes the accounts,
and writes `test-results/remote-messaging-report.json`. It verifies CLI cleanup
access before creating fixtures and never queues tests to match with other users.

Leave account B at its inbox and send from A: A should show Sent. Open B's chat:
A should change to Read without refreshing. Type in B without sending: A should
show B's typing dots, which disappear on pause, clearing, blur or send. Repeat in
the opposite direction. A reconnect error or missing typing RPC is a failed
activation check, even when send/history endpoints work.

The realtime migration was moved from `20261113000000` because that version is
already used by the adult-only release on dev/production. Existing databases
where the earlier messaging migration was manually installed need their migration
ledger reconciled; do not run the renamed SQL over an existing realtime schema.

## Try a local conversation

With local Supabase running, the migration applied, and `.env.local` configured
for that local stack, start the API/web server and mobile app in separate terminals:

```sh
pnpm run dev
```

```sh
pnpm dev
```

Then run the real API acceptance check:

```sh
PEBBLE_API_URL=http://127.0.0.1:<api port printed by pnpm dev> pnpm exec node --env-file-if-exists=.env.local tests/integration/local/test-local-messaging.mjs
```

It prepares the local test accounts `a@example.com` and `b@example.com` (password
`password`), checks two-way sends, history, retry deduplication, unread/read state,
and outsider denial, then prints their conversation URL. Reruns preserve their
history and reuse the accounts.

Open the printed URL on `http://127.0.0.1:3002` in a normal browser window and a
private window. Sign in as a different test account in each window. Send a message
in both directions without refreshing, leave an unsent draft while receiving a
reply, and reload to confirm saved history. The draft should remain while live
messages arrive; unsent drafts are not persisted across reloads.
