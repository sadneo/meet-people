# M3 messaging handoff — YZ

## Status and scope

Implemented on `feature/messaging-backend`, starting at `23afb0d`. No commits,
pushes, merges, deployments, or migration applications were performed.

The routed Messages feature now calls Express/Supabase for conversations,
history, and sends. It has no sample-message or local-storage fallback. The
new migration still needs explicit application. YZ chose **“Implement and
document; I’ll run the database demo later.”** Therefore real database
persistence and the complete M3 acceptance flow remain unverified, and the
community/Ruby phases have not started.

## Audit of the current team implementation

| Area | Findings before implementation |
| --- | --- |
| Routing | React Router in `src/App.tsx`, `PebbleApp` context, current prototype `AppShell`; five navigation destinations. Messages routes are `/messages` and `/messages/chat`. |
| Messages UI | Recent team commit `30c7cbf`; three desktop panes, compact inbox/chat routes, composer, sample people and messages in `Social.tsx` and `messaging.ts`. |
| API | Express 5, routes registered in `api/index.ts`, existing router factory `createEventsRouter(client)`, Zod shared contracts, Supabase queries/RPCs directly from the router. No separate repository/service framework. |
| Auth | Real Supabase client + persisted session in `src/supabase.ts`, shared `useSession`, bearer token from `getSession`; Events verifies it server-side with `auth.getUser(token)`. `/login`, `/register`, Profile and Settings remain prototype UI. |
| Environment | Browser: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. Server only: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. `.env.example`, `pnpm env:local`; no `.env.local` present during work. |
| Existing schema | Checked-in migrations contain listings/ingestion, `event_profiles`, event interests/groups/members. No general `profiles`, `conversations`, `messages`, conversation membership, `connections`, `matches`, or plan/meetup tables. Deployed schema could not be inspected without configuration. |
| Profile fields | Real available fields: `event_profiles.user_id` (FK to `auth.users.id`) and `display_name`. No persisted username/avatar/birthdate there. Prototype Profile has name/bio/photo/interests; its photos and person IDs are fictional. |
| Matching | Active/downtime/free-time screens use local prototype state. Real event company exposes `{ group: { id, members: [{ id, name }] } }`; member IDs are Auth UUIDs. No general mutual-match backend interface is present in this checkout. |
| Plans | Prototype reducer only, lost on refresh. No persisted shared Plan Card object. |
| Realtime | No existing Supabase Realtime subscriptions/configuration found. Event company polls every 15 seconds. |
| Testing | Vitest, Testing Library, Express HTTP tests with mocked Supabase fetch transport, standalone rollback SQL tests, Playwright browser tests. |

The current team checkout was used. The old UI branch was neither merged nor
cherry-picked. Design authority remains `docs/DESIGN.md` and `docs/UI-PLAN.md`.

## Files

| File | Change |
| --- | --- |
| `api/messaging.ts` | Authenticated router and trusted matching integration helper. |
| `api/index.ts` | Registers `/api/conversations` with the existing server-only Supabase client. |
| `shared/messaging.ts` | Zod contracts, message validation, shared TypeScript models. |
| `supabase/migrations/20261008120000_messaging.sql` | Additive tables, indexes, grants and service-only functions; not applied. |
| `src/types/database.ts` | Messaging table/function declarations aligned by hand to the proposed migration. Regenerate against the applied database before committing. |
| `src/features/messaging/client.ts` | Uses the current Supabase session, API validation, event-group helper, canonical chat URL. |
| `src/features/messaging/Feature.tsx` | Real inbox, history, send, error/loading/empty states; separate local demo Plan Card. |
| `src/features/messaging/messaging.css` | Small additions to existing three-pane styles: initials, wrapping, preview spacing, compact demo card. |
| `src/App.tsx` | Routes Messages to the persistent feature; retains current URLs and shell. |
| `src/features/events/Auth.tsx` | Reuses the existing email sign-in form with optional Messages wording; default event behavior unchanged. |
| `src/features/events/Company.tsx` | Adds “Message group” to existing formed groups; no matching logic changes. |
| `src/features/prototype/ui.tsx` | **PRE-EXISTING baseline build fix:** removed the earlier duplicate `bell` property; kept the later icon that previously won at runtime. |
| `tests/messaging-api.test.ts` | API identity, validation, authorization response and contract tests. |
| `tests/messaging.test.tsx` | Inbox, history, send, duplicate-submit, retry, remount, isolation and signed-out tests. |
| `tests/events-company.test.tsx` | Existing assertions retained; router wrapper plus Message-group integration assertion. |
| `tests/messaging.sql` | Actual PostgreSQL constraints, grants, membership, idempotency and pagination tests; not executed. |
| `e2e/messaging-persistence.spec.ts` | Browser/API-fixture integration at seven widths and short heights; explicitly not database verification. |
| `docs/MESSAGING-M3.md` | This audit, contracts, verification record and manual demo. |

