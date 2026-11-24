# Pebble UI integration

The `yz/prototype-integration` working tree brings the service-connected alternate
frontend into parity with the finalized, read-only `Pebble-Garden-Asset-Work`.
`docs/DESIGN.md` is the product-design authority. `src/main.tsx` now loads the
shared React screens in `src/ui/`. Web routes live in `src/web/App.tsx`; mobile
routes live in `src/mobile/App.tsx`. The `dev` branch publishes separate sandbox-backed
web/mobile builds; `main` publishes production web. See `docs/deployment.md`.
The standalone reference is not the application entry.

## Task-flow review (November 18, 2026)

Review covers the implemented destinations, their dialogs and their recovery
states. Counts below describe action taps, excluding typing and OS pickers.
Existing colors, icons, navigation and mobile layout remain the visual reference.

| Feature | Result |
| --- | --- |
| Sign-in | Email and password are visible together: one submission instead of an email lookup followed by sign-in. Google and sign-in links remain direct actions. |
| Registration and recovery | Email and the requested destination carry between forms. Editing the registration email stays in registration. Verification and password confirmation remain. |
| Basic onboarding | One form and one Enter Pebble action; no matching-profile fields are added. |
| Friends setup | Photo selection and interests save together. The final action explicitly starts Friends; optional filters remain collapsed. |
| Dating setup | Save and start Dating combines preference save and opt-in, removing the separate ready screen and its extra tap. |
| Discover search area | Header opens the map in one tap instead of opening preferences and then the map. Set search area saves and returns directly to Discover. |
| Friends preferences | Interests and weekly availability open in-place editors. Save/Cancel returns to the same preferences, with no Profile round trip. Sliders and goals retain immediate saves. |
| Dating preferences | Dating details open in place. A labeled pause action is available in preferences instead of requiring a trip to Discover before editing. Privacy changes retain revision checks and readback recovery. |
| Profile photos | File selection adds a gallery photo immediately. Profile draft and setup photos save with their form. The completion-card photo action opens the chooser. Preview, captions, hold-to-reorder and removal confirmation remain. |
| Profile prompts and details | Choosing a prompt opens/focuses its answer immediately; there is no Add prompt button. Multi-field drafts keep Save/Cancel. Language selection already adds immediately. |
| Event filters | Category selection and Reset apply and close the sheet; no Done action. Directory pagination and Back preserve the URL search. |
| Event matching | Setup remains within the event. Shared saved prerequisites are reused. Explicit queue join/leave and automatic waiting-state updates remain. |
| Find a group | Missing setup opens directly after Find a group, avoiding another setup-entry tap. A completed area is rechecked without Finish setup. Availability and timezone edit together in place. Queue enrollment and roster acceptance stay explicit. |
| Inbox and chat | Conversation rows already open chat directly; sending and explicit retries stay in chat. Header opens members directly. Connection removal and group leave retain confirmations. |
| Requests and Activity | Acceptance opens the confirmed conversation on both surfaces. Opening an event-group notification also marks it read; manual marking remains available. Decline already takes one action. |
| Food | Dates, locations, meals and search already apply immediately. Dish details open a sheet and return to the same menu. No extra save or navigation is added. |
| Garden | Friend islands open Friends discovery directly, removing their introduction sheet. Build already purchases/places directly; dragging, undo, reward claims and history stay in place. Reset retains confirmation. |
| Settings, permissions and safety | Settings switches already save immediately. Current location requests OS permission and enables the account setting from that action. Reports retain one explicit submission; blocking, account deletion and other destructive actions retain deliberate confirmation. |
| Public website and policies | Event cards and installation links are already direct. Policy views retain working return navigation; no account actions or sample success states are introduced. |

Validation uses deterministic browser fixtures for API/session responses and
mobile layout at 320px and wider, plus the unit suite and product builds. It does
not establish live email/OAuth delivery, actual Android/iOS permission behavior,
or acceptance on a physical device.

The local development navigator sits in its own normal-flow strip above the app,
not over mobile actions or message composers. It remains absent from normal
production builds. Discover shows a saved search-area label only after a location
reference exists; Profile home does not stand in for an unconfirmed search area.

