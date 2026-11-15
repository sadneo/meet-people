# Messaging Realtime

Apply `supabase/migrations/20261113000000_messaging_realtime.sql` to the target
Supabase database before rolling out this client. Realtime must be enabled.
The migration supports both native UUID conversations and activated legacy
bigint direct chats, plus active Friends groups. It preserves existing content,
memberships, API contracts and table privileges. No publication/table toggles,
new client keys or additional environment variables are needed.

While Messages is mounted, the client joins private topic `messaging:<auth user
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
Hidden tabs defer notification reads; visibility, focus, online and successful
subscription/reconnection trigger catch-up. SDK transport reconnects use its
normal retry behavior. An unavailable subscription shows a reconnect action;
manual history refresh remains available. No periodic HTTP fallback is installed.
Subscription cleanup ignores late callbacks and removes its listeners/channel.
Supabase's shared client manages JWT refresh. Reads never resend a message;
explicit retries retain the original client request ID.

Verification:

- `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`.
- `pnpm test:browser tests/browser/messages-realtime.spec.ts tests/browser/messages-retry-navigation.spec.ts`.
- `pnpm test:integration:schema` replays both database tracks in disposable
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
