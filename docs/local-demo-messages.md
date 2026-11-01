# Local messaging preview

Run `pnpm demo:messages` after `pnpm demo:seed --count 20` and development-account
sign-in. `pnpm demo:messages --dry-run` previews without database or Docker access.

The guarded script targets only the running local `meet-people` Docker database.
It verifies the development account's admin-owned marker and all four reserved
demo identities before writing. No hosted URL or arbitrary account ID is accepted.

It establishes three Friends connections through real request/accept RPCs, and
seeds nine fictional messages through the normal message RPC with stable request
IDs. Reruns do not duplicate those messages or replace user-written history. It
also creates one incoming request if that demo relationship has not already been
resolved. All writes are transactional; blocked or ineligible pairs are not bypassed.

The local development inbox can send and persist messages in these conversations.
These are fictional accounts, not live people or automatic reply bots. The seeded
intro messages say so. Another browser session signed into a demo account can
reply through the same live API. The existing shared demo password for this local
preview is stored privately at `/tmp/opencode/pebble-demo-password`.

The inbox uses live unread/request counts, timestamps, search over loaded
conversations, and direct/group history. Group controls retain the real active
Friends lifecycle. Direct conversations show **Friends** or **Dating** from the
stored relationship origin. Older unrecorded origins have no guessed badge.
The known local seed/request pairs were explicitly annotated as Friends.

Requests opens `/messages/requests`, a standalone white view matching the demo.
Accept opens a conversation only after confirmed acceptance; Decline updates the
request list. Uncertain writes require a read-only reconciliation before another
attempt. Private routes and safety checks remain in effect. Request subtitles
do not invent interests or a relationship mode absent from the current API.
Friends and Dating sections collapse independently; Dating uses reciprocal
**Like back**, not a Friends acceptance operation. Unrecorded older requests
remain in an Earlier requests section.

Chat options include refresh, safety and confirmed connection removal. Read labels
use participant read positions; Sent means server-confirmed storage, not a push
notification or proof of delivery to a device. Mobile Back returns to the inbox.
Unsent text is retained separately per conversation while the Messages screen
remains mounted; it is not persisted to browser storage or the database.

For cleanup, the existing guarded `demo:remove` tool can remove selected marked
demo accounts and their cascading local data. It is destructive and must be run
explicitly; starting/stopping the app does not remove conversations or reset data.
