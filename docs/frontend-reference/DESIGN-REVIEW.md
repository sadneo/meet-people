# Pebble — implementation handoff and design review

Reviewed 24 October 2026. This is a standalone visual specification with in-memory fixtures, not the production application. Keep its authentication bypass and all fixture adapters out of production builds.

## Readiness verdict

The established visual direction, five primary destinations, Profile ownership, mode separation, and main interaction patterns are coherent enough to implement. This review corrected concrete demo defects. It does **not** certify a complete production design freeze: real-phone keyboard/accessibility testing and the product decisions listed below are outstanding. Do not infer an approved backend lifecycle from fixture code.

## Preserve these design decisions

- Warm cream canvas (`#faf7f2`), dark brown text (`#302b28`), terracotta primary actions (`#9d503d`), restrained sage and pink accents. The final overrides in the CSS are authoritative; earlier experimental palettes remain in the cascade and are not separate themes.
- Recognizable pixel Pebbles, square floating Garden, separate living sprites, clouds and distant friend islands. Keep terrain stationary while vegetation, water, breathing and chimney smoke animate subtly.
- Public website opens the **Landing page**. Its marketing layout is desktop-focused. Native app / app shell opens **Garden**.
- Primary order: **Garden, Events, Discover, Messages, Profile**. Discover occupies the center on mobile. Settings lives through Profile; Activity through Messages; Matches & Plans through Discover. Desktop has secondary sidebar links.
- Discover uses an animated **Friends / Dating** segmented control. Each mode presents one focused photo/profile at a time, with shared interests first and thumb-reachable icon actions. No separate Likes You page and no Downtime destination or offline group formation.
- Incoming Dating likes enter after the currently visible card; a subtle pink Likes you tag identifies them. A mutual like creates a Dating connection; it is not a second independent request system.
- Friends uses connection requests rather than romantic likes. A pending incoming request is visually distinguishable. Active **Find a group** is in Messages and remains independent of passive recommendations.
- Messages starts with the inbox. On phones a conversation replaces it and has an explicit back button. Desktop shows list + conversation. Groups start with member names and may be renamed.
- Garden building uses a bottom inventory drawer with a hammer handle; no permanent camera/minimap button stack. Items can be placed, moved, refunded and reset. Weekly statistics are tucked into This week. Motion can be paused there.
- Friend islands are background scenery with camera parallax and accessible tap targets. Empty islands offer “Room for a new friend.” They do not reveal another person's private progress. The connected-island preview is an illustration, not a working shared Garden.
- Keep copy lean, with brief explanations only for privacy, consequences, permissions, errors or irreversible actions.

## Ownership and precedence

| Data / control | Owner | Editing / behavior |
| --- | --- | --- |
| Display name, one photo, bio, private birthdate, home area, education, occupation, languages, pronouns | Profile | Draft editor with Save / Cancel; previews reflect visibility choices |
| Gender, sexuality, optional height | Profile → Dating details | One value per field; Dating has a shortcut, not duplicate identity inputs |
| Own relationship intention and relationship style | Profile → Dating details | Identity / intent, distinct from preferred partner filters |
| Interests (maximum 5) and weekly availability | Profile | Shared shortcuts from Friends; no separate copies |
| Age, general search area and radius | Friends and Dating independently | Temporary area must never overwrite Profile home |
| Friendship goal | Friends preferences | Separate from own biography and romantic intent |
| Gender target preferences | Dating preferences | Private; inclusive identity options do not imply forced public disclosure |
| Flexible age/distance | Dating only | Friends age limits stay strict; never interpret flexibility as permission to show minors |
| Friend recommendations | Settings → Discovery | Reciprocal opt-in: off means neither see nor appear in passive Friends recommendations |
| Dating | Settings → Discovery | Reciprocal opt-in; independent of Friends and manual group search |
| Location consent | Settings | Off without permission. General area only; never expose precise location |
| Notification master | Settings | Takes precedence over category/channel choices; push also requires permission |
| Block / remove / leave | Safety / conversation | Block supersedes discovery and direct contact; shared groups have explicit leave and sender suppression behavior |

