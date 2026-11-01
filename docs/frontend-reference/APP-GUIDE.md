# Pebble — product vision and implementation guide

**Package snapshot:** 24 October 2026 · hosted demo v119 · source commit `b6006352c4bfc11bb6c7944681d7f268125d2b10`.

This guide describes the **current** Pebble design. Earlier concepts were revised repeatedly. Follow the current behavior and the decisions below rather than rebuilding every historical request. `DESIGN-REVIEW.md` records remaining decisions and acceptance checks in greater detail.

## 1. What we are building

Pebble is a mobile-first college social app for meeting friends, finding dates, discovering events and making plans together. It should feel approachable, modern and easy to use without losing its playful community identity. The pixel-art Pebble mascot and living floating Garden make it recognizable. The rest of the product should stay clean and restrained: generous but purposeful spacing, warm surfaces, clear typography, standard icons and very little unnecessary text.

The Garden makes community growth tangible. Connections and attending events are intended to grow a person's world and support an expressive buildable garden. In this demo the economy, statistics and activity history are **fixtures**, not proof of attendance, persistent progress or a finalized reward system.

### Product principles

1. **People first.** Discovery should focus on one person and the useful information needed to decide whether to connect.
2. **Different intentions, clear consent.** Friendship, romantic interest and manual group search are distinct. Using one must not silently opt someone into another.
3. **One shared identity.** Profile owns personal information. Search preferences describe who someone wants to meet and belong to the relevant mode.
4. **Privacy by default.** Share general areas and overlapping time summaries; never precise location, full private schedules or exact birthdates.
5. **Small, useful interactions.** Keep primary actions easy to reach and make saved, selected, waiting, disabled and error states clear.
6. **A living world, a quiet interface.** Garden motion is playful and subtle; the rest of the UI avoids distracting animation.
7. **Mobile first; responsive desktop.** The app works as a compact phone interface. The public marketing landing page is desktop-focused and is not a native app startup screen.

## 2. Start and explore

Extract the ZIP and open **Pebble.html**. It contains the working static demo, with styles, scripts and images embedded. Nothing needs to be installed to browse it.

The public Landing page opens first. Select **Sign in**, then **Sign in as dev** to enter the fixture app. The developer navigator can jump to individual pages, examples and generic populated/empty/loading/error states.

