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
full-screen sheets; desktop retains centered dialogs.

Matches & Plans has Upcoming, Connections and Past tabs. Populate these only
from supported services; unsupported plan history must not become sample history.
Messages uses inbox/chat columns on desktop and a single selected pane on mobile.
The message history scrolls independently of its composer. Forms must fit 320px,
short screens, large text and the bottom safe area. Dialogs scroll internally and
support Escape, focus containment and focus return. Keep visible keyboard focus,
44px controls and reduced-motion behavior.

## Real data and service states

Supabase owns authentication. Existing Express `/api` contracts own account,
preferences, matching, events, connections, messages, photos and safety receipts.
Do not turn fixtures into apparently real people, notifications or saved settings.
Loading, empty, unavailable, conflict and unconfirmed-write states stay distinct.
A failed write never establishes success. Versioned resources retain their existing
revision checks and explicit reconciliation requirements.

Friends uses a manual queue check and at most one candidate. Starting active
Friends matching requires confirmation before replacing downtime. Dating has its
own explicit participation action and preference resource. Saving a Dating draft
does not enable participation. Device location requires an explicit action;
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
The collection card shows actual local unlocks rather than simulated weekly totals.

Garden remains a local creative scene. It does not claim real meetings, attendance,
account rewards or another person’s garden history. Its local balance, purchases
and unique Mystery Geode unlocks persist in this browser, keyed to the signed-in
account; they are not synchronized to the server. New gardens start with a blank
green platform and one Pebble. Landscape placement stays fixed; decorations can
be dragged. Reset returns unlocked Geode rocks to free inventory without refunding
their unlock cost or rerolling ownership. Test currency is development-only.
Unsupported planning, group growth,
provider sessions, support delivery, account export and account deletion must not
show simulated success. Use the existing policy contact for manual data requests.

## Prototype parity and age visibility

`FRONTEND-PARITY-REPORT.md` records the screen comparisons and intentional service
differences. The frontend rejects under-13 birthdays on onboarding/profile save and
hides Dating UI below 18. These are presentation/admission checks, not server-side
security. The Friends backend currently has an 18+ restriction that still needs a
team decision against the retained 13+ policy. Do not weaken backend guards in a
visual parity change.
