# Pebble UI Plan

## Goal

Maintain a mobile-first visual prototype for a student-focused, platonic
social app. It demonstrates world progression, matching, events, planning,
conversations, and profile preferences with explicitly labelled demo data.
These flows do not connect to live matching, registration, chat, or account
services. `docs/DESIGN.md` is the product-design authority.

## Information Architecture

| Route | Purpose |
| --- | --- |
| `/` | Pebble community world, balance, upgrades, and matching entry points |
| `/matchmaking` | Event matchmaking and preferences |
| `/downtime-matchmaking` | Downtime matching and preferences |
| `/events` | Browse sample events |
| `/events/detail` | Event details and demo event-group formation |
| `/messages` | Conversation inbox |
| `/messages/chat` | Selected conversation |
| `/profile` | Current student profile |
| `/profile/person` | Another sample student's profile |
| `/settings` | Local prototype and account preferences |
| `/free-time` and nested routes | Availability, people, activities, planning, review, confirmation, and connection |
| `/intro`, `/login`, `/register`, `/onboarding` | Immersive introduction and demo account setup |
| `*` | Not-found experience |

Home, Matchmaking, Events, Messages, and Profile are the five navigation
destinations. Settings appears in desktop account navigation and is reachable
from Profile on compact screens. Free-time and planning screens are supporting
flows. `/prototype/yzcommunity` remains a separate experimental screen.

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
Do not add 520px, 620px, 900px, or wide-screen layout modes. Use intrinsic
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
- `src/features/prototype/AppShell.tsx`: desktop and compact navigation.
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