The old exported prototype chat components/sample arrays remain in
`Social.tsx`/`messaging.ts` for reference, but the product router no longer
uses them. Profile/Settings, algorithms, ingestion and deployment code were
not rewritten. Package manifests/lockfiles were not changed.

## Proposed database schema

There was no equivalent checked-in messaging schema to reuse. The single
additive migration creates:

| Table | Columns and constraints |
| --- | --- |
| `conversations` | `id uuid` PK/database default, `participant_key text` unique canonical sorted UUID set, `created_at timestamptz` database default. |
| `conversation_participants` | `(conversation_id, user_id)` composite PK; FK to conversation and `auth.users`. Indexed by user/conversation for inbox reads. |
| `messages` | `id uuid` PK/database default, `conversation_id uuid`, `sender_id uuid`, `body text`, `created_at timestamptz` database default, `client_request_id uuid`. Sender/conversation composite FK ensures sender membership; text length/non-whitespace constraint; unique `(conversation_id, sender_id, client_request_id)`; conversation/time/id history index. |

No profile or matchmaking tables are changed. RLS is enabled with browser
roles denied table/function access, matching the existing event-company
server-only convention. Express uses its service-role client after verifying
the caller's token. The service key is never imported into browser code.

All functions use an empty search path and explicit schema names. The
creation helper atomically creates/finds a conversation and inserts members.
A unique canonical participant key makes concurrent/reordered requests reuse
one conversation. Event-group creation uses the same listing-row lock as
`event_company_action`, then resolves group members inside that transaction.

Membership is a **snapshot of the exact participant set**. A changed event
group yields a different chat; newcomers never inherit the previous group's
history. Leaving an event does not revoke access to a previously shared chat.
Chats with the same participant set are reused across events. Confirm these
product choices with Daniel before adding general matching sources.

## API, authorization and frontend behavior

Every endpoint requires `Authorization: Bearer <Supabase access token>`.
The sender/current user is always derived from `auth.getUser(token)`.

| Endpoint | Contract |
| --- | --- |
| `GET /api/conversations?page=1` | `{ conversations, hasMore }`, 50 per page, current user's memberships only, sorted by latest activity. Participants include `id`, `display_name`, `avatar_url: null`; latest message and its database timestamp are included. |
| `POST /api/conversations` | `{ eventGroupId: UUID }` → `{ conversationId: UUID }`. Server resolves the actual event group; caller must be a member; group needs 2–5 unique users (current events cap at 4). Arbitrary participant/sender claims are rejected. |
| `GET /api/conversations/:id/messages?before=<message UUID>` | `{ messages, participants, nextCursor }`. Latest 50 rows returned in chronological `(created_at, id)` order; cursor fetches older rows. Cursor must belong to this conversation. |
| `POST /api/conversations/:id/messages` | `{ body: string, clientRequestId: UUID }` → inserted message `{ id, conversation_id, sender_id, body, created_at, client_request_id }`. |

History/send functions check that the conversation exists and that the
verified user belongs to it before accessing messages. Missing conversation:
404; nonmember: 403; missing/invalid session: 401; invalid IDs/text/body: 400;
unconfigured/unavailable backend: 503. Internal database details are never
returned. A 403 versus 404 distinguishes existence but discloses no contents
or participant identities.

Text is trimmed, empty/whitespace-only text is rejected, and the API caps text
at 2,000 JavaScript string units (PostgreSQL also caps at 2,000 characters).
The UI disables Send while in progress and uses a synchronous guard against
multiple form submissions. A retained draft's retry reuses its request UUID;
the database returns the original message if the write already succeeded.
Reusing the same UUID with different text is rejected.

The inbox supports name/preview search over loaded pages, refresh, and loading
more conversations. It uses initials because no persisted avatar field exists.
There are no invented photos, presence, unread counts or meeting claims.
Selecting a row navigates to `/messages/chat?conversation=<UUID>`, which
survives refresh and direct linking. Conversation components are keyed by ID;
requests are aborted/ignored after navigation. User identity changes discard
the previous user's chat state. A saved send renders the database response
and refreshes inbox activity. Failed sends retain drafts and show an error.
Initial history failure disables sends and offers retry. Earlier-message
pagination and manual refresh are supported.

**Realtime/read receipts:** not implemented. Incoming messages appear on
Refresh messages or reopen. There was no persisted unread tracking to reuse.

