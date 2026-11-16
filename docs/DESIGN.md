# Pebble design system

## Current frontend (prototype integration, October 30, 2026)

The finalized `Pebble-Garden-Asset-Work` prototype is the visual and interaction
reference. The real React frontend from `alt-frontend`, with reviewed browser fixes
from `wiring`, supplies the service-connected foundation. The standalone prototype
is read-only; do not copy its simulated data or replace React with its HTML.
React shell styles live in `src/ui/`; the integrated
Garden renderer lives in `src/features/garden/`, with artwork in `public/garden/`.
Other frontend assets live in `public/pebble/`. The old prototype, design-system shell
and route screens are no longer the application entry. The retained `src/alt` reference
is not the integrated app. Web and mobile have separate entry points in `src/web/`
and `src/mobile/`. Web presents installation status and public events; mobile opens
login when signed out. This document supersedes their earlier design directions.
Product UI changes must follow it.

The public web landing page follows the supplied `Pebble-Landing-Page.html`
desktop composition: forest-green wordmark, split headline/profile hero, store
badges and an interactive marketing Garden. Its React implementation and scoped
styles live in `src/web/`. It has no Sign in link.
Google Play opens the general store until an app listing exists. The illustrated
profiles and ephemeral, single-selection Garden preview are examples, not live
accounts or saved account Garden state. Do not import the export's unrelated
application/loading styles or embedded image data. Mobile entry remains unchanged.

## Loading and media readiness

The mobile cold-start/session/initial-account gates use the rolling-Pebble design
from `Pebble-Loading-Page.html`, implemented in `src/ui/loading/`. The same static
markup/CSS is included in mobile HTML before JavaScript; public web HTML remains
unchanged. This is a real pending state, never a timed splash or a navigation
destination. Ready content replaces it immediately. After a prolonged wait, an
explicit reload link appears; no automatic authentication or mutation retries are
added. Cold startup omits the demo's prototype-host Back button.

Normal navigation retains the app shell. Unresolved Events, Discover, Messages,
requests/activity and profile/settings regions use matching skeleton layouts.
Cached content stays visible during background reads; skeletons never grant write
permissions or replace conflict/uncertain-save guidance. Image placeholders are
local to the image and end on load/decode or an error fallback. Garden keeps its
sky/island skeleton until required artwork has produced its first successful
canvas frame, with an explicit artwork-only retry on failure. Skeleton shapes are
decorative with one status per region. Reduced motion stops decorative animation.

## Visual direction

Keep the alternate frontend’s quiet, warm composition and floating pixel garden.
Use its existing tokens, rounded forms, profile cards and restrained navigation.
Do not add another theme or CSS framework.

| Token | Value | Purpose |
| --- | --- | --- |
| `--cream` | `#faf7f2` | Page canvas |
| `--ink` | `#302b28` | Main text |
| `--green` | `#9d503d` | Existing primary action token |
| `--line` | Existing alternate stylesheet value | Form and panel boundaries |
| `--muted` | Existing alternate stylesheet value | Supporting text |

Retain the DM Sans / Manrope declarations with readable system fallbacks. Actions
have rounded ends; form controls and panels reuse `style.css` and `account-ui.css`.
`wiring.css` adapts these components to React, service states and real form fields.
Raster artwork stays crisp and keeps its original aspect ratio.

## Navigation and layout

Garden, Events, Discover, Messages and Profile are the primary destinations, in
that order. Discover is the center tab on mobile, matching the complete demo.
Activity is a supporting destination; account settings live within Profile. Desktop uses the alternate
frontend’s left navigation; at 800px and below it becomes bottom navigation.
Compact screens reach Activity from Messages and Settings through the Profile gear, without
an extra floating text toolbar over the page. Destination controls
are real links and expose accessible names and current-page state.

Profile and its settings sections use the demo’s focused 760px account layout.
Profile opens with saved summaries, Preview, a Settings gear, and About you,
Interests & availability, and adult-only Dating details rows. Friends and adult-only
Dating preferences link to their real preference editors. The five existing account
settings categories live in `/profile?section=settings`; each category returns to
that hub. Editor sections follow the URL, including browser Back/Forward. Mobile
profile Save/Cancel stays above bottom navigation. Compact account dialogs use
full-screen sheets; short tasks (filters, safety, confirmations, member lists,
Find a group) use content-sized bottom sheets with a drag handle; desktop
retains centered dialogs.

Matches & Plans has Upcoming, Connections and Past tabs. Populate these only
from supported services; unsupported plan history must not become sample history.
Messages uses inbox/chat columns on desktop and a single selected pane on mobile.
The message history scrolls independently of its composer. Forms must fit 320px,
short screens, large text and the bottom safe area. Dialogs scroll internally and
support Escape, focus containment and focus return. Keep visible keyboard focus,
44px controls and reduced-motion behavior.

## Motion and touch feedback