Filter controls apply immediately in the demo and close with **Done**. They never opt someone into discovery or join a queue. Profile edits still use explicit Save / Cancel. Location selection is separately transactional: only **Use this area** commits; Cancel preserves the saved area.

## Core interaction contracts

### Discovery and connections

1. Pausing either passive mode hides its discovery surface and freezes pending mode activity; established chats remain accessible.
2. A new like cannot replace the current Dating card. Skip advances; Undo restores only the most recent skip, not a sent like/request or accepted connection.
3. Friends requests have pending, accepted and declined behavior. Mutual Dating likes show confirmation and a path to a conversation.
4. Block/report is available on profiles, requests, direct chats and group members. Reports/support are fixture records, never delivered.
5. Sharing exact birthdate, full weekly schedule or precise device location is never part of the design. Use approximate areas and overlap summaries only.

### Active groups and growth

- The user explicitly starts Find a group in Messages. Settings that pause recommendations/Dating must not disable it.
- “You + N new friends” is an ideal, not the minimum group size. A group can form with the user and at least one other accepted member.
- Pending people do not enter the chat automatically. Only confirmed members are in the formed group's roster.
- To grow a smaller group, initiate ready-up **inside the existing conversation**. Every current member must ready up before the existing group requeues.
- Newcomers must opt into joining existing groups and fit the target size / filters. They review the existing roster before accepting.
- Existing members appear ready; the newcomer still accepts independently. Joining preserves the existing conversation and starts the newcomer's visible history at their join boundary.
- Cancelling a growth search preserves the existing group and its conversation.
- These are reviewed visual flows. Expiry timing, invitation persistence and concurrent membership changes still need implementation policy; do not derive a production protocol from timeout fixtures.

### Location

- `locationAdapter.search()` is the replaceable geocoder boundary. The current fixture returns cities, neighborhoods and campuses, with a 250 ms debounce and stale-result protection.
- Selected suggestions update illustrative map offsets. Panning is mouse/touch/keyboard accessible, uses a center pin, and requires confirming the adjusted center before applying.
- Search/map are explicitly simulated. Current location offers user-triggered sample allowed/denied/unavailable states. No external geocoder, API key, real device coordinates or coordinate persistence exists.
- Profile home has no matching-radius control. Friends and Dating have their own radius. Applied illustrative offsets reopen in their corresponding context; cancelling a different suggestion does not commit it.
- Mobile sheet is fullscreen; desktop uses a constrained scrolling dialog. Preserve keyboard focus and labels when replacing it with a provider.

### Events and plans

- Guests browse categories, filters and details. Interest/group/plan actions ask them to continue through the standalone auth example; this is navigation design, not a security boundary.
- Categories and sample time/area/cost filters affect local results. All three fixture events are free. The fixed sample week is Oct 19–25, 2026; Today corresponds to the sample Saturday. Replace this with real date/timezone logic in implementation.
- Event interest is a reversible in-memory toggle. Queue/proposal surfaces remain prototype examples.
- Plan editing carries selected activity, local date/time and public meeting area into review and confirmation. No invitations or notifications are sent.
- Actual participant selection, permission to propose and scheduling conflicts are not implemented. Do not treat the hard-coded Coffee crew as a dynamic group-planning backend.

## Screens and states