**Plan Card:** current visual concept remains as a clearly labelled “Local
demo plan,” separate from saved conversations, in the desktop context pane
and compact history pane when a prototype plan exists. It is not persisted,
not attached to chat members, and does not send fictional participant IDs to
the API. Attachments, calls and fictional profile actions are not exposed as
working features in persistent chat.

## Daniel's exact integration contract

Already connected: Event Detail → existing group with at least two members →
**Message group** → `ensureEventConversation(group.id)` → server verifies
membership → `{ conversationId }` → `conversationPath(conversationId)`.
This does not replace or change event matching.

For a future mutually accepted free-time/match/Ruby result, call on the
**trusted server**, after Daniel's acceptance/eligibility checks:

```ts
import { ensureConversationForParticipants } from './messaging.js'

const { conversationId } = await ensureConversationForParticipants(
  serverSupabaseClient,
  [acceptedUserAuthIdA, acceptedUserAuthIdB], // 2–5 existing auth.users UUIDs
)
// Return conversationId to an authorized participant.
```

The helper sorts/deduplicates in PostgreSQL and reuses the exact member set.
It is intentionally not a public browser “choose arbitrary people” endpoint.
Daniel's future route must authenticate its caller and verify the persisted
match before invoking it. On the frontend use
`conversationPath(conversationId)` from `src/features/messaging/client.ts`.
Winson's algorithms need no modifications. Sample IDs like `jamie` are not
accepted and are never translated into real users.

## Xuhan's exact profile dependency

Today messaging reads only `event_profiles.user_id` and
`event_profiles.display_name`, and references `auth.users.id` for identity.
Missing names display “Student.” It does not create or update profiles.
`avatar_url` is explicitly null and username is not required. Xuhan should
confirm how his future profile primary key maps to Auth UUIDs and supply a
public display-name/avatar contract. Replace the name/avatar read projection
when that model lands; do not fork the profile schema. The generated database
types were aligned manually because migration execution was deferred; run
`pnpm supabase:types` after application and review any generated differences.

## Verification record

| Check | Result |
| --- | --- |
| `pnpm typecheck` | Passed after the one-line baseline icon fix. First sandboxed invocation could not canonicalize the workspace path; rerun outside sandbox passed. |
| `pnpm test -- tests/messaging-api.test.ts tests/messaging.test.tsx` | 2 files, 20 tests passed (14 API, 6 frontend). API/database transport is mocked. |
| `pnpm test -- tests/messaging-api.test.ts tests/messaging.test.tsx tests/events-company.test.tsx` | Final targeted run: 3 files, 24 tests passed. |
| `pnpm lint` | Passed, no reported lint errors. |
| `pnpm test` | **18 files passed, 1 failed; 86 tests passed, 2 failed.** Includes one new event-group → chat test in addition to 20 messaging tests. |
| `pnpm build` | Passed TypeScript, Vite web build, API TypeScript build. Vite emitted a nonfatal chunk-size warning (>500 kB). |
| `pnpm exec playwright test e2e/messaging-persistence.spec.ts --workers=1` | 7 passed using installed Chrome and a local server with test-only public configuration. Widths 320/390/799/800/801/1280/1800; also checks short 560px height, composer clearance, no horizontal overflow, reload and A/B isolation. All API data is fixture-backed. |
| `git diff --check` | Passed (Git emits line-ending normalization warnings). |
| `tests/messaging.sql` / real database / manual M3 flow | **Not run.** No configured Supabase, Docker or psql available in this session; YZ will apply the migration and run the demo later. |

The two full-suite failures are exactly the reported **pre-existing baseline**
tests in `tests/event-matchmaking.test.tsx`, both expecting “Find someone to
go with” in the old Event Detail test setup. That file and matching behavior
were not changed. No new failing Vitest tests remain. Browser testing was
targeted: the entire historical Playwright suite was not run. Several old
specs, including `e2e/messages.spec.ts`, assume anonymous sample chats,
fictional unread counts/calls or session-only sends; they are preserved and
will need deliberate migration to the authenticated behavior. Do not claim
the full browser suite passes.

The final lint/build/targeted-browser reruns passed after the type/style
updates. Desktop (1280px) and compact (390px) screenshots in ignored
`test-results/` were visually inspected; no overlap or inaccessible composer
was observed. The test Vite server was stopped after verification.

The standalone SQL test exercises real inserts/re-reads, deduplicated sends,
forbidden reads/writes, missing conversations, whitespace/length validation,
wrong-conversation cursors, tied timestamps and pagination, grants, event
creation/membership changes, and exact participant-set reuse. It runs in a
transaction and rolls back its fixtures. It is not evidence until executed.

## Exact local M3 acceptance steps

