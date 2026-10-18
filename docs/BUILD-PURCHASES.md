# Build visibility and purchase reset

## Visibility diagnosis

The live `/community` route renders `PebbleGarden`, which reads `upgrades` from
`economy.ts` directly. All four rocks already existed there at 300 Pebbles, with
working mappings to `expressive-pebbles.png`. There were no category, unlock,
ownership, type or visibility filters removing them. In the running 390×844 app,
Garnet began at Y≈1809 and Citrine at Y≈2318 in a 2413px unlabelled scrolling list.
They appeared after scrolling. This was discoverability/below-the-fold placement,
not missing registration or artwork.

`buildSections` now groups that same catalog, exactly once per item, with Rare
Finds first, Landscape second, and Village Decorations third. Cards, prices and images are reused.
The catalog has explicit flex scrolling; header and reset footer stay reachable.

## Refunds and persistence

New purchases atomically save the exact deducted cost in optional `purchaseCosts`
on the existing local Community record. No new storage key or service is used.
For older saves with ownership but no receipts, refunds use current catalog costs,
which have not changed. Such saves cannot establish a hypothetical earlier price;
this is the documented local/demo fallback.

Only unique owned catalog IDs count toward a refund. Stray/unowned receipts do not
count. Reset adds the sum to the current balance, clears ownership and receipts,
and clears all Community positions. It saves `freshStart: true`, making the
current village use Sunday's exact empty-grass platform and centered Pebble.
Base cottage/bench/trees/river are absent in that current state; historical day
snapshots still use the existing progression. New purchases appear on the empty
platform; objects remain draggable and landscape remains fixed. Earned chapters and all non-Community state are
preserved. Repeated reset on an already untouched fresh start is a no-op; an
unowned but developed village can also reset with a zero refund. The existing developer full reset
also clears receipts so they cannot survive that separate operation.

Exact refunds may take balances above the old 1,000,000 demo funding cap. Valid
safe-integer balances survive reload; adding demo funds never reduces a balance
already above the cap. The funding cap itself remains unchanged. Saved receipts
are validated and the balance plus refund must remain a safe integer.

Reset purchases is secondary, inside Build, disabled only when the current
village is already an untouched fresh start. It opens a native alert dialog:
“Reset your entire Pebble Community?” / “This removes all purchased items and
restores your spent Pebbles.” The exact refund is shown. Cancel receives initial
focus. Cancel/Escape change nothing; Reset everything dispatches one atomic
reducer action, selects the current view and closes Build to show the result.

The right drawer is now 360px on desktop (previously 460px), inset 12px with a
94%-opaque cream surface, 10px surface blur, soft shadow and almost clear backdrop.
Mobile caps at 340px with an outer gap. Cards omit descriptions and extra
insufficient-funds prose, retaining image, name, price and purchase/owned state.
The catalog, prices and artwork are unchanged.

## Earlier Build/refund pass files

- `src/features/prototype/economy.ts`
- `src/features/prototype/model.ts` (Community actions only)
- `src/features/prototype/PebbleGarden.tsx`
- `src/features/prototype/village-art.css`
- `tests/build-reset.test.ts` (new)
- `tests/prototype-economy.test.ts`
- `e2e/build-purchases.spec.ts` (new)
- `docs/DESIGN.md`
- `docs/BUILD-PURCHASES.md` (new)

Existing artwork and other screens are unchanged. No commit or push.

## Validation

- `pnpm lint`: passed.
- `pnpm test`: all 165 tests passed (34 files).
- `pnpm build`: passed; existing non-blocking bundle-size warning remains.
- 11 browser tests passed, including the new mobile/desktop Build/refund flow,
  existing touch/mouse placement, persisted purchases and responsive checks.
- Visually inspected Rare Finds and confirmation at 390×844 and 1280×720.
- Browser verification purchased all four rocks plus a bench (1215 Pebbles),
  dragged the rocks, reloaded, cancelled confirmation, confirmed reset, verified
  the exact refund and preserved landscape/base position, then repurchased.

## Compact drawer / full reset follow-up

Files: `CommunityWorld.tsx`, `PebbleGarden.tsx`, `economy.ts`, `village-art.css`,
`tests/build-reset.test.ts`, `tests/community-history.test.tsx`,
`e2e/build-purchases.spec.ts`, `docs/DESIGN.md`, and this document.
No history-control, price, backend or unrelated-screen changes.

Follow-up validation: `pnpm lint`, all 167 tests (34 files), and `pnpm build`
passed. Build retains the existing non-blocking bundle-size warning. Five browser
checks passed, including desktop/mobile dragging, history, all four purchases,
confirmation cancellation, exact refunds, reload and repurchase. Drawer,
confirmation and cleared scene were visually reviewed at 320×568, 390×844 and
1280×720. At all three widths the reset scene SVG screenshot is pixel-identical
to the Sunday scene captured before purchases. No commit or push.

## Landscape purchases

Build now includes seven fixed landscape purchases from `village-landscape.png`:

| Item | Pebbles | Fixed location |
| --- | ---: | --- |
| River | 80 | Existing winding stream on the right |
| Tree Cluster | 60 | Four original trees around the island |
| Walkway | 45 | Original winding central path |
| Flower Meadow | 25 | Orange/white flower patch on the left |
| Shrub Patch | 30 | Shrubs beside the left tree |
| Rock Formation | 35 | Three original stones beside the river |
| Grass Details | 20 | Original small tufts across the grass |

The original pixels are clipped in place, including shop previews; no additional
art library was generated. Trees retain ground-depth ordering with movable
objects. Landscape has no pointer/keyboard movement handlers, is excluded from
`MovableId`, and cannot acquire saved positions through parsing or reducer moves.
Other objects retain their existing movement behavior and prices.

All seven use the same purchase catalog, balance deduction, owned state, receipt
recording and local Community save as decorations. Total landscape spend is 295
Pebbles. Reset refunds the actual recorded costs, removes all seven purchases,
and leaves the same Sunday grass platform with one centered Pebble. Repeat reset
cannot refund twice; every landscape item can be bought again. Existing developed
villages retain their demo scenery until reset; buying a landscape there registers
ownership without duplicating its artwork. Historical Sunday–Friday snapshots
remain unchanged by landscape ownership; Saturday is the editable current view.

Landscape follow-up files: `economy.ts`, `community-placement.ts`,
`community-landscape.ts` (new), `CommunityWorld.tsx`, `model.ts` (Community move
validation only), `tests/landscape-purchases.test.tsx` (new),
`tests/prototype-economy.test.ts`, `e2e/landscape-purchases.spec.ts` (new),
`e2e/prototype-community.spec.ts`, `docs/DESIGN.md`, and this document.

Landscape validation: lint passed; all 171 unit tests across 35 files passed;
production build passed with the existing non-blocking bundle-size warning.
Ten relevant browser scenarios passed across the verification runs, including
the new 390px/1280px landscape purchase, non-dragging, persistence, cancellation,
refund and repurchase flows. The reset scene is pixel-identical to the empty
base captured before purchasing. Landscape cards and rebuilt scenes were
visually inspected at both widths. No commit or push.