| Area | Present in the demo | Implementation acceptance checks |
| --- | --- | --- |
| Landing / public Events | Marketing, guest browsing and legal links | Public users cannot fetch private profiles/chats through real API routes |
| Authentication | Email entry → existing Login / new Registration; Google fixture choice; recovery; onboarding; dev bypass | Loading, retry, validation, verified identity, error privacy and real session handling |
| Garden | Live scene, pan/zoom, purchases, placement, ownership, insufficient balance, reset/refund, weekly activity, background islands | Touch gestures, keyboard equivalent, low-end performance, reduced motion, image failure fallback |
| Friends / Dating | Populated discovery, off, exhausted queue, global empty/loading/error examples; request/like/mutual states | Filter enforcement, blocked/removed exclusion, reciprocal consent and correct mode identity |
| Active groups | Searching, review, accepted/pending, partial group formation, cancellation, ready-up, newcomer accept/decline, no eligible people | Retry after decline, stale offers, expiry, capacity races, member leaving/unreadying while queued |
| Messages | Search, requests, inbox, unread counts, history, Sent/Read, composition, rename, safety | Real delivery failure, retry/duplicate prevention, offline state, timestamps, read policy and keyboard |
| Profile | Overview, segmented drafts, validation, photo upload/crop/remove, interest limit, weekly time blocks/custom overnight/copy, public preview | Long names/bios, empty optional fields, unsupported image/error, Save/Cancel and screen-reader order |
| Settings | Discovery, notifications, account/security, safety, privacy/legal | Persistence, server enforcement, real permission changes and truthful side-effect feedback |
| Matches & Plans / Activity | Accepted connections, sample upcoming/past plans, plan editor/review/confirmation, updates and global state examples | Real entity links, no stale/bogus updates, cancelled/declined/expired plans and meaningful empty states |
| Terms / Privacy | Standalone, linked drafts, table of contents, mobile contents and return path | Operator-specific legal review before release |

The developer state picker is a visual review aid. A generic Empty/Loading/Error screen does not replace per-operation production error states.

## Changes made in this review

- Event filters now affect fixtures, expose their selected criteria, and can be cleared. Event interest persists within the session and toggles off.
- Guest-only event actions have a clear continuation path rather than silently dropping a guest into matchmaking.
- Plan editing/review/confirmation now uses entered values; the hub displays that plan's values. Validation rejects a blank meeting area.
- Activity uses the actual Jordan request state instead of claiming Alex requested; accepted/declined requests no longer claim to be pending.
- The connection hub opens the selected person's existing conversation (or shared group) instead of always returning to an unselected inbox.
- Profile inspection reuses mode-specific details and actual fixture ages instead of generic “21”/romantic text; existing conversations get a Message action.
- Undo shows a disabled state until an undoable skip exists.
- Named dialogs, current-page navigation semantics, consistent visible focus, touch-sized event categories and reduced-motion overrides were added.
- Location selection initializes the shown radius, restores separately applied illustrative anchors, rejects stale autocomplete responses, handles search failure, cleans up cancelled pointer drags and uses a fullscreen mobile sheet.
- Mobile safe-area padding, 16 px typing inputs and a compressible chat pane improve keyboard handling. Real-phone verification remains required.
- Garden activity includes an explicit Pause/Resume motion control.
- Session deletion clears the additional event, plan and illustrative anchor state.

## Outstanding decisions before a production design freeze

1. **Age eligibility.** Dating is 18+ in the prototype. Is the whole college service 18+, or can minors use Friends/events? If minors are supported, the age, safety and visibility model needs explicit separate design before implementation. Do not assume the generic birthdate editor establishes eligibility policy.
2. **Connections across modes.** The demo uses a simple name-based `connections` array and one direct conversation per person. Define whether the same pair can be connected in both Friends and Dating and which badge/actions should appear. Implement separate relationship records or mode metadata without accidentally upgrading friendship to romantic consent.
3. **Discovery criteria.** Passive discovery is a finite presentation queue; preferences are not a real ranking/filtering engine. Decide reciprocal hard filters, intention/style compatibility, radius semantics, and the exact bounded meaning of “slightly outside.” No silent widening of strict Friends criteria.
4. **Invitation and plan lifecycle.** Agree response deadlines, expiry/cancellation, outstanding invitations after partial formation, group growth retry, and what happens if members leave/block/unready while queued. Design the remaining operational states before wiring real matching.
5. **Friend Garden sharing.** Current islands do not expose real progress. Confirm opt-in visibility and what a friend may see before building visits; keep statistics private until that policy is explicitly approved.
6. **Legal / retention / trust.** Identify operator and support contacts, eligibility, moderation, hosting/provider retention, deletion/export policy, and whether profile home/search anchors/device coordinates are retained. Terms/Privacy are review drafts; no production retention period is approved.