1. Review the migration and compare with the team's actual database first.
   Apply `supabase/migrations/20261008120000_messaging.sql` explicitly using
   the team's migration workflow. No existing migrations need edits.
   For an already-running **local** Supabase instance, the CLI command is
   `pnpm exec supabase migration up --local`; it applies pending migrations,
   so review the pending list first. Do not use a reset on a database with
   work you want to preserve.
2. Populate `.env.local` using the four existing names in `.env.example`.
   Browser and server must point to the same project. Use only the public
   key in the Vite variable. With the repo's shell/Docker setup available,
   `pnpm env:local` obtains the existing local instance's configuration.
   Auth redirect URLs must allow `http://127.0.0.1:3000`.
3. Run `pnpm dev`, then open `http://127.0.0.1:3000/messages`. Use the actual
   email-link sign-in shown there (or on Event Detail), **not** the prototype
   `/login` form. Local Supabase captures emails in its local mail viewer;
   use the URL shown by `pnpm exec supabase status`.
4. Use two separate browser profiles, signed in as different real test users.
   Have both open the same future Event Detail, enter display names and click
   **Find someone to go with**. On one browser, click **Retry/refresh** or wait
   for event company's existing 15-second poll until the group has two people.
   Click **Message group**. Both users must get the same conversation URL.
5. If the local DB has no events, add this explicit test fixture via its SQL
   editor, then open Events. This does not involve the ingestion system:

   ```sql
   insert into public.listings(title, source, external_id, starts_at, category)
   values ('M3 messaging demo', 'test', 'yz-m3-messaging-demo', now() + interval '1 day', 'Social')
   on conflict (source, external_id) do update set starts_at = excluded.starts_at, status = 'active';
   ```

6. Send a preliminary message, return to **Messages**, and open that saved
   conversation. Confirm the preliminary history is there.
7. Send exactly **M3 messaging persistence test**. It should appear once,
   immediately after the server returns; the input clears and preview updates.
8. Refresh the browser, reopen the conversation if needed, and confirm the
   **same** message remains. Inspect the message ID/time in the API response
   or database to distinguish a persisted row from a second insertion.
9. With a third account, form another group with a different participant set
   (for example using a second demo event), and create Conversation B. A
   second event with the identical participant set intentionally reuses A.
   Verify A's messages never appear in B. Sign in as a nonmember and open
   A's copied URL: its history must return 403 and sending must stay disabled.
10. Test failed sends by taking the API offline after opening a conversation.
    The draft stays visible; restart API and retry. Click Send twice quickly:
    there must be only one database row for that request UUID.
11. After migration application, run `pnpm supabase:types`, review type output,
    and execute `tests/messaging.sql` against a **test** database as a role able
    to create its rollback fixtures. Example with psql in PowerShell:
    `psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f tests/messaging.sql`.

For browser-only verification, serve a separate Vite process with
`VITE_SUPABASE_URL=http://127.0.0.1:54321`, a nonempty test public key, and
`VITE_PORT=3100`. Set `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100` and, if needed,
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to installed Chrome. Run the targeted
Playwright command above. These test settings do not validate Supabase.

## Secondary phases and team questions

Community assets added: **none**. New costs: **none**. The existing catalog
already uses 10–120 Pebbles and persists purchases in localStorage; it was
audited but not changed because the real messaging acceptance gate is pending.

Ruby components/routes/mock candidates: **none**. Ruby exploration and
`docs/RUBY-MODE.md` are deferred until messaging is accepted. It must later be
opt-in, mutual-interest based, use the same conversation helper, and depend
on real eligibility/block/report/privacy controls. No reliable persisted
adult eligibility field is present; the prototype matching age is not proof.

Ask teammates tomorrow:

- **Daniel:** Auth UUID mapping; mutual acceptance authority; exact-set chat
  reuse across sources; event-leave/history behavior; eventual chat removal.
- **Xuhan:** canonical profile ID/name/avatar fields; real block/report and
  privacy interfaces; adult eligibility if Ruby is later pursued. Existing
  prototype blocking/reporting does not enforce restrictions in live chat.
- **Aidan:** review/apply the additive migration and ensure existing API/public
  environment values point to the same project. No CI/CD changes are included.
- **Winson:** return accepted participant identities through Daniel's service;
  no new messaging-specific algorithm is needed.

Other limits: no realtime, unread receipts, attachments/calls, persisted plans,
new matching algorithms, live safety backend, or Ruby eligibility rules. The
general shell's existing “Log out” link still navigates to the demo login and
does not call Supabase sign-out; Profile/Settings ownership was left intact.
Do not mistake that link for ending an authenticated session during demos.
General free-time prototype “Message” actions contain fictional people and
do not create real conversations. They lead to the inbox/choose-chat state.
These boundaries must be resolved with the owners before broader release.
