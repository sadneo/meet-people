# Pebble design system

## Current frontend (wiring branch, October 27, 2026)

The alternate Pebble frontend from `alt-frontend` is now the application’s design
reference and default entry. Its styles and garden renderer live in `src/ui/`;
its assets live in `public/pebble/`. The old prototype, design-system shell,
route screens and standalone `src/alt` demo have been removed. This document
supersedes their earlier design directions. Product UI changes must follow it.

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
Compact screens reach Activity from Messages and settings categories directly on Profile, without
an extra floating text toolbar over the page. Destination controls
are real links and expose accessible names and current-page state.

Profile and its settings sections use the demo’s focused 760px account layout.
Profile opens with saved summaries, one Edit profile entry and the five account
settings category rows, without a gear or separate Settings hub. Each settings
section has a back link to Profile; the editor retains its tabs. Mobile profile
Save/Cancel stays above bottom navigation.
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

Friends and Dating use passive individual discovery. Active group matching lives
in Messages and requires its own queue consent and proposal acceptance. Dating has
its own explicit participation action and preference resource. Saving a Dating draft
does not enable participation. Device location requires an explicit action;
Profile home and per-mode search areas stay separate. Interests and weekly
availability use one canonical Profile resource.

Dating targets derive from clear gender/sexuality labels with reciprocal checks;
only ambiguous/nonbinary combinations require clarification. Interests are capped
at five, with at least three provided choices and at most two custom labels.
Avoid persistent explanatory microcopy when labels suffice; show errors and required
clarification only when relevant. Availability From/Until fields share a row on mobile.

Search area uses one summary row and a Google map picker subview, full-screen on
mobile. Search neighborhoods, optionally center with device location, then move the
map beneath a fixed pin and explicitly confirm. No Home/Temporary selector, GPS on
mount, background tracking, or public people/pins map. Keep map attribution visible;
opening and canceling never change saved preferences. Missing configuration shows
an unavailable state, never a synthetic production map.

Garden remains a local creative scene. It does not claim real meetings, attendance,
account rewards or another person’s garden history. Its local balance and
purchases reset on refresh or sign-out. Unsupported planning, group growth,
provider sessions, support delivery, account export and account deletion must not
show simulated success. Use the existing policy contact for manual data requests.
