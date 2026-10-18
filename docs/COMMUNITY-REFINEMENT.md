# Community refinement

The Museum panels, controls and exhibit are disconnected from `PebbleGarden`.
Unused Museum components and art remain available for reuse. No Museum route was
registered, and no Museum navigation remains in the current app flow.

The earlier days used `village-empty.png`, whose generated baked shadow differed
from the reference used Saturday. Now both terrain variants are clipped to the
same island silhouette, and every day uses the same original PNG shadow, once.

Saturday supports mouse, touch/pen and keyboard placement. Earlier days remain
read-only demo snapshots; buying selects Saturday. Movable objects: all owned
upgrades, the cottage, bench, three freestanding Pebbles and the four rare
geological Pebbles. Fixed: ground, river, permanent trees, landscape rocks,
wildflowers and other baked landscape. The bench's seated Pebbles travel with it.

Positions use the existing `pebble:full-ui:community:v1` localStorage record,
through the Community reducer. Saves without positions still work; invalid and
unowned coordinates are ignored/clamped. Reset clears positions. These are local
prototype placements, not a shared/server scene or a dated history ledger.

The 12px placement grid clamps to inset land and avoids river/tree trunks; the
footbridge may cross water. Objects and tree overlays sort by ground-contact Y.
Pointer capture stays on the stable SVG ancestor during sorting. Escape and
pointer cancellation discard the unfinished drag. Arrow keys provide a keyboard
alternative. Positions are written on release, not on every pointer move.

Garnet, Sapphire, Emerald and Citrine cost **300 Pebbles each** (existing items:
10–120). All use the existing shop, balance, affordability and single-purchase
rules. Their sprites retain the mascot's squat form, chunky outline, simple eyes,
cheeks and soft pixel shading, with determined/wistful/content/excited faces.

## New art and prompts

Generated using the built-in imagegen tool; original reference assets unchanged.

- `src/assets/pebble/community/village-landscape.png` — 1448×1086 RGBA;
  edit target `community-village.png`.
- `src/assets/pebble/community/expressive-pebbles.png` — 2172×724 RGBA;
  style references `characters/pebble-happy.png` and `community/village-props.png`.

Landscape prompt:

> Precise object edit for game compositing. Edit attached village. Remove ONLY the cottage/house, bench (including its two sitting Pebbles), and all three freestanding Pebble characters. Fill their footprints with matching grass or continuing existing sand path. Keep the EXACT existing island silhouette, river shape and water pixels, four permanent trees, flowers, stones, grass tufts, path, side faces, and shadow. Preserve original 1448x1086 composition and object coordinates without zoom/crop/recenter. This must be the same village landscape with movable objects removed, not a new design. Do not alter the river. Do not add anything. Pixel density, softness, palette and lighting identical. Genuine alpha transparency outside island/shadow.

Expressive Pebbles prompt:

> Game sprite sheet, 4 equal columns in ONE horizontal row. Four cute special geological Pebble characters. Use attached Happy Pebble as character style authority, second image as village sprite style authority. Same squat rounded triangular Pebble body, chunky olive-dark pixel outlines, simple dark eyes and tiny mouth, restrained cheeks, gentle softly shaded pixel colors. NOT tall RPG crystals, no accessories, no text. Left to right: RED GARNET with deep warm red dodecahedral faceted body, determined angled brows and tiny firm mouth; BLUE SAPPHIRE with muted cornflower/royal blue short hexagonal faceted body, wistful drooping eyes and tiny downturned mouth; GREEN EMERALD with sage/emerald green short blocky hexagonal facets, calm closed curved eyes and content small smile; YELLOW CITRINE with honey golden yellow short quartz-like facets, happy bright eyes and excited open smiling mouth. All bodies the SAME approximate size as reference mascot, cute rounded rock personalities with subtle real-mineral forms. At most 3-4 broad planes of shading each, consistent pixel density and face size. Each isolated on genuine transparent background with generous margins within its own equal-width cell. No grass or floor, no platform, no shadows reaching adjacent cells. Wide landscape sprite atlas.

## Files changed in this pass

- `src/features/prototype/PebbleGarden.tsx`
- `src/features/prototype/CommunityWorld.tsx`
- `src/features/prototype/community-placement.ts` (new)
- `src/features/prototype/village-art.css`
- `src/features/prototype/economy.ts`
- `src/features/prototype/model.ts` (Community actions only)
- `src/assets/pebble/community/village-landscape.png` (new)
- `src/assets/pebble/community/expressive-pebbles.png` (new)
- `tests/community-placement.test.ts` (new)
- `tests/community-history.test.tsx`
- `tests/prototype-economy.test.ts`
- `e2e/community-refinements.spec.ts`
- `e2e/prototype-community.spec.ts`
- `e2e/pixel-assets.spec.ts`
- `docs/DESIGN.md`
- `docs/UI-PLAN.md`
- `docs/ASSET-INTEGRATION.md`
- `docs/COMMUNITY-REFINEMENT.md` (new)

## Validation

- `pnpm lint`: passed.
- `pnpm test`: 160 tests passed across 33 files.
- `pnpm build`: passed, including frontend typecheck and API compilation; Vite
  reports the existing non-blocking >500kB bundle warning.
- Browser checks covered purchase affordability/ownership, mouse and real touch
  pointer sequences, keyboard movement, out-of-bounds drops, reload persistence,
  fixed landscape, museum absence, and cumulative history. Community, Build,
  Sunday/Wednesday/Saturday and arranged scenes visually reviewed at 390×844
  and 1280×720. Responsive checks also cover 320px through 4K.
- The sampled exposed shadow pixels in Sunday/Saturday screenshots are identical
  at both reviewed widths.
- No backend/schema/auth/messaging/matchmaking or deployment changes.
- No commit or push.