Motion explains change; it never delays a confirmed result. Dialogs and sheets
lift or slide in and reverse on close. Tabs cross-fade; deeper screens slide in
from the right and back from the left. Pressed controls scale slightly. New
messages, newly placed Garden items, earned Pebbles and completed steps get a
short entrance. Discover decisions use the Pass and Connect buttons; the card
leaves in that direction. Swiping a Discover card only moves between its photos. Lists support pull-to-refresh on touch while
keeping a visible Refresh control. Confirmations use a brief toast; errors that
need a decision stay inline. Native builds add light haptics to key actions.
Conversations hide the bottom navigation. Text is at least 12px, except 11px
bottom-tab labels so they still fit at doubled system text. Settings
switches save as soon as they change. Reduced motion removes all decorative
movement.

## Onboarding and matching setup

Open with a single mobile form for display name, user-chosen username and private
birthday. Use clearly labeled numeric month, day and year fields. A confirmed
adult profile enters the requested app screen or Garden. Save the supported device
timezone as the initial schedule default. The schedule shows the saved timezone
and lets people search or use their current device timezone. Put matching setup
beside the matching action and open it in a focused, full-screen mobile dialog.

Each matching feature requires one saved profile photo, at least one interest
and a confirmed search area. Friends and Dating have separate areas. Event and
group matching use the Friends search area. Weekly availability is optional
until group matching, which needs a continuous hour and a confirmed timezone.
Profile and matching setup offer a photo manager with up to four ordered photos.
Drag a handle to reorder photos. The first is the profile photo. Friends and
Dating cards support swiping when a person has more than one photo, with
keyboard navigation on the photo viewer.

## Real data and service states

Supabase owns authentication and private messaging change notifications. Existing Express `/api` contracts own account,
preferences, matching, events, connections, messages, photos and safety receipts.
Do not turn fixtures into apparently real people, notifications or saved settings.
Loading, empty, unavailable, conflict and unconfirmed-write states stay distinct.
A failed write never establishes success. Versioned resources retain their existing
revision checks and explicit reconciliation requirements.

Finishing Friends or Dating setup starts discovery for that mode. State the
visibility change on the final action and preserve existing privacy choices.
Dating drafts and search-area confirmations do not start discovery by themselves.
Event and group queues still require a separate join action. Device location requires an explicit action;
Profile home and per-mode search areas stay separate. Interests and weekly
availability use one canonical Profile resource.

Dating targets derive from clear gender/sexuality labels with reciprocal checks;
only ambiguous/nonbinary combinations require clarification. Interests are capped
at five, with at least one interest (provided or custom) and at most two custom labels.
Avoid persistent explanatory microcopy when labels suffice; show errors and required
clarification only when relevant. Availability From/Until fields share a row on mobile.

Search area uses one summary row and a Google map picker subview, full-screen on
mobile. Search neighborhoods, optionally center with device location, then move the
map beneath a fixed pin and explicitly confirm. No Home/Temporary selector, GPS on
mount, background tracking, or public people/pins map. Keep map attribution visible;
opening and canceling never change saved preferences. Missing configuration shows
an unavailable state, never a synthetic production map.

Garden uses the reference's #e8efed sky, pixel clouds, illustrative floating islands,
forest-green wordmark and cream bottom Build tray. `features/garden/sky.css` loads
after the general shell styles; do not restore the dotted workspace background.
Weekly Activity previews remain device-local and never claim real attendance or meetings.

Garden balances, purchases, placements and unique Random Pebble unlocks now use
an authenticated account service. The server awards 300 starting Pebbles, a 100
one-time onboarding reward, 20 per UTC-day check-in, and 50 on the fifth distinct
check-in of a UTC week. Sustained mutual conversations can earn 30 once per peer
(up to twice weekly), plus 20 for keeping in touch in a later week. A muted sage
pole-free flag has a red dot only when a server-confirmed reward is claimable.
Its compact cream sheet shows reward rows and seven UTC ledger-based check-in
circles; fuller rules stay collapsed.
See `docs/PEBBLE-ECONOMY.md` for activation and test boundaries. Purchases and
rewards fail closed when the service is unavailable; no local currency fallback.
New account gardens start blank with one Pebble. Landscape stays fixed; decorations
can be dragged. Reset refunds actual regular purchases and returns collected rocks
to free inventory without refunding or rerolling unlocks. Previous device saves
are retained but are not imported as trusted ownership or currency. Development
funds enter an explicitly labeled temporary preview, never the account wallet.
Unsupported planning, group growth,
provider sessions, support delivery, account export and account deletion must not
show simulated success. Use the existing policy contact for manual data requests.

## Prototype parity and age visibility

`FRONTEND-PARITY-REPORT.md` records the screen comparisons and intentional service
differences. The approved initial release is 18+ across the app. Onboarding/profile
save reject under-18 birthdays; database writes enforce the same boundary. Saved
birthdate corrections require support. Presentation checks never replace backend
authorization. Do not weaken backend guards in a visual parity change.