| Route | Current behavior |
| --- | --- |
| Web `/`, `/welcome` | Desktop-first landing matching the supplied HTML; `/welcome` redirects to `/`. No Sign in link; Android badge opens `https://play.google.com/store/apps`; iOS is coming soon. The existing `/#install` anchor targets store badges. Profile and Garden previews are local examples with no account writes. |
| Mobile `/`, `/welcome` | Signed-out entry opens login; signed-in entry opens Garden after account readiness |
| `/login`, `/register` | Supabase email/password, email link and Google sign-in |
| `/auth/callback`, `/reset-password` | Explicit grant verification and URL scrubbing |
| `/auth/forgot-password`, `/forgot-password` | Real recovery email request |
| `/onboarding` | One mobile form for display name, chosen username and private birthday. A confirmed adult profile can enter Pebble. |
| `/home`, `/community` | Integrated pixel-art Garden; account-backed inventory, placement, Random Pebble unlocks and capped earning rewards; weekly scene history stays device-local |
| `/matchmaking` | Passive Friends/Dating recommendations, consent and search preferences |
| `/matchmaking/food` | Food menus reached from Discover; campus-date picker, dining location and meal choices, dish search and published ingredient/nutrition details. Authenticated reads of imported campus and hospital snapshots; no sample dishes or inferred opening hours. |
| `/events`, `/events/:id` | API listings and event group queue/proposals |
| Web `/explore`, `/explore/:id` | Public event reads; installation link for group participation |
| `/messages`, `/messages/chat?conversation=…` | Saved inbox, history, read state and idempotent sends |
| `/messages/requests` | Standalone private requests view; live acceptance, decline and safety; Close returns to Messages |
| `/profile` | Prototype overview, saved-profile Preview, Settings gear, identity/interests/adult Dating editors and search-preference links. URL-selected editor tabs support Back/Forward. `?section=settings` contains the five existing settings categories and sign-out; category Back returns there. |
| `/settings` | Legacy redirect to the Profile Settings hub; existing `?section=…` links still open the corresponding section. Active group matching remains in Messages. |
| `/activity`, `/matches` | Activity retains real updates. Matches & Plans presents Upcoming event proposals and Connections in prototype tabs; Past explicitly says history is not available. |
| `/terms`, `/privacy`, `/cookies` | Existing policy content in the new visual layout |
| `/logout` | Confirmed local session sign-out |

Garden balances and ownership use the authenticated account service described in
`docs/PEBBLE-ECONOMY.md`. Server revisions and transactions are authoritative;
browser caches cannot credit a wallet or restore over a newer account change.
Edits wait for confirmed account state and fail closed when the service is
unavailable. The legacy IndexedDB transaction helper and its regression tests are
retained for device-local data, but it is not the account wallet's write path.
Previous device saves remain untouched and are not imported as trusted currency
or ownership. Development funds remain explicitly temporary previews.
Garden re-entry reuses a confirmed in-memory account snapshot for up to 30 seconds.
Concurrent refresh requests share one read, but a queued mutation fences off any
earlier shared refresh. Explicit refresh, focus/storage notifications and expired
snapshots still fetch the account service. A cached display never skips the fresh
pre-mutation read, revision checks or confirmed write response, and errors cannot
grant cached write permission. Switching accounts clears snapshots and read state.

Events keeps category selection inside the Filters dialog instead of wrapping
category chips above the listings. A compact summary appears only when a category
is selected. Category changes and Reset filters retain the page-one reset;
Selecting a category or Reset filters closes the sheet immediately; Escape and
Close dismiss it without further changes.
Category and page are URL-backed so detail/Close and Back/Forward preserve the
directory search. The last successful category catalog remains in the session
cache when a category's list request fails; the list still shows its real error.

Android Back dismisses a modal's current layer first, then transient chat options,
before navigating route history. Direct-link chats fall back to Messages; Garden
and signed-out login roots minimize the app instead of revisiting auth history.
The OS keyboard consumes its own first Back. System navigation is not hidden.
Push opt-in updates tap handling within the session; registration has a bounded,
cancelable lifecycle. Explicit local logout attempts server/native token cleanup
before sign-out, with a three-second best-effort limit, without changing opt-in.

Private routes wait for session hydration and persisted account readiness. A
signed-in account missing basic identity or birthday opens onboarding. Account read failures
block entry with retry and sign-out. Unknown routes pass through the same gate.
Mobile's unresolved initial session/account uses the shared branded startup
screen, also supplied as a mobile-only pre-JavaScript HTML fallback. Navigation
inside the shell uses region-specific skeletons only when data is unavailable;
background reads retain cached content and existing write-permission gates. Media
placeholders resolve per image, not per page. Garden waits for its first drawn
frame. Failures surface recovery rather than an indefinite skeleton; no minimum
splash duration or automatic write/authentication retries are introduced.
Profile photo selection/removal is staged with the profile draft: Cancel discards
it and Save changes performs the revisioned photo write after profile/detail
saves. These resources are not an atomic transaction; partial or uncertain saves
stay explicit and require read-only reconciliation before another photo write.
Manage photos saves individual adds, removals and moves as they happen. Its
four-photo limit and revision checks are enforced by the database. The first
photo supplies existing avatars and matching readiness. Gallery metadata and
individual photo reads use the existing private photo audience rules.
Timezone/sharing controls retain their separately labeled immediate-save behavior
in the editor. Privacy and the editor expose the same canonical schedule-sharing
opt-in; the legacy account availability flag is preserved but not presented as a
second consent gate. Device-location permission is separate from profile home
and each discovery mode's confirmed search area, and is requested only by the
explicit location action.
Garden and the other signed-in destinations share one account loader and shell.
An account-scoped TanStack Query cache retains display reads and decoded private
photos across navigation, with background refresh and short freshness windows.
Disposable inactive reads are limited to 24 entries, including at most eight
private-photo entries, with a two-minute unused-entry lifetime. Recently observed
data wins eviction; removed/replaced private photo URLs are revoked. Observed
views, in-flight requests, the category catalog and unresolved discovery delivery
state are not evicted just to meet that display budget. This is an entry budget,
not a guarantee about total Android process/decoded-image memory. No disk cache,
background polling loop or dependency is added. Sign-out/account changes still
clear the entire private cache.
Events and inbox data warm after the shell becomes idle and on navigation intent.
Changing accounts or signing out clears the cache and revokes private image URLs.
Cached request lists and chat histories remain visible during refresh, while their
write controls wait for fresh permissions. Editable settings, queue/consent actions,
request allowances and mutation readbacks retain their canonical server checks.

