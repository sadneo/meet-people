# Pebble UI Plan

## Goal

Maintain a mobile-first, authenticated student-focused, platonic social app.
Its supporting prototype flows demonstrate world progression, matching, events, planning,
conversations, and profile preferences. Home and Community fixtures are documented
in source and developer controls without demo labels in their minimal product UI.
Most flows remain local previews. Active/downtime matching and email-link
sign-in now use the backend slice described in `docs/matchmaking-backend.md`;
SQL activation is separate. Chat/planning remain prototypes.
Imported event detail/preview use a server-backed group queue and persistent
in-app proposal inbox; see `docs/event-group-queue.md` for the proposed parent SQL
contracts and disabled worker. No Company/compatibility consent is reused.
`docs/DESIGN.md` is the product-design authority. The fresh meadow palette is
shared across routed screens; this color update preserves their layouts.

## Information Architecture

| Route | Purpose |
| --- | --- |
| `/` | Minimal Pebble focal composition and discovery entry |
| `/community` | Village and weekly activity, balance/upgrades, local drag placement |
| `/matchmaking` | Authenticated active queue, single-person result and profile preferences |
| `/downtime-matchmaking` | Authenticated Friends compatibility destination to Settings; inactive Dating view remains available |
| `/events` | Browse sample events |
| `/events/detail` | Event details and demo event-group formation |
| `/events/:listingId` | Imported-event detail and authenticated group queue (SQL activation separate) |
| `/messages` | Conversation inbox |
| `/messages/chat` | Selected conversation |
| `/profile` | Current student profile |
| `/profile/person` | Another sample student's profile |
| `/settings` | Account preferences and real authenticated downtime opt-in |
| `/free-time` and nested routes | Availability, people, activities, planning, review, confirmation, and connection |
| `/intro` | Protected supporting introduction after readiness |
| `/onboarding` | Required real identity, interests, birthdate/area and availability before private context |
| `/login`, `/register`, `/auth/callback`, `/auth/forgot-password` | Public sign-in/verification/recovery entry only |
| `/complete-profile` | Signed-in legacy redirect to `/onboarding`, preserving validated return destination |
| `*` | Protected not-found experience |

Home, Matchmaking, Events, Messages, and Profile are the five icon-first navigation
destinations. Community is a supporting route entered from Home. Settings appears in desktop account navigation and is reachable
from Profile on compact screens. Free-time and planning screens are supporting
flows. `/prototype/yzcommunity` remains a separate experimental screen.

### Required access boundary

There is **no signed-out app preview**. Every product route, experiment, supporting
flow and unknown route waits for session hydration outside the private shell and
prototype context. Signed-out users are redirected to Login with a validated
internal return destination. Signed-in users need persisted canonical identity and
matching preferences: at least three unique interests, valid birthdate, nonempty
city/campus area and one availability window. Null/partial accounts resume real
`/onboarding`; ready accounts skip it on later login/refresh. Read failures block
with retry/logout. This supersedes identity-only/optional-preferences access.
Shared forms use no invented defaults; save/readback must confirm readiness.
Uncertain writes require explicit read-only reconciliation, never auto-resubmission.
Profile/matching editing preserves minimum requirements. There is no automatic queue,
Dating activation or extra photo/group/distance requirement. Public sign-in and
callback pages retain their verified completion lifecycle. See
[`app-access.md`](app-access.md) for the state machine, safety limits and tests.
The DEV loopback one-click account option authenticates only an already populated
operator-owned local account; no anonymous session, seeding, credential bundle or
production endpoint exists. See [`development-onboarding.md`](development-onboarding.md)
for the fixed server-only file contract and unresolved provisioning/provider blocker.

## Responsive Layout

Use one app-wide width breakpoint:

- **Compact: <=800px.** Hide the desktop header; show the five-item bottom
  navigation. Use 20px page gutters, single-pane messaging, stacked profile,
  planning, onboarding, and matching sections, full-width matching actions,
  and a preferences bottom sheet.
