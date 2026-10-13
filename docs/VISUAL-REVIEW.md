# Pebble visual review — October 12, 2026

The subsequent [fresh meadow polish](MEADOW-POLISH.md) updates the palette and
top control sizes described below. This document retains the earlier redesign
and Home-interaction review for context; `DESIGN.md` reflects the current palette.

## Home refinement

This pass preserves the existing Forest-inspired redesign and changes only Home
interaction, Home control placement, developer disclosure, tests and documentation.
Community, matching, Events, Messages and Profile implementation remain as they
were at the start of this refinement.

1. **Source and truth:** the current matchmaking frontend exposes a single
   suggested candidate, not a roster of available users. Home uses seven existing
   fictional sample profiles through `available-people-preview.ts`, excludes
   locally blocked profiles, and respects the developer empty-state toggle.
   This is demo presentation data, not live presence. It is disclosed in source
   and the developer panel, without demo wording in the product composition.
2. **Density:** at most two bubbles through 520px; at most three above 520px,
   including tablet and desktop. A smaller pool shows fewer people. The shell's
   800px navigation breakpoint remains unchanged.
3. **Refresh:** clicking or keyboard-activating Pebble fades the current bubbles,
   waits 1800ms, then advances by the visible count through the sample pool.
   People do not repeat before the pool wraps. The timer ref immediately guards
   rapid repeat activations; leaving Home clears it. No network calls or saved
   refresh state are introduced.
4. **Thinking:** existing neutral SVG expression, small dots and a subtle wobble;
   then the existing happy expression returns. Reduced motion removes movement
   and fades but retains the wait/state feedback. The semantic button retains
   focus, exposes its disabled state, and announces status. Fading profile
   buttons are inert and removed from the accessibility tree during the wait.
5. **Profiles and matching:** avatar/first-name bubbles use the existing person
   selection and `/profile/person` route. `Find people` still links to the real
   `/matchmaking` flow. No candidate, profile or presence contract was invented.
6. **Controls:** removed the duplicate Community/history link below Find people.
   Kept the distinct downtime link. The single Community tree icon sits upper-left
   in the product area, below/inward from the extreme-corner developer tab.
   Pebble currency sits upper-right. Signed-in notifications sit beside Community
   without colliding. Icon navigation and its focus/active states remain intact.
7. **Temporary art:** existing profile photos and the replaceable Pebble SVG remain.
   CSS supplies thought shapes/tails, ground, dots and brief motion. Later assets
   can supply happy, thinking, searching and match-found expressions with matching
   framing, plus the already planned individual Community objects. No art generated.

### Files changed in this refinement

- New: `src/features/prototype/AvailablePeoplePreview.tsx`,
  `src/features/prototype/available-people-preview.ts`,
  `src/features/prototype/home-preview.css`.
- Updated: `src/features/prototype/Home.tsx`, `src/features/prototype/calm.css`
  (Home notification position only), `src/routes/PebbleApp.tsx` (dev disclosure).
- Tests: new `tests/available-people-preview.test.ts` and
  `e2e/home-preview.spec.ts`; adjusted the Home mascot selector in
  `e2e/calm-design.spec.ts`.
- Documentation: `docs/DESIGN.md`, `docs/UI-PLAN.md`, this report.

The broader file list below includes the preceding redesign already present
when this refinement started; those changes were preserved.

### Validation

- `pnpm lint`: passed.
- `pnpm test`: 29 files, 148 tests passed.
- `pnpm build`: passed web and API compilation; existing large-JS-chunk advisory.
- `pnpm exec playwright test e2e/home-preview.spec.ts e2e/calm-design.spec.ts
  e2e/responsive.spec.ts --workers=3 --reporter=line`: all 28 passed. The initial
  Home run found a 320px notification/Community overlap; the corrected placement
  passed the complete rerun.
- `git diff --check`: passed.
- Visual inspection: 320×480 and 390×844 phones, 1280×720, 1920×1080,
  2560×1440. Home screenshots: `/tmp/pebble-home-review/`.
- Home browser checks cover 520/521 density resizing, tablet, avatar/face/control
  collision geometry, touch targets, horizontal overflow, bottom-navigation
  clearance for the primary action, profile and matching routes, 1800ms timing,
  repeat activation, focus, reduced motion, empty data and unmount cleanup.