Keep the existing browser clients and shared schema validation. Use bearer tokens
for private API calls; use no database tables or privileged keys in the browser.
Versioned preference writes keep their compare-and-swap/readback behavior. Failed
or uncertain mutations require read-only reconciliation before another write.
Message retries reuse the same client request ID. Passive recommendations never
enroll someone in the separate Messages group queue.
Drafts and pending/unconfirmed send identities live in session-scoped memory,
separately for direct and group conversations, across app-route navigation. A late
confirmed response clears its draft even after leaving chat. Navigating or reading
history never replays a send; an explicit retry retains the original request ID.
Changing accounts or signing out clears this state. No message drafts or send IDs
are added to persistent browser storage, and process restarts do not restore them.
Messages and the standalone Requests page subscribe to a private Supabase Realtime
channel for the signed-in account. Database notifications refresh connection
requests, inbox, direct/event/group history and
read receipts through the existing API, with no periodic HTTP polling. Subscribe,
reconnect and returning to the foreground catch up on missed changes. Leaving
both messaging views or changing accounts removes the subscription. Connection errors expose
an explicit reconnect action. Drafts and loaded history remain during background
refresh; stale or failed permission reads cannot authorize sends. Automatic reads
never retry a message send, and read acknowledgements are deduplicated by message
sequence. This requires `20261115030000_messaging_realtime.sql`; see
`docs/messaging-realtime.md` for activation and verification.
Typing uses throttled, authenticated activity flags and the same private owner
channels. Current participants see a named three-dot indicator; draft text stays
on the device. Indicators stop on send/blur/inactivity and expire after five
seconds. This requires `20261115040000_messaging_typing.sql`. Sent/Read labels
reflect confirmed storage and participant read positions, refreshed live.
The one-interest readiness policy requires additive migration
`20261101000000_one_interest_minimum.sql` on existing databases before rolling out
the relaxed client rule. Existing profiles remain intact; five-total/two-custom
caps and matchmaking weights are unchanged. Shared-interest badges use scoring's
normalization/aliases and count distinct shared topics.
Friends reads an owner-only setup status before requesting recommendations. It
shows specific guidance for the supported age range (18–99), disabled discovery,
missing preferences, or a search area that needs confirmation. Eligibility changes
during scoring return a setup conflict and recheck status, rather than a generic
server error. This requires `20261030000200_friends_discovery_status.sql`.
Friends and Dating show a focused setup flow for missing prerequisites. Both
reuse the saved interest and photo. Each mode confirms its own area and starts
discovery on its labeled final action. Events and groups reuse the Friends search
area while retaining their separate queue joins. Groups also require a saved
continuous hour of weekly availability and a timezone. Expired areas and
unavailable checks keep setup open. An unconfirmed area
shows “Choose an area” rather than the Profile home label.
Dating uses its existing owner-only runtime for specific age (18+), discovery,
profile, search-area and participation guidance. Recommendations wait until that
runtime permits them; eligible users start participation when they finish setup, and can pause from Discover. Setup
rejections retain their conflict category, and a definitively rejected opt-in is
distinct from an unconfirmed write. Pause remains available after eligibility
expires. Automatic setup rechecks are bounded to prevent recommendation loops.
Discover checks the account's shared rolling allowance before showing request
actions and after each request. At ten new requests in 24 hours, both modes show
the limit screen with the next available time and links to Messages and incoming
requests. Sending remains blocked while allowance reads are pending or failed;
availability is checked again on focus and when the next slot opens. The read-only
allowance API requires `20261030000100_connection_request_allowance.sql`.
Event group queues check for a result every three seconds while waiting, stopping
after a group appears, leaving the queue, or the event becomes unavailable.

This merge candidate retains latest dev API/schema and deployment configuration,
including session-scoped query caching, request allowance and readiness checks.
The Garden and profile parity layers are combined with those features. The earlier
FRONTEND-PARITY-REPORT.md is a historical pre-merge checkpoint, not the status of
this combined candidate. No SQL was installed and no deployment was performed.
Optional capabilities remain unavailable if the target backend has not activated
them. No new backend contracts were invented for the demo’s unsupported features.

Verification covers retained backend/client tests and a replacement browser suite
in `tests/browser/wiring.spec.ts`. The retired screen-specific suites were removed
with their implementations; account, preference, API and database contract tests
remain. Browser fixtures establish request/response integration, not live database
or hosted provider acceptance. See `docs/FRONTEND-WIRING.md` for validation scope.
