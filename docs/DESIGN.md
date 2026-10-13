# Pebble Design System

## Direction

Pebble is a friends-first college social app: find people, make a plan, meet in
person, build community. The visual direction is Forest-like calm minimalism
with Pebble's warm palette and illustrated characters. A focal visual, one
primary action, and generous space do more work than explanatory paragraphs.
This document reflects the October 2026 visual brief and supersedes the older
full-screen world on Home and permanently labelled navigation directions.

## Product structure

Five primary destinations remain Home, Matchmaking, Events, Messages, and
Profile. Community is a supporting route (`/community`) entered from Home;
Home remains active in primary navigation. Settings, free-time planning, and
onboarding remain supporting flows. Use real links for destinations.

- Home starts discovery: balance, interactive large Pebble with small person
  thought bubbles, “Who’s around?”, “Find people”, and a quiet downtime control.
  One Community icon sits in the upper-left product area; balance sits upper-right.
  No dashboard cards or duplicate Community/history entry.
- Community contains the diorama, weekly history, and existing local Build
  economy. The world does not fill Home or the browser.
- Matchmaking presents the current queue state or a candidate. Preserve real
  queue behavior, manual checking, profile gating, and error recovery.
- Events retains useful names, dates, places, categories, people, and filters.
- Messages retains its conversation, timestamps, plan and person context.
- Profile functionality and overall composition remain owned by its team.

## Shared palette and typography

The shared product palette lives on `:root` in `prototype.css`; `calm.css`
provides semantic aliases and focal sizing. Avoid another theme layer.

| Token | Value | Role |
| --- | --- | --- |
| `--pt-cream` | `#fffdf4` | Continuous ivory page and navigation |
| `--pt-surface` / `--pt-soft` | `#fffef9` / `#f4f9e8` | Neutral and light green surfaces |
| `--pt-ink` | `#1f5a3c` | Forest text and active icons |
| `--pt-muted` | `#587360` | Accessible muted forest text/icons |
| `--pt-green` / `--pt-leaf` | `#42783f` / `#4f8a4c` | Accessible filled controls / fresh nature accents |
| `--pt-fresh` | `#9bcb63` | Grass, highlights and progression |
| `--pt-pale` | `#eaf5d9` | Mint selection and quiet controls |
| `--pt-berry` / `--pt-berry-hover` | `#d93467` / `#be2857` | Social CTA / hover and press |
| `--pt-berry-soft` | `#f3a1b8` | Small pink accents |
| `--pt-line` / `--pt-green-line` | `#dddccb` / `#c5dcb6` | Neutral / soft green borders |
| `--pt-water` / `--pt-yellow` | `#78c7c4` / `#f1c85b` | Water / small warm accents |
| `--pt-sand` / `--pt-terracotta` | `#ead9b1` / `#c57657` | Paths / roof and warm objects |
| `--pt-cheek` / `--pt-stone-highlight` | `#e89a91` / `#f0e5c9` | Neutral mascot accents |
| `--pt-on-action` / `--pt-focus` | `#ffffff` / `#315f9b` | Filled-action text / keyboard focus |

`--pt-coral` remains a compatibility alias to berry. Feature namespaces for
Events and matching reference these tokens; Messages, Profile and Settings
inherit them. Keep stronger color for social CTAs, selections and nature details.
Messages bubbles stay soft green/mint. Do not restore per-screen color themes.
White on raspberry has 4.53:1 contrast; do not substitute off-white button text.
Leaf green is artwork/indicator color; filled green controls use the darker
`--pt-green` to preserve contrast for small white labels.

Retain the existing Trebuchet/Segoe UI application stack and rounded wordmark.
Use one concise heading or state on minimal screens. Do not stack a heading,
subtitle, and explanatory paragraph. Body text stays readable; responsive
scaling primarily changes visuals and spacing, not unlimited text sizes.
Controls use 14px radii; record/dialog surfaces use 18px. Cards are for distinct
records, not every group. Share semantic tokens in UI; placeholder artwork may
use its own controlled natural palette.

## Shell and responsive layout