- **Expanded: >800px.** Use a viewport-wide shell with desktop primary and
  account navigation. Show inbox, conversation, and profile/plan context together; use side-by-side
  utility layouts and fluid event grids. Keep text and individual records
  readable with local maximum widths.

Switch these structures together, including when resizing an existing page.
Do not add additional app-wide layout modes. Home has an explicitly scoped
<=520px content-density exception for two thought bubbles instead of three;
navigation and all other shell behavior still switch at 800px. Use intrinsic
grids and fluid dimensions within each mode. Event selection always navigates
to `/events/detail`, including on wide desktops.

The shell owns gutters, bottom-navigation height, safe-area allowance, and
content clearance. Derive page padding, Home overlays, upgrade-list padding,
and preferences-sheet positioning from the same CSS variables. The compact
bar is 72px plus the bottom safe area. Immersive routes have no navigation and
reserve no navigation clearance.

Messaging fills the available viewport and scrolls its inbox or message pane
without pushing the composer behind navigation. Dialog bodies scroll on
short screens. Preserve readable functional text and 44px controls; shrink
decoration before useful content. Reduced-motion and short-height adjustments
are independent of the single width breakpoint.

## Implementation Shape

- `src/App.tsx`: routes and shared messaging workspace.
- `src/routes/PebbleApp.tsx`: prototype state, scene wrapper, CSS imports,
  development controls, and immersive layout.
- `src/features/prototype/AppShell.tsx`: desktop and compact icon navigation.
- `src/features/prototype/Home.tsx`: responsive discovery focal composition.
- `src/features/prototype/AvailablePeoplePreview.tsx`, `available-people-preview.ts`,
  and `home-preview.css`: local avatar/thought-bubble preview, isolated fictional
  profile adapter, accessible 1750ms minimum refresh and Home-only positioning. These do
  not query matchmaking or implement presence.
- `src/features/prototype/PebbleGarden.tsx`: Community route and Build dialog.
- `src/features/prototype/CommunityWorld.tsx`: raster village, shared platform shadow,
  fixed landscape, depth-sorted mouse/touch/keyboard placement and sprite previews.
- `src/features/prototype/community-placement.ts`: ground bounds, snapping and
  validated local position data; `economy.ts` includes four 300-Pebble collectibles.
- `src/features/pebble-art/`: supplied pixel art and shared character/currency crops.
- Museum components and assets are unused; no Museum is mounted in the app.
- `src/features/prototype/CommunityHistory.tsx` and `community-history.ts`: interactive
  weekly chart and isolated UI fixture (no dated activity ledger exists).
- `src/features/prototype/calm.css`: shared visual refinement and focal scaling.
- `src/features/prototype/prototype.css`: base components and compact styles.
- `src/features/prototype/responsive.css`: shared shell variables and
  responsive workspaces.
- `src/features/prototype/matchmaking.css` and `downtime-matchmaking.css`:
  matching panels and sheets using the same 800px boundary.
- `src/features/prototype/messages.css`: the three-pane desktop Messages
  reference, with independently scrolling panes and compact inbox/chat routes.
- `src/features/prototype/messaging.ts`: explicitly fictional conversation
  previews and timestamped message samples.

Reuse existing controls and semantic classes. Do not introduce another shell,
responsive JavaScript state store, styling framework, or token system. The
older `src/design-system/AppShell.tsx` is not used by the current routes.

## Verification

1. Cover product routes and core matching/planning interactions.
2. Verify layout at 320, 390, 799, 800, 801, 1280, and 1800px widths.
3. Check navigation, event grids, messaging panes, stacked utility layouts,
   and preferences sheets across the exact breakpoint.
4. Check short viewports, safe-area clearance, keyboard navigation, touch
   targets, and horizontal overflow.
5. Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, and relevant
   browser tests.