The **source/** directory contains the same app in editable modular form. `source/dist/index.html` is its entry. No framework, package install, database or build step is required. A local static server is recommended if a browser restricts image/canvas operations when opening files directly.

Everything is in memory and resets on refresh. Forms do not create accounts, send messages, request real device location, contact a geocoder, deliver notifications or submit reports. These interactions demonstrate the intended look and flow.

### Offline export differences

- External font loading was removed. System sans-serif fallbacks make the export independent of internet access. To reproduce hosted typography precisely, bundle licensed **DM Sans** (body) and **Manrope** (headings) during implementation.
- The single-file HTML rewrites home links to `Pebble.html`. The modular source keeps the standard `index.html`/directory entry behavior.
- The single-file export is generated from the source and will not automatically update when source files are edited.
- Public links in Design notes remain references; opening those links requires internet access.

## 3. Visual identity

| Role | Direction |
| --- | --- |
| Main canvas | Warm cream `#faf7f2` |
| Raised surfaces | Soft off-white `#fffdf9` |
| Primary text | Deep warm brown `#302b28` |
| Main action | Terracotta `#9d503d` |
| Borders | Pale warm neutral `#e7dfd5` |
| Secondary text | Muted taupe, with sufficient contrast for its size |
| Branding | Existing green Pebble wordmark with pink accent |
| Friends accents | Muted sage / earthy neutral |
| Dating accents | Restrained dusty pink; subtle incoming-interest tag |
| Shape | Soft rounded cards, chips, fields and sheets; standard line icons |
| Imagery | Real illustrative stock photos for profiles and events; pixel artwork for the Garden |

The code includes historical CSS overrides. The **final computed appearance** is the reference. During implementation consolidate tokens and reusable components rather than carrying every old rule forward.

Do not stretch the logo. Preserve its aspect ratio. The currency uses a Pebble character icon, not a generic diamond. Keep pixel assets crisp using nearest-neighbor scaling where appropriate. Standard navigation icons should stay legible and familiar.

Use text where it communicates a destination or a consequence. Discovery actions can be icon-only, with accessible names/tooltips and clear disabled states. Avoid filler captions, repeated explanations and extra marketing copy inside the app.

## 4. Information architecture

### Five primary destinations

**Garden → Events → Discover → Messages → Profile**

Discover is the middle item on the mobile bottom navigation. Desktop uses a sidebar. The navigation should remain available on primary pages without trapping users on secondary pages.

### Secondary destinations

- **Settings** is reachable from Profile.
- **Activity** is reachable from Messages.
- **Matches & Plans** is reachable from Discover.
- Auth, recovery, onboarding, Terms and Privacy are standalone public pages/examples.
- Garden Build and weekly activity are contextual drawers/sheets.
- Filters, location, safety, group review and planning are contextual dialogs/sheets.

The desktop sidebar also lists secondary destinations. Do not add all of them to the five-item mobile bottom bar.

## 5. Page-by-page specification

### Landing page — public website

Purpose: explain the app quickly and direct visitors to start or browse events.

- Pebble branding in the header, Events and Sign in access.
- Main headline: “Meet new friends, find a date, and make plans.” First line has brand green; the remaining headline uses warm brown.
- Get started and Browse events actions.
- Friends/Dating sample profile visual.
- Pixel Garden section headed “Grow your garden.”
- Privacy, Terms and Safety links.

Keep this lean and desktop-focused. Do not reinstate removed small taglines, extra feature lists or the old landing event-card section. Native app entry goes to Garden.

### Welcome / email entry

Purpose: shared starting point for email or Google, before the appropriate account path.

- “Welcome to Pebble.”
- General email field; no school-email requirement.
- Continue with email and Continue with Google.
- Existing fixture email leads to Login. A new fixture email leads to Registration.
- Loading and failure feedback while checking.
- Standalone page, not a popup.
- Dev sign-in exists only to explore the demo.

Fixture examples: `jamie@example.com` is an existing account, any other valid email is a new account, `error@example.com` simulates failure. The Google flow selects an example existing/new account; it does not access Google.

Real implementation must handle account lookup without leaking account membership unnecessarily. This demo's simple lookup is not a production security pattern.

### Login

- Existing email + password, or fixture Google continuation.
- Forgot password, change email/provider, back home and legal links.
- Valid input types and autocomplete; feedback must remain visible above the keyboard.

### Registration

- Email + create password, or selected fixture Google account.
- Continues into onboarding.
- Similar layout and palette to Login.
- The demo does not collect/store passwords or create real users.

### Recovery and onboarding

Recovery demonstrates a password reset entry and a non-delivery message. Onboarding currently asks for display name and purpose and leads to the app. It is not a complete production onboarding or eligibility flow.

Before production, agree the minimum profile, age eligibility, consent and mode opt-ins. Do not copy the demo's default enabled modes as consent for a newly registered user.

### Garden — app home

Purpose: personal expression, community growth and a calm playful opening experience.

- Full-scene pixel-art floating square island; free camera pan and zoom.
- Breathing Pebbles, swaying vegetation, moving water, chimney smoke and drifting clouds.
- Compact branding and Pebble-currency balance.
- Small distant friend islands are painted into the background with parallax; they are not floating UI cards.
- Future-friend islands remain when there are no friends. Tapping one says “Room for a new friend” and offers Discover people.
- Connected islands show an illustrative friend preview. No real friend's activity or Garden is fetched.
- This week opens statistics/history. Motion can be paused there. Day buttons select sample activity.
- Hammer handle opens the inventory drawer; swipe interaction also opens it.
- Build catalog groups rare characters, landscape and village decorations. Show price, owned state and insufficient balance.
- Purchase enters placement mode. Items can be placed, dragged, moved with keyboard, removed/refunded, undone and reset/refunded.
- Reset affects purchases, not the starter island.

The real reward model—how much currency each action earns, caps, refunds and attendance validation—is not approved by these fixtures. Keep the Garden usable independently of any camera controls or precise placement gestures on a small phone. Provide accessible inventory/arrange alternatives to canvas gestures.

### Discover — Friends

Purpose: passive, opt-in individual friendship discovery.

- Friends/Dating mode control and visible general search area.
- Preferences icon and Matches & Plans shortcut.
- One photo profile with name/age, concise role/area/goal, gradient for text contrast and safety action.
- About, interests with shared ones first, common time summary and relevant facts.
- Undo last skip, skip and send/accept Friends request actions.
- Incoming Friends request has a distinct non-romantic tag.
- Off state when Friend recommendations is disabled; existing chats and manual group search still work.
- Exhausted, empty, loading and error examples.

Friends preferences: strict age range, separate area/radius, friendship goal, shared interests shortcut and shared availability shortcut. Do not add Dating's flexible-age checkbox to Friends.

### Discover — Dating

Purpose: opt-in romantic discovery, visually related to Friends but distinct in intent and actions.

- Same overall navigation and focused profile structure.
- Photo/card actions: undo last skip, skip and like.
- Relationship intention/style and mode-appropriate facts.
- Incoming like enters the queue after the current profile, with a subtle pink “Likes you” tag at the top left.
- Liking someone who already liked the viewer creates one mutual Dating connection, shows confirmation and offers messaging.
- No separate incoming-likes grid/page.
- Pause/off, exhausted, empty, loading and error examples.

Dating preferences: independent age range, search area/radius, optional slight age/distance flexibility and target gender preferences. Own intention/style/gender/sexuality/height are Profile information with a shortcut from Dating; they are not duplicated identity values.

Preferences apply immediately in this demo and close with Done. They do not enable Dating. Undo is only for the most recent skipped profile, never a sent like or established connection.

### Messages

Purpose: a familiar inbox and conversation experience.

- Searchable contacts/conversations, time, preview, unread counts and Friends/Dating badges.
- Incoming Friends requests with accept/decline and safety controls.
- Tap a contact to open history; mobile has Back to conversations.
- Desktop has a two-pane list/history layout.
- Text composition and sent/read examples.
- Options: view profile, plan, block/report, remove connection. Groups also support rename, member safety and leave.
- Active Find a group entry, plus Activity shortcut.

A real implementation needs delivery, failure/retry, offline states, deduplication, unread/read synchronization and per-conversation drafts. In-memory sent/read fixture labels are not delivery guarantees.

### Messages → Find a group — active matchmaking

Purpose: explicitly search with other people who manually chose to find friends now.

- Separate from passive recommendations and Dating opt-ins.
- Choose ideal number of **new friends**, from 1 to 8, expressed as You + N.
- Optional willingness to join existing groups.
- Shared age/search area/radius, interests and availability context.
- Explicit start, searching/waiting, manual checking and cancellation.
- Sample candidate group with accepted/pending responses; own acceptance is required.
- User + at least one accepted person can start a smaller group even if others have not accepted.
- Only accepted members enter the conversation. Default chat name uses member names.

To grow a smaller group:

1. Start ready-up inside the existing conversation.
2. Every existing member readies up before requeueing.
3. Newcomers must allow joining existing groups and satisfy size/filter compatibility.
4. Newcomers review current members before accepting. Existing members appear ready.
5. Accepted newcomers join the same conversation and see history from their own join boundary, not earlier messages.
6. Cancelling growth leaves the existing group and chat intact.

These are fixture simulations. Expiry, partial invitation persistence, concurrency and policy for members leaving/blocking/unreadying still need agreement. Do not rebuild Downtime/offline auto-group formation as part of this flow.

### Events

Purpose: public discovery and a path to attending with company.

- Compact image cards with slightly darker warm surfaces, clear title/date/area and people looking for company.
- Responsive wrapping grid; no horizontal event scrollbar.
- Category chips, filters, clear active criteria and empty category/filter results.
- Details show image, description, sample time/place/price/attendance and actions.
- Signed-in demo can toggle interest and access event queue/proposal surfaces.
- Guests can browse; social/interest actions offer sign-in continuation.

All supplied event dates/counts/photos are sample information. Time filters use a fixed demo week. Real dates, timezone, cost/capacity, organizer trust, ticket links, cancellation, accessibility and attendance verification need live event data and implementation policy.

### Profile

Purpose: the single source of personal identity and shared matching information.

Overview: photo, name, general home, bio, About you, Interests & availability, Dating details, public preview and Settings.

**About you:** change/adjust/remove one photo, display name, bio, private birthdate, optional pronouns, general home, education, occupation and languages with supported visibility switches.

**Interests & time:** up to five preset/custom interests; weekly availability; timezone; overlap visibility. Availability starts Sunday and ends Saturday in the picker. Each day supports morning, afternoon, evening, late night and a custom time interval, including overnight. Copy to other days and clear-day reduce repetitive input.

**Dating details:** concise inclusive Gender/Sexuality selectors with Other last and optional self-description; optional height in cm; Dating visibility per identity field; own relationship intention and style with visibility controls.

Profile has draft Save/Cancel, validation and unsaved-navigation confirmation. Shared edits from Friends must update this same data. Home must not be overwritten by temporary search areas. Photo validation/crop is local in the demo. Removing the photo pauses Dating.

Public preview demonstrates visible fields for Friends/Dating. Exact birthdate and the full weekly timetable do not appear publicly. The real eligibility and trust/verification model is still a production decision.

### Settings

**Discovery:** independent reciprocal Friend recommendations and Dating switches. No redundant global “Allow passive discovery” toggle. Manual Find a group is independent. Location permission/consent, general-area privacy explanation and preference shortcuts.

**Notifications:** master activity setting; Messages, Connections, Groups & plans and Events categories; per-category in-app/email/push examples. Master overrides categories and push requires permission. Nothing is delivered by the demo.

**Account & security:** email change, pending verification, reauthentication examples, password management, Google/email methods with at least one method retained, sessions and deletion. Demo account operations never change real credentials or devices.

**Safety:** blocked list/unblock, report history, support, guidelines, contextual block/report, remove connection and leave group. Real reports need moderation delivery and user feedback; the fixture never sends them.

**Privacy & legal:** public preview, local data export, standalone Terms/Privacy, location/Garden notes. Logout returns to public auth. Delete demo account explicitly clears session fixtures and can be reset by reload.

### Matches & Plans

Purpose: revisit accepted connections and upcoming/past plans without adding another primary nav item.

- Upcoming, Connections and Past tabs.
- Connection entries lead to the existing person's conversation or shared group.
- Plan create → review → confirmation carries edited activity, date/time and public meeting area.
- Confirmation is explicitly simulated; no invitation or notification is sent.
- Demo planning uses a fixed sample crew. Dynamic participants, invitation roles, conflicts, cancellation and expiry require implementation.

### Activity inbox

Purpose: distinguish incoming interest and updates without crowding primary navigation.

- Dating interest points to the discovery queue, not a Likes You page.
- Friends request uses its current pending/accepted state.
- Plan updates link to review.
- Empty/loading/error design examples.

Production entries must reference actual entities and disappear/change when resolved. Never keep advertising a pending request after acceptance or a plan no longer available.

### Terms of Service, Privacy and Safety

Terms and Privacy are standalone, linked pages with readable document layouts, contents navigation and explicit return paths. They are **review drafts**. They do not establish production legal terms, a retention schedule or a verified operator identity.

The Safety public example is a dialog; Settings contains the fuller in-app safety controls. A production safety/help page can reuse the information structure without treating fixture reports as real delivery.

## 6. Shared data and permissions

Profile owns identity. Friends and Dating own independent search preferences. Settings owns participation/consent. Established conversations are independent of whether new discovery is currently paused.

| Information | Intended display |
| --- | --- |
| Name, single photo, bio, chosen interests | Person's visible profile |
| Age | Derived from valid birthdate; eligibility policy still to be confirmed |
| Birthdate | Private; never show exact date to other people |
| Home / discovery area | General area, never precise device coordinates |
| Full weekly availability | Private |
| Time in common | Coarse overlap summary, subject to visibility |
| Education/occupation/languages/pronouns | Supported visibility controls |
| Gender/sexuality/height | Supported Dating visibility controls; one underlying value |
| Search target/filter preferences | Private |
| Garden statistics and progress | Private fixture; future friend sharing requires explicit policy |
| Existing group history | Existing members; newcomers from their join boundary |

Global blocks, eligibility and privacy rules take precedence over mode preferences. Notification master and permission checks take precedence over category settings. Saving Profile, changing filters or choosing an area must never silently enable discovery or join a queue.

## 7. Location selector contract

- Mobile full-screen sheet, desktop dialog; editing context is visible.
- Fixture adapter searches city/neighborhood/campus suggestions with debounce, loading, no-result and failure handling.
- Suggestions update the illustrative map. Center-pin panning proposes a changed anchor and requires confirmation.
- Radius changes update the circle and label for Friends/Dating; Profile home has no matching radius.
- Use this area commits; Cancel retains previous area/radius.
- Optional current-location action is user-triggered and simulates allowed/denied/unavailable permission.
- Profile, Friends and Dating are independent. The fixture adapter is replaceable.
- No paid map provider, external geocoder, API key, real coordinate request or trusted location verification is present.

Use a provider adapter with search results, selectable IDs, general display label and a clearly scoped anchor/radius contract. Any real coordinate collection/retention needs a separate confirmed privacy and security design.

## 8. Architecture and implementation direction

### Included source

- `source/dist/index.html`: app mount, dialog/toast containers, styles and script order.
- `source/dist/app.js`: route selection, state, fixtures, discovery, events, messaging, groups, plans, location and dev navigator.
- `source/dist/account-ui.js`: Profile/Settings, validation, visibility, availability helpers, account/safety simulations.
- `source/dist/account-ui.css`: focused account/editor components.
- `source/dist/sky-garden.js`: canvas rendering, assets, camera, animations, purchases and sheets.
- `source/dist/legal.js`: legal draft content.
- `source/dist/style.css`: shared visual rules and responsive overrides.
- `source/dist/assets/`: images, branding and sprite metadata.
- `source/tests/account-ui.test.cjs`: fixture logic checks.

The current app is vanilla JavaScript with one in-memory state object and inline handlers. Treat it as a visual reference. Production can use the team's chosen stack while preserving behavior, accessibility and layout.

### Suggested production boundaries

This is an implementation proposal, not an existing backend:

- **Identity/Profile:** stable user IDs; private birthdate/eligibility; visible fields and photo references.
- **Availability:** timezone-aware intervals with overnight handling; expose only derived permitted summaries.
- **DiscoveryPreferences:** separate Friends/Dating scopes, radius/area and mode-specific criteria.
- **Participation/Consent:** reciprocal mode opt-ins, location consent and notification hierarchy.
- **Relationships:** mode-aware friend requests and Dating likes/mutual connections; clarify cross-mode connection policy.
- **Conversations/Membership/Messages:** stable participants, unread state, delivery and per-member join/history visibility.
- **GroupSearch:** explicit queues, proposals, responses, capacity, ready-up and cancellation. Timers need server authority.
- **Events/Interest:** organizer content, dates/timezones, attendance/interest and group intent.
- **Plans:** real participants, proposed activity/place/time, responses and lifecycle.
- **Garden:** owned inventory, placement, ledger/rewards/refunds with confirmed economy rules.
- **Safety/Account:** enforced blocks, report workflow, sessions, deletion/export and legal records.

Do not use a display name as an identifier. The demo does so for convenience. Do not use client-side flags, hidden buttons, fixture group membership or map offsets as access control. Enforce privacy/membership/eligibility on the server.

### Integration order

1. Agree open product policies in DESIGN-REVIEW.md and sign off actual phone layouts.
2. Extract design tokens/components and implement navigation, public pages and routing.
3. Build secure auth, onboarding and Profile with shared data ownership and preview.
4. Implement consent, privacy and safety enforcement before discovery.
5. Add passive Friends and Dating, relationship records and conversations.
6. Add Events and plans with clear real-world data states.
7. Add active groups and growth only after lifecycle/concurrency policy is agreed.
8. Connect Garden progress/economy once rewards and sharing rules are approved.
9. Remove all demo-only controls and complete device, accessibility, integration and security testing.

## 9. Quality and handoff checklist

Run `node tests/account-ui.test.cjs` from `source/` with Node.js installed. The tests use a DOM stub and verify interactions; they are not a rendering or production-security suite.

Before release:

- Sign off phone widths 320/360/390/430, tablet and desktop, portrait and short landscape, iOS Safari and Android Chrome.
- Test keyboard visibility for auth, chat, Profile and location. Confirm composer/Send and Save actions stay usable.
- Test safe areas, 200% text size, long names/interests/areas, focus order, screen-reader announcements, error recovery and 44 px targets.
- Verify mode opt-outs are reciprocal, manual queues remain independent, blocks actually enforce exclusion and private schedules/location never leak.
- Test real failure/retry/offline/empty states, double submission and race conditions for every network operation.
- Confirm event/plan timezones, expiry/cancellation and entity links.
- Confirm sprite performance, reduced motion, pause and accessible non-gesture alternatives.
- Review actual image/font licenses and legal/privacy content against the real implementation.

### Current review limits

The prior review passed fixture checks, JavaScript syntax checks and live desktop smoke tests. It did not verify real phones, software keyboards, production providers, moderation delivery or backend matching. The demo permits scrolling to retain full profile information; a completely scroll-free layout on every phone is not proven or promised.

The remaining decisions are concentrated in age eligibility, cross-mode relationships, exact filter compatibility/flexibility, group/plan lifecycle, friend Garden sharing and production legal/retention policy. Resolve these before implementation hardens them. They do not require abandoning the current visual direction.

## 10. Explicitly removed / not approved

- No separate Downtime matchmaking destination, offline automatic grouping or inferred notification/post-match lifecycle.
- No separate Dating Likes You page; incoming likes belong in the next-profile queue.
- No active Find friends group queue on Discover; it lives in Messages.
- No redundant global passive discovery toggle.
- No setting to reveal precise location. Precise location is never shown to other users.
- No school-email-only signup requirement.
- No production auth bypass, API keys, notification delivery, geocoder, payments, database schema or provider configuration in this package.
- No approved real reward schedule, attendance verification, public Garden statistics or production retention period.

## 11. Included files

- **Pebble.html** — portable self-contained working demo.
- **README.txt** — quick opening/running instructions.
- **APP-GUIDE.md** — this full product and implementation guide.
- **DESIGN-REVIEW.md** — detailed ownership contracts, audit fixes, outstanding decisions and mobile acceptance gate.
- **ASSET-INVENTORY.csv** — file sizes, checksums and production licensing reminders.
- **source/** — editable app and tests.

All people, messages, balances, attendance, requests and progress are illustrative. No private account data or repository credentials are included.