The active shell is `src/features/prototype/AppShell.tsx`, wrapped by
`src/routes/PebbleApp.tsx`. The older design-system shell is not routed.

- Expanded (>800px): cream header, wordmark, centered icon navigation,
  account avatar at the right. No white strip or divider.
- Compact (<=800px): five-item bottom navigation with accessible names and
  native hover tooltips. Labels are visually hidden. Active tabs use a soft
  background plus a small dot; focus remains visible. A raspberry dot at the
  Messages icon's top right marks unread messages or connection requests.
- Navigation graphics are 25px inside approximately 48px targets; secondary
  icon controls use 24px graphics and 44–48px targets. Home Community and Community
  Build use `clamp(32px, 2.5vw, 36px)` graphics in 56px targets. Home currency
  uses the same icon size and `clamp(20px, 1.55vw, 22px)` text. Their existing
  toolbar footprint is preserved. Community has only the labelled back arrow,
  with no visible page title.
- Shell owns `--pt-gutter`, `--pt-navigation-height`, `--pt-safe-area-bottom`,
  `--pt-navigation-clearance`, and the visual `--pt-header-height`.
- Gutters, gaps and focal visuals scale with `clamp()`. No fixed-width app
  canvas. Long copy and individual records retain local readable widths.
- Home uses a viewport-height composition that can scroll on short screens.
  Its mascot scales with both viewport width and height.
- Community uses a scalable SVG scene up to 1600px wide, constrained by viewport
  height to reserve room for the weekly chart. Mobile uses a tighter scene.
- Messages uses fluid 26/48/26 desktop columns, independent pane scrolling,
  readable bubble widths, and a reachable composer. At 800px it becomes a
  routed inbox or chat. Preserve the existing Events wide preview behavior.

Verify 320px, tablet, 799/800/801px, 1280×720, 1440×900, 1920×1080,
2560×1440 and short screens. Space should support the focal point; do not fill
wide layouts with extra cards or copy. Decoration gives way to useful controls.

## Home and Community artwork

Use the supplied Happy/Thinking pixel PNGs through the shared `pebble-art`
components. Home uses one upright Pebble with its artwork's own grass; no second
ground patch. Matching uses Happy while idle and Thinking for its existing
searching/waiting state. Preserve aspect ratio and crisp pixel rendering.
Currency uses one shared PNG crop and 32–36px responsive icon size everywhere
a balance is shown. Home and Community share the same balance component and
20–22px number styling. Build uses the supplied hammer in its existing 56px
target; retain the simple SVG tree for Community.

Home's `AvailablePeoplePreview` shows at most three avatar/first-name thought
bubbles, or two at <=520px. Small green availability dots are presentation
indicators tied to the same temporary preview data, not a live presence signal. This is a Home content-density exception, not a
second shell breakpoint. Bubbles are asymmetric, small, and clear of the face,
controls and action. Clicking one reuses the existing sample-profile selection
and `/profile/person` route. `Find people` still enters `/matchmaking`.

Clicking the central semantic button fades the bubbles and shows the Thinking
PNG for a minimum of 1750ms, then returns to Happy. The visual timer runs in
parallel with the optional refresh adapter, so slow loading finishes without
an additional delay. Home currently supplies only the local preview data.
Repeated activation is guarded;
focus remains on the button. Reduced motion disables image fades while
retaining the state change. Each refresh advances through the local pool and
wraps after its end. No timer survives leaving Home.

`available-people-preview.ts` isolates temporary fictional preview data drawn
from existing sample profiles, excluding locally blocked people. The current
matchmaking API exposes a single candidate, not an available-user roster, so
Home does not infer presence from it. Replace this adapter when real available
users are supplied. No presence polling, backend contract or persistence is
introduced. Keep fixture disclosure in code and developer controls.

Community uses a shallow diamond slab with visible top and two side faces.
Objects remain upright, anchored by ground-contact coordinates, and render
back-to-front by depth. Each placement and artwork primitive can be replaced
independently. This is 2D composition, not a 3D engine.

