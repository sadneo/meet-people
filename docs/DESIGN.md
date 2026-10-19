# Pebble Design System

## Direction

Pebble is a friends-first college social app: find people, make a plan, meet in
person, build community. The visual direction is Forest-like calm minimalism
with Pebble's warm palette and illustrated characters. A focal visual, one
primary action, and generous space do more work than explanatory paragraphs.
This document reflects the October 2026 visual brief and supersedes the older
full-screen world on Home and permanently labelled navigation directions.

## Product structure

Signed-out `/` is the public marketing page; signed-in `/` remains Home.
Explore events links to the existing app Events route without changing its shell.
Terms, Privacy and Cookie drafts stay reachable without account/onboarding gates.
Public pages reuse the palette, typography and 800px breakpoint below, with
marketing compositions rather than the signed-in icon navigation. See
`PUBLIC-FRONTEND.md` for the route boundary, design and integration notes.

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
| `--pt-cream` | `#DDCABC` | Continuous warm tan page and navigation |
| `--pt-surface` / `--pt-soft` | `#fffef9` / `#f4f9e8` | Neutral and light green surfaces |
| `--pt-ink` | `#1f5a3c` | Forest text and active icons |
| `--pt-muted` | `#425b49` | Muted forest text/icons (4.69:1 on tan) |
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

- Expanded (>800px): tan header, wordmark, centered icon navigation,
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
  readable bubble widths, and a reachable composer. The details column appears
  only with content: Participants for conversations of more than two people, or
  a local demo plan. Otherwise the conversation fills it (26/74). At 800px it becomes a
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

Community uses the supplied raster village art family on the square isometric
platform. `village-landscape.png` removes the movable cottage, bench and Pebbles
from the reference; `village-props.png` supplies their independent sprites.
Trees, river, terrain, rocks and wild landscape remain fixed. Build's compact
Landscape section sells the river, four-tree cluster, walkway, flower meadow,
shrubs, rock formation and grass details using original landscape pixels in
predetermined positions. These purchases use the existing local economy and
refund receipts but never enter the draggable-object or saved-position system.
Reset removes purchased landscape along with objects, restoring plain grass
and one Pebble. The demo history progression is independent of these purchases. All
history stages clip their terrain to one island silhouette and share the
original `community-village.png` shadow. Generated PNG shadows must never stack
under the shared shadow. Sunday remains one centered Pebble on plain grass.

There is no user-facing Museum or area navigation. Its unused components/assets
are retained for possible future reuse; Community does not import them.

Saturday is the editable current village; other days are read-only growth
snapshots. Drag placed decorations, structures and Pebbles with mouse, pen or
touch; arrow keys move a focused item. Ground-contact positions snap to a loose
12px grid and stay on the inset island, clear of water and tree trunks (the
footbridge may cross water). Objects and permanent tree overlays sort by ground
depth. Escape/cancel discards an in-progress drag. Position updates use the
existing local Community reducer/save, not a server or database. Reset clears
positions as well as purchases. Old saves without positions remain valid.

Garnet (determined), Sapphire (wistful), Emerald (content), and Citrine (excited)
are rare expressive geological Pebbles. `expressive-pebbles.png` uses the same
soft pixel outline, face, cheeks and squat shape as the mascot. Each costs 300
Pebbles, above the normal catalog's 10–120. The existing Build dialog handles
affordability, single ownership and currency deduction. Buying selects Saturday
and places the item at a default position ready to drag. There is no additional
currency, museum progression or backend dependency.

`community-history.ts` is an isolated UI-only fixture because the local economy
has balance, upgrades, and earned chapter IDs but no dated activity ledger.
Bars represent sample earned-Pebble activity. Day selection changes a 0–6
landscape/visitor stage: Sunday has only one centered Pebble on plain grass;
Monday adds the back tree, Tuesday the left tree, Wednesday the river, Thursday
the path/cottage, Friday the right tree/friend, and Saturday the front tree and
second friend. Owned upgrades join cumulatively in a fixed demo reveal order;
all appear by Saturday; rare Pebbles appear only then. This presentation order does not represent purchase
dates, earn currency, or change saved ownership. The fixture distinction is documented in developer
controls and `VISUAL-REVIEW.md`, without a visible “Demo history” label.

Build opens a native modal dialog with focus containment, Escape, focus return,
and scrolling. The same catalog appears in two labelled sections: Rare Finds
first, then Village Decorations. All four 300-Pebble rocks remain listed regardless
of affordability/ownership; only their purchase buttons change state. Header and
secondary Reset purchases footer stay visible while the catalog scrolls. The
right drawer is 360px on desktop, inset 12px, with a 94% light surface, restrained
blur/shadow and a very light backdrop. Mobile uses up to 340px, leaving an outer
gap. Item cards show image, short name, price and Build/Owned state only.

Reset purchases requires a native confirmation dialog with Cancel focused first.
It refunds each owned Build item once, clears ownership, purchase receipts and
all Community object positions, and restores the current village to one centered
Pebble on the same plain-grass platform as Sunday. Earned chapters and unrelated
app state are preserved. The local `freshStart` flag survives reload; purchases
then appear on the empty platform without restoring the developed base. Historical
day selection still renders the existing 0–6 progression. Reset is available even
without purchases when the current base is developed. Confirmation says “Reset
your entire Pebble Community?” and “Reset everything”, explicitly showing the
refund. Confirming closes Build so the restored scene is immediately visible. New purchases record the deducted price in optional local
`purchaseCosts`. Older ownership-only saves use the unchanged catalog prices.
Refunds are not capped by the demo funding limit. The existing local storage key
and reducer persist everything; no backend/database schema change.

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
screens. Respect reduced motion. Community uses visible downstream river streaks,
ground-anchored Pebble breathing and a soft 4.5s lantern glow. Pebbles hold three
pixelated poses (normal, compressed, stretched) in independently painted,
integer-sized SVG viewports. Only visibility changes with `steps(1, end)`;
never tween SVG dimensions or interpolate raster scale/rotation: these
compositor transforms blur the pixel edges. The center and bottom anchor stay
fixed in every pose; maximum width/height changes are 4/3 SVG units. Stagger
normal Pebbles and give rare rocks individual 9–14s rhythms and pose sizes
matching their painted personalities. Current PNGs have no blink frames or separate facial layers;
preserve their existing expressions. Animate the inner sprite;
the outer group owns drag position. Buildings, paths, trunks and the island stay still.
Trees have small inset canopy patches switching between integer horizontal
offsets; three grass-tip patches use the same quiet, staggered breeze. Fixed
masks preserve the baked landscape silhouettes without shifting the platform.
Home's happy Pebble uses three separately painted integer-sized poses on a
12-second stepped cycle, with less than 1% size variation and a fixed bottom
anchor. The existing thinking sprite replaces these poses during refresh.
Disable these decorative loops under `prefers-reduced-motion: reduce`.

## Team boundaries

This visual pass does not change matchmaking algorithms/contracts, authentication
logic, database schemas, messaging APIs, deployment, Android, or Profile behavior.
The separate `/prototype/yzcommunity` experiment remains intact.