These are focused product/behavior decisions, not a reason to redo the palette or navigation. They should be resolved with the implementer before backend work makes them expensive.

## Mobile and accessibility release gate

The browser available for this review supports desktop inspection but no supported viewport resizing. Local preview infrastructure was unavailable. CSS inspection and VM tests are useful, but do not certify phone rendering or keyboard behavior.

Before calling the UI frozen, capture and sign off at **320, 360, 390, 430, 768 and 1440 px**, including a short-height landscape phone, iOS Safari and Android Chrome:

- No horizontal overflow, clipped bottom sheets, obscured actions, or text cropped at 200% text size.
- Software keyboard: focused email/password/profile/location/message input remains visible; composer and Send stay usable; sheet can scroll; switching conversations preserves intended drafts.
- Safe areas: notches and bottom home indicator never cover nav, action tray, inventory or Save.
- Discovery: full details remain available. The current design allows scrolling; keeping the photo, all details and actions on every phone without scrolling is not a confirmed requirement or proven result. Fixed actions must not obscure details.
- Touch targets at least 44 px and visibly distinct focus/selected/disabled/error states. Sliders must work with touch and keyboard independently.
- VoiceOver/TalkBack: dialog title, tabs, controls, dynamic results, errors, unread state, labels and focus return are understandable. Canvas content needs an equivalent accessible inventory/activity experience.
- Reduced motion and explicit pause stop decorative animation. Garden pan/zoom and placement do not trap page scrolling outside the canvas; test pinch and pointer cancellation on devices.
- Long names, custom interests, long campus names, translated/large text, missing photos and empty schedules do not break layouts.

## Files, execution and integration boundaries

- `dist/app.js`: routes, fixture state, discovery, events, messaging, groups, planning, location adapter and developer navigator.
- `dist/account-ui.js` / `dist/account-ui.css`: shared Profile, Settings, safety and account simulations.
- `dist/sky-garden.js`: canvas scene, camera, independent animation, placement/inventory/activity and friend-island backgrounds.
- `dist/legal.js`: Terms/Privacy review drafts.
- `dist/style.css`: final visual styles plus accumulated prior iterations. Extract the final computed design into components/tokens during production implementation; do not reproduce the historical cascade verbatim.
- `dist/assets/`: supplied/recreated pixel assets, branding, and locally stored illustrative stock portraits/events. Stock profiles use fictional names. Confirm asset licenses/source provenance before a production release; the demo's attribution notes are not license evidence.
- `tests/account-ui.test.cjs`: `node tests/account-ui.test.cjs`. VM/DOM-stub interaction checks; not a browser rendering, security or end-to-end backend suite.
- Start with the Site's existing `.openai/hosting.json` identity. There is no npm build, database migration or backend provider to run for this static demo.

The web root uses `?view=auth`, `?view=login`, `?view=register`, `?view=recovery`, `?view=onboarding`, `?view=events`, `?view=terms`, `?view=privacy`; `?app=1` opens Garden. Use the dev navigator for in-app views and fixture states. Production needs a proper router/history/deep-link contract; most internal demo navigation is in-memory.

Do not ship the public DEV menu, Sign in as dev, response-simulation buttons or fixture identities in the production application. Reimplement real authentication, authorization, visibility enforcement, queues, messaging, consent and moderation through separately tested services. Never weaken an existing application's authentication/database permissions to match this prototype's browsability.

Google Fonts remains an external font request; bundle licensed fonts locally or confirm provider/privacy requirements. The app has no real geolocation, geocoder, payments, analytics integration, notification provider, account lookup, message delivery or production matching.

## Verification record

- Passed existing Profile/Settings fixture tests and added event filter/interest/guest, planning continuity, Activity, Undo, location independence/cancel/stale-search, partial-group and unanimous-ready-up checks.
- Checked syntax for app, account, Garden and legal JavaScript, whitespace errors and referenced local asset existence.
- Inspected the live desktop Garden, Friends/Dating cards and location flow before the changes. Final live smoke checks are recorded with the handoff publication. No real-phone or production-service verification is claimed.