- At 320×480, the secondary downtime control is reachable by scrolling; the
  primary Find people action is visible above bottom navigation without scrolling.
- Before/after Community comparison at 1440×900: the scene and chart are
  unchanged; the only pixel difference is a tiny header wordmark region.

## Implemented direction

Forest-like calm composition using Pebble's existing cream, sage, muted green,
terracotta, mascot and pixel artwork. Home and matching are focal compositions;
Events and Messages retain the information their tasks require.

1. **Shell:** one cream surface; header white fill and divider removed.
2. **Navigation:** four desktop destination icons with an account avatar;
   five compact bottom-navigation icons. Graphics are 25px with 44–52px targets,
   accessible names, title tooltips, focus rings, and active background/dot.
3. **Developer tab:** fixed top-left code tab, collapsed initially, development
   only. Toggles all existing controls without reserving layout space.
4. **Home:** one central mascot, “Who’s around?”, “Find people”, small balance,
   Community entry, and a quiet downtime control. The Home refinement below
   adds person previews and removes the duplicate history entry. No dashboard cards.
5. **Home scaling:** mascot grows using width/height-aware `clamp()` (about
   266px nominal at 1280×720 and 533px at 2560×1440). Short phones reduce art
   and gaps and retain scrolling and bottom-navigation clearance.
6. **Community camera:** separate `/community` route. A 2:1 diamond ground plane
   with visible front/side thickness gives an angled diorama composition.
7. **Depth:** upright artwork uses ground-contact coordinates and paints in
   increasing depth order. The SVG scales as a unit without stretching.
8. **History:** seven selectable daily bars, selected outline/color, accessible
   date/activity values, and previous/next controls across four weeks. Selection
   changes landscape and visitor growth stages 0–3. Starts on the last complete
   Sunday–Saturday week; dates follow the viewer's calendar.
9. **Data:** history is an isolated UI fixture, not real participation data.
   The existing economy has no dated ledger. History neither grants nor spends
   Pebbles. Saved local upgrades remain visible across selections; the fixture
   does not pretend to know historical purchase dates. Disclosure is in developer
   controls and source, with no visible “Demo history” label.
10. **Build:** hammer control opens a native modal drawer. Existing ten upgrades,
    prices, affordability checks, balance, reset and local persistence are kept.
    Escape returns focus; the list scrolls independently.
11. **Matching:** central idle/searching visual or candidate avatar, short state,
    primary queue/check action, quiet cancel/refresh/preferences/mode controls.
    Device-only preferences are preserved in a disclosure. Candidate context
    includes up to four interests, overlap and available meetup details. The
    current API only offers suggestions, so no Accept or chat action is invented.
    Manual checking and all queue/profile behavior remain intact.
12. **Signed out:** short sign-in composition routes to existing login and preserves
    the return destination. Missing configuration shows “Sign-in unavailable”.
13. **Events:** concise title, filters, icon location control; large calendar icon,
    “Events unavailable”, and Retry. Real event records, categories, time, place,
    people, pagination, detail routes, group queues and wide preview remain.
14. **Messages:** existing 26/48/26 fluid panes and readable bubble widths retained;
    gutter between panes now grows with viewport width. Shared shell/icon changes
    apply. No message functionality or useful copy was removed.
15. **Large displays:** Home, matching and Community visuals grow; Community's
    height constraint reserves room for the chart. Events keeps intrinsic grids
    and its existing wide-screen detail preview. No extra dashboard content.
16. **Mobile/tablet:** one 800px shell breakpoint, bottom navigation, short-screen
    adjustments, wide daily touch targets, compact scene, and scrolling dialogs.
17. **Tokens/components:** shared `calm.css` uses existing `--pt-*` palette plus
    semantic aliases, focus, radius, control and focal-size tokens. Home/balance,
    Community history and its data adapter are separate modules. Existing SVG
    icon registry gains home, build, refresh, history and code glyphs.
18. **Accessibility/motion:** keyboard day selection, selected-state semantics,
    native Build dialog focus containment, focus return, reduced-motion rules,
    native icon tooltips and larger targets. Search adds only a subtle companion
    fade; changing the scene uses a brief reveal.
19. **Temporary:** history samples, reused frontal pixel buildings/trees, geometric
    terrain and smooth Home mascot. Final art will unify the two visual styles.
    Local economy remains a prototype; live service configuration is untouched.
