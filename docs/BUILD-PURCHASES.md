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
Finds first and Village Decorations second. Cards, prices and images are reused.
The catalog has explicit flex scrolling; header and reset footer stay reachable.

## Refunds and persistence

New purchases atomically save the exact deducted cost in optional `purchaseCosts`
on the existing local Community record. No new storage key or service is used.
For older saves with ownership but no receipts, refunds use current catalog costs,
which have not changed. Such saves cannot establish a hypothetical earlier price;
this is the documented local/demo fallback.

Only unique owned catalog IDs count toward a refund. Stray/unowned receipts do not
count. Reset adds the sum to the current balance, clears ownership and receipts,
and removes catalog-item positions. Base Pebble/cottage/bench positions, earned
chapters and all non-Community state are preserved. Repeated reset with no owned
items is a no-op, preventing duplicate refunds. The existing developer full reset
also clears receipts so they cannot survive that separate operation.

Exact refunds may take balances above the old 1,000,000 demo funding cap. Valid
safe-integer balances survive reload; adding demo funds never reduces a balance
already above the cap. The funding cap itself remains unchanged. Saved receipts
are validated and the balance plus refund must remain a safe integer.

Reset purchases is secondary, inside Build, disabled with no purchases. It opens
a native alert dialog explaining the refund, initially focused on Cancel. Cancel
or Escape changes nothing; Reset dispatches a single atomic reducer action.

## Files changed in this pass

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