The supplied village PNG is an art-direction reference, not a replacement for
the interactive scene. `CommunityAreas` keeps that village and its history in
the left panel and adds a horizontally scrollable museum on the right. An
icon-only control at the center-right screen edge uses a museum above a right
arrow to enter. In the museum, the return control moves to the center-left
edge, with the Home tree above a left arrow. Arrow keys also
move between panels. Build is available only in the village; currency stays
visible in both areas. Off-screen
content is inert and hidden from assistive technology.

The museum concept is reference-only. `GeologyMuseum` builds a mostly-white SVG
room with exactly 16 identical display cases in a wall-aligned 4×4 isometric
grid. Case steps are 86×43 SVG units along the isometric axes, using the room's
available width/depth without shrinking cases. The current prototype exhibit
fills all sixteen cases with four rows of four stages: Red Garnet (determined),
Blue Sapphire (wistful), Green Emerald (content), and Yellow Citrine (excited).
Each isometric row progresses left-to-right from colored cracks to emerging
crystal, revealed crystal, and an expressive final gem. `GemProgression.tsx`
provides simple editable pixel SVG sprites because the supplied sheets do not
include these four expressive families. The developer empty-state toggle still
clears all sixteen cases. This is fixed art-direction data, not chat activity,
relationship scores, or earned rewards.

The village and all Build previews share the artwork-only `village-art.css`
palette: muted sage grass, layered olive foliage, warm plaster and terracotta,
honey wood, and soft blue water. Tree silhouettes, wall shading, ground pixels,
and stream highlights follow `community/community-village.png`; the original
PNG is unchanged and the scene remains made of individually gated objects.

`community-history.ts` is an isolated UI-only fixture because the local economy
has balance, upgrades, and earned chapter IDs but no dated activity ledger.
Bars represent sample earned-Pebble activity. Day selection changes a 0–6
landscape/visitor stage: Sunday has only one centered Pebble on plain grass;
Monday adds the back tree, Tuesday the left tree, Wednesday the river, Thursday
the path/cottage, Friday the right tree/friend, and Saturday the front tree and
second friend. Owned upgrades join cumulatively in a fixed demo reveal order;
all appear by Saturday. This presentation order does not represent purchase
dates, earn currency, or change saved ownership. The fixture distinction is documented in developer
controls and `VISUAL-REVIEW.md`, without a visible “Demo history” label.

Build opens a native modal dialog with focus containment, Escape, focus return,
and scrolling. Purchases retain their existing prices, balance checks, reducer,
and local persistence. No new backend or storage schema.

## Matchmaking and service states

Minimal state structure: central visual or candidate, concise status, one
primary action, quiet supporting controls. Candidate portraits/avatars and up
to four shared interests are prominent. The current API returns suggestions;
do not invent acceptance, invitations, or conversations. **Connect** on a
candidate is the real exception: it sends a connection request, and acceptance
opens a direct chat (`docs/MESSAGING-M3.md`). While a candidate is shown,
Connect is the one primary action.

Checking for a match remains manual. The queue does not acquire new polling or
matching logic as part of visual work. Preferences retains all server fields;
local-only display preferences live in a disclosure with their limitations.
Signed-out matchmaking links to the existing login flow, or shows the small
“Sign-in unavailable” state when configuration is absent.

Events unavailable uses a large calendar icon, concise title, and Retry. Empty
filters have a clear next action. Never fabricate production event content.

## Developer controls

Development only. A small code tab in the top-left opens a fixed floating panel;
collapsed by default, it never reserves page space. Preserve scene selection,
empty-state toggle, demo funds, reset, and Intro replay. A click toggles it.
Keep prototype and fixture disclosures here, outside the normal composition.

## Accessibility and motion

Semantic links/buttons, accessible names for every icon control, title tooltips,
visible focus, readable contrast, and 44px touch targets. History buttons expose
selected state, date, metric and scene relationship. Dialogs must work on short
screens. Respect reduced motion. Use restrained state transitions; do not add
constant idle motion or effects to every element.

## Team boundaries

This visual pass does not change matchmaking algorithms/contracts, authentication
logic, database schemas, messaging APIs, deployment, Android, or Profile behavior.
The separate `/prototype/yzcommunity` experiment remains intact.