20. **Boundaries:** no backend/API contracts, schema, deployment, authentication
    implementation, messaging implementation, Profile behavior or Android work
    changed. No commit or push.

## Files

- Routing/shell: `src/App.tsx`, `src/routes/PebbleApp.tsx`,
  `src/features/prototype/AppShell.tsx`, `model.ts`, `ui.tsx`.
- Home/Community: `src/features/prototype/Home.tsx`, `PebbleGarden.tsx`,
  `CommunityWorld.tsx`, `CommunityHistory.tsx`, `community-history.ts`,
  `calm.css`, `responsive.css`, `prototype.css` (accessible terracotta action token).
- Matching: `src/features/matchmaking/MatchingScreen.tsx`,
  `src/features/prototype/matchmaking.css`.
- Events/Messages: `src/features/events/Browse.tsx`, `events.css`,
  `src/features/prototype/messages.css`.
- Tests: new `e2e/calm-design.spec.ts`; updated app, community, events,
  matchmaking, prototype, prototype-community and responsive browser specs;
  `tests/routes.test.tsx`, `tests/matchmaking-integrated.test.tsx`.
- Documentation: `docs/DESIGN.md`, `docs/UI-PLAN.md`, this report.

## Artwork to generate next

Use one consistent soft pixel/illustrated language, warm natural colors, light
from upper left, and transparent PNG or lossless WebP. No text, UI, background
sky, or baked scene around individual objects. Preserve a small consistent
transparent margin and document each object's bottom-center contact point.
Community art should use a three-quarter orthographic view: 45° horizontal
rotation, approximately 30° downward camera angle, vertical objects, no
perspective vanishing point. The current terrain uses classic 2:1 ground axes.

| Suggested asset | Source size | Perspective and role |
| --- | --- | --- |
| `pebble-happy`, `pebble-thinking`, `pebble-searching`, `pebble-match-found` | 1024×1024 each | Large friendly front/very slight three-quarter mascot, same framing and baseline; Home and matching states. Single character per file. Match-found requires real result state. |
| `pebbles-together` | 1536×1024 | Two or three consistent mascots, front/slight three-quarter, transparent; future confirmed-connection visual, only when supported by real state. |
| `community-terrain` | 2048×1280 | Empty diamond terrain slab, three-quarter 2:1 view, visible left/right soil edges. No buildings or trees; the replaceable ground layer. |
| `community-path`, `community-stream` | 1024×640 each | Separate transparent ground overlays using identical 2:1 projection; optional so placement remains flexible. |
| `tree-sage`, `tree-deep-green`, `tree-small` | 512×768 each | Upright three-quarter trees with visible canopy top; same camera and contact baseline. Back/middle/front landscaping. |
| `cottage-base` | 1024×1024 | Roof top plus front and right side visible, upright walls, terracotta roof. First growth landmark. |
| `pebble-community-01`, `02`, `03` | 512×512 each | Small three-quarter standing characters, distinct expressions, same baseline. Independent visitor placement. |
| `upgrade-flowers` | 512×384 | Low patch on diamond ground, transparent edge; first decoration. |
| `upgrade-bench` | 768×512 | Three-quarter bench, empty; ground-contact legs. |
| `upgrade-lantern` | 384×768 | One standing lantern; duplicate in layout, avoid baking a row. |
| `upgrade-picnic` | 768×768 | Three-quarter picnic table/blanket grouping on transparent ground. |
| `upgrade-bridge` | 768×512 | Bridge aligned to a ground axis, transparent underneath for stream overlap. |
| `upgrade-garden` | 768×768 | Three-quarter raised beds, low plants; compact grouping. |
| `upgrade-cafe` | 768×768 | Café cart with awning, two sides visible; no text/sign lettering. |
| `upgrade-stage` | 1024×768 | Low music platform, upright posts, visible stage top and sides. |
| `upgrade-cottage` | 1024×1024 | Small cottage expansion using the base cottage's camera and materials. |
| `upgrade-hall` | 1024×1024 | Larger community building, same camera; final upgrade landmark. |

Keep object shadows subtle and separate where possible. Ground-contact shadows
can be rendered by the scene so art remains reusable. No event artwork is
required for this pass: keep real listing photos and the existing fallback.
