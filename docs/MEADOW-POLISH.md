# Fresh meadow polish — October 12, 2026

The four requested changes are implemented on top of the existing UI. Home's
focal composition, thought-bubble placement, Community geometry, history layout,
navigation and routes remain. No backend or economy behavior changed. No new
image assets, commit or push.

## Controls

| Control | Before | After |
| --- | --- | --- |
| Home Community icon | 24px | `clamp(32px, 2.5vw, 36px)` |
| Home Community target | 48×48px | 56×56px |
| Home currency icon | 29px | Same 32–36px icon scale |
| Home currency number | 17px | `clamp(20px, 1.55vw, 22px)` |
| Home currency area | Content height | Minimum 48px tall; remains a read-only display |
| Community Build icon | 24px | Same 32–36px icon scale |
| Community Build target | 48×48px desktop; 44×48px compact | 56×56px |

Icons measure 32px at 390px and 1280px widths, and 36px at 1920px and 2560px.
Currency text measures 20px and 22px respectively. Margins retain the existing
48px toolbar footprint. The Home control stays below the DEV tab; Build stays
upper-right with a mint surface, forest icon and subtle border/shadow.

Removed the visible Community heading. The back arrow retains “Back to Home”
as its accessible name and tooltip. Community and Build retain their existing
accessible names, tooltips, focus states and actions.

## Colors

The canonical tokens are in `src/features/prototype/prototype.css`, documented
in `docs/DESIGN.md`. Route-specific palettes now inherit or alias them.

- Ivory `#FFFDF4`, neutral surface `#FFFEF9`, light green surface `#F4F9E8`.
- Forest text/icons `#1F5A3C`, muted forest `#587360`.
- Leaf `#4F8A4C`, fresh green `#9BCB63`, mint selection `#EAF5D9`.
- Filled green controls use `#42783F` for small white-label contrast.
- Social CTA **`#D93467`**, hover/press **`#BE2857`**, white text `#FFFFFF`.
  Existing `--pt-coral` aliases berry for compatibility.
- Neutral border `#DDDCCB`, green border `#C5DCB6`, soft pink `#F3A1B8`,
  aqua `#78C7C4`, yellow `#F1C85B`, sand `#EAD9B1`, roof `#C57657`.
- Cheeks `#E89A91`, stone highlight `#F0E5C9`; mascot bodies stay neutral.

Home uses green thought outlines and tiny green availability dots tied to the
existing fictional preview. The currency mascot uses a mint body/forest outline;
the main mascot stays stone. Find people is the dominant raspberry accent.

Community grass is fresh green, trees use coordinated leaf/green highlights,
water is aqua, paths sandy cream, roof warmer terracotta, flowers restrained
white/yellow/coral/pink. Every SVG path and placement is preserved. History bars
mix mint toward leaf green as activity increases (20–80% leaf); selected bars
use forest green and retain their outline and selected-state semantics.

Navigation uses muted forest icons and mint active surfaces. Events filters,
chips, borders and hover states inherit the palette. Matching actions use
raspberry/white and darker hover states. Messages incoming/outgoing bubbles use
light green/mint with dark text; they are not pink. Profile and Settings inherit
shared colors without structural changes.

## Contrast and validation

Calculated sRGB contrast: raspberry/white 4.53:1; hover/white 5.78:1;
forest/ivory 7.97:1; thought names/neutral surface 8.04:1; forest/mint controls
and selected navigation 7.18:1; graph muted labels/ivory 5.11:1;
muted labels/mint 4.60:1; white/filled green 5.26:1.

- `pnpm lint`: passed.
- `pnpm test`: all 148 tests in 29 files passed.
- `pnpm build`: passed typecheck, web build and API compilation. Existing
  large-bundle advisory remains.
- `pnpm exec playwright test --workers=3 --reporter=line`: 86 of 88 passed.
  Two dropdown checks expected the old surface color; after updating that
  expectation, both passed in the targeted rerun. All 88 cases passed across
  those runs, including matching, economy, responsive layouts and navigation.
- `git diff --check`: passed.
- Visual review: Home at phone, 1280×720 and 2560×1440; Community at phone and
  1440×900; Messages, Profile, Events and matching. Rendered size/color inspection
  additionally verified 1920×1080. Browser screenshots are under
  `/tmp/pebble-home-review/` and `/tmp/pebble-review/`.
- The first browser run detected the larger Home target touching the DEV tab
  on compact screens; the margin correction keeps them separate.

## Files in this polish pass

- `src/features/prototype/prototype.css`, `calm.css`: canonical palette, shared
  colors and enlarged top controls.
- `Home.tsx`, `PebbleGarden.tsx`: control hooks and title removal.
- `AvailablePeoplePreview.tsx`, `home-preview.css`: availability dots and borders.
- `CommunityWorld.tsx`, `ui.tsx`: existing artwork color-token references.
- `CommunityHistory.tsx`: activity-dependent bar color strength only.
- `matchmaking.css`, `downtime-matchmaking.css`, `messages.css`, `profile.css`,
  `settings.css`: palette inheritance and color-only updates.
- `src/features/events/events.css`, `src/routes/events-layout.css`: shared palette.
- `tests/routes.test.tsx`: checks the labelled back control instead of the removed title.
- `e2e/app.spec.ts`: updated the dropdown surface-color expectation.
- `docs/DESIGN.md`, `docs/UI-PLAN.md`, `docs/VISUAL-REVIEW.md`, this report.

Prototype filenames above are relative to `src/features/prototype/` unless
otherwise qualified. Earlier uncommitted redesign changes remain in the checkout.
