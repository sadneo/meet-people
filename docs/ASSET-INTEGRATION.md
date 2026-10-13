> Current Community integration supersedes the historical Museum/reference-only
> notes below. See [Community refinement](COMMUNITY-REFINEMENT.md): raster village
> layers, a shared reference shadow, draggable local objects and four rare Pebbles.
> The Museum is no longer mounted or navigable from the app.

# Pebble pixel-art integration

This pass builds on the existing uncommitted UI work. No commits or pushes.
No backend, authentication, database, deployment, or messaging changes.

1. **Integrated supplied assets:** `characters/pebble-happy.png`,
   `characters/pebble-thinking.png`, `ui/pebble-currency.png`,
   `ui/build-icon.png`, `geodes/geode-progression.png`, and
   `gems/gem-collection.png`, all under `src/assets/pebble/`.
2. **Reference-only assets:** `community/community-village.png` and
   `displays/display-museum-concept.png`. Neither is shipped as a flattened
   replacement scene.
3. **New artwork:** a code-native SVG museum room and one reusable case geometry.
   No generated PNGs, replacement character art, or edited source images.
4. **Home:** Happy is the centerpiece. The existing guarded 1800ms refresh shows
   Thinking, cycles the existing local person preview, then restores Happy.
   Thought bubbles, profile links and Find people remain. Both images use the
   same display crop, preserve aspect ratio, and have a restrained opacity
   transition (disabled for reduced motion). Only the artwork's grass remains.
5. **Matchmaking:** Happy while idle; Thinking when the existing queue mode or
   loading state is active. Candidate presentation stays intact. No new queue
   states, polling, matching rules, or backend calls.
6. **Currency:** one `CurrencyIcon` uses the supplied PNG and one shared crop.
   Its size is 32–36px responsively on Home, Community, Build balance,
   onboarding balance, and the separate Community experiment's balance/progress.
   Home and Community share `PebbleBalance`, including 20–22px numbers and
   weight/color. Existing Community spacing is retained: 16px on compact
   screens and 20–40px on expanded screens. Amounts and economy are untouched.
7. **Community icon:** retained the existing minimal SVG tree silhouette.
8. **Build icon:** supplied hammer artwork in the existing 56px button and
   position; the native dialog, prices, purchases and focus behavior remain.
9. **Village image:** inspected for direction. Kept the individual live SVG
   placements because a flattened PNG would hide purchased upgrades and
   history changes. Future individual village sprites can replace primitives.
10. **Museum section:** `CommunityAreas` adds a second native horizontal scroll
    panel to the right of the village. Touch/trackpad panning, Museum/Village
    controls and focused-container arrow keys work. Off-screen sections are
    inert and hidden from assistive technology. The white SVG room scales with
    the viewport; its isometric floor and cases use the same axes.
11. **Case count:** exactly sixteen identical cases, four rows by four columns.
    Five fictional connections demonstrate the stages; eleven cases are empty.
    The developer Empty states switch leaves all sixteen empty. The case
    selector identifies each connection/stage or explicitly says Empty.
12. **Geode progression:** the inspected 2172×724 sheet has four usable stages,
    rendered through SVG viewBox crops: closed, cracked, opening and open.
    A fifth presentation stage reveals a gem. The immutable frontend model
    caps progression and deduplicates connections. A development-only
    Collection preview control advances a selected occupied case. State lasts
    while Community is mounted; real chat activity is not connected.
13. **Gems:** six named crops from the intact 1536×1024 sheet: rose, amethyst,
    jade, sapphire, citrine and opal. A connection carries its gem key. No random
    rewards, new gem artwork, or relationship scoring is implemented.
14. **Files in this pass:**

    - New shared rendering: `src/features/pebble-art/assets.ts`, `PixelArt.tsx`,
      `pixel-art.css`.
    - New Community section: `src/features/prototype/CommunityAreas.tsx`,
      `GeologyMuseum.tsx`, `museum-model.ts`, `museum.css`.
    - Updated consumers: `src/features/prototype/AvailablePeoplePreview.tsx`,
      `home-preview.css`, `Home.tsx`, `PebbleGarden.tsx`, `Onboarding.tsx`,
      `calm.css`; `src/features/matchmaking/MatchingScreen.tsx`;
      `src/routes/Community.tsx`.
    - Checks: `tests/museum-model.test.ts`, `e2e/pixel-assets.spec.ts`.
    - Documentation: `docs/DESIGN.md`, `docs/UI-PLAN.md`, this report.
    - Supplied PNG files remain unchanged. Other existing working-tree changes
      belong to earlier UI passes.

15. **Validation:** lint, all 151 unit tests, TypeScript and production web/API
    build passed. Asset/museum browser checks passed at 320×568, 390×844,
    768×1024, 1280×720 and 2560×1440, including Home state changes, matching
    state, equal currency rendering, case alignment/count, empty/progression
    states, resizing, keyboard navigation and Build dialog focus. The full
    browser suite passed all 95 tests. Vite reports its existing
    advisory about a JavaScript chunk over 500kB.
16. **Remaining artwork/integration:** the live village still needs separate
    final object/upgrade sprites if it is to match the new village reference
    closely. The museum's SVG room/cases are maintainable review artwork and
    can be replaced with approved individual pixel sprites. Supplied character,
    currency, hammer, geode and gem art is usable as-is. Production relationship
    IDs, chat progression thresholds, persistence and gem assignment remain a
    separate backend/data task.

For visual review, open `/`, click the Pebble, then enter Community and use
Museum (or pan right). Open Collection preview to advance the selected sample.
Use Developer controls → Empty states to inspect empty cases. Matchmaking's
searching art can be reviewed with a signed-in configured local session; browser
tests cover it with the existing mocked session/API fixtures.
