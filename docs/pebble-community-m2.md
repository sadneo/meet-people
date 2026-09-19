# Pebble Community: Milestone 2 prototype

## Requirement and design

Pebble connects shared real-world activities with a small, growing virtual community. This prototype makes that product loop reviewable before event, matchmaking, and data integrations exist. It is the Community contribution to M2's running prototype and design artifacts, not the team's complete architecture document or an M3 MVP.

- The meadow is the visual focus. Balance and the next unlock stay secondary.
- One pebble becomes a pile, a cottage, and a small grove. Only a few stones have faces.
- A full-screen warm intro opens with a gently moving pouch. Clicking, tapping, or pressing Enter/Space opens it and scatters nine stones with happy, sad, angry, surprised, and neutral expressions before the Community view appears. Refresh replays the intro; resetting the demo keeps you in the Community view.
- Mock attendance earns 10 Pebbles for demo proof and 10 per simulated attendee confirmation. The three groups contain 4, 6, and 10 people including the demo participant, allowing totals of 40, 60, and 100. The existing upgrade costs remain 40, 60, and 100. These are demonstration values, not a final reward economy.
- Proof must be added before confirmations. Individual confirmations and a clearly labeled bulk simulation shortcut keep the demo quick. Rewards can be collected incrementally; the receipt distinguishes proof, confirmations, already collected, and ready to collect. Reopening an activity preserves its receipt, and previously collected rewards cannot be claimed again.
- Cottage roof colors and wildflowers become available at Stage 3. Customization is free and transient.
- SVG keeps the illustrated world local, editable, and responsive without adding dependencies. Feature-scoped CSS avoids changing the team's global styling.
- Occasional stone hops/wandering, brief balance feedback, upgrade sparkles, and stage transitions add life while preserving the existing layout. Reduced-motion mode disables movement, shows the scattered expressions briefly in place, and still dismisses temporary reward feedback.

## Boundaries and integration

```text
/community -> Community.tsx
              |-- PouchIntro (local intro phase and cleaned-up timers)
              |-- local activity view and ActivityRewards dialog
              |-- demo reducer (balance, stage, per-activity proof/confirmations/collected amount, customization)
              |-- SVG World (reads stage and customization)
              |-- RewardFeedback (temporary earning/spending cues)
              |-- scoped community.css and motion.css

No feature requests to API, Supabase, auth, event registry, or matchmaking.
```

The only shared application change is one import and one `/community` route in `src/App.tsx`. Home and fallback routes remain intact. The Activities tab is internal demo state, not a real `/events` route. Existing app startup environment validation and optional Supabase initialization are unchanged; the feature itself requires neither a Supabase connection nor a running API.

All state lives in React. Refreshing or leaving the route resets the demo; switching its two internal views or closing a dialog preserves it. Invalid activity IDs, duplicate proof, confirmations before proof or beyond the group limit, duplicate reward collection, unaffordable upgrades, and upgrades beyond the last stage are ignored. Reset requires an in-page confirmation so a live demo is not accidentally lost.

The final team navigation can link to `/community`. Later integration should replace the mock reducer and activity view with agreed data contracts, while keeping the presentation components. No production reward or attendance validation is implied.

## Local walkthrough

1. Run `pnpm dev` and open `http://127.0.0.1:3000/community`. Tap the pouch to enter.
2. Open Activities, join the walk, and select **Add demo proof**. The receipt shows 10 Pebbles ready to collect.
3. Select **Simulate 1 confirmation** to see another 10 added, then **Simulate remaining confirmations** to reach 40. Select **Bring 40 Pebbles home**.
4. Select **Grow your world** for the pile. Repeat the proof/confirmation flow for coffee, then spend 60 for the cottage. Try the roof colors and wildflowers.
5. Repeat for gardening, then spend 100 for the grove.
6. To demonstrate partial rewards, collect immediately after proof, reopen with **Continue**, add confirmations, and collect only the new rewards. Fully collected activities remain available through **View rewards**.
7. Use **Reset demo** to repeat the progression, or refresh to reset everything and replay the intro.

## Validation and scope

`pnpm verify` runs the existing typecheck, lint, unit tests, and build. `tests/community.test.ts` checks proof prerequisites, confirmation limits, incremental collection, duplicate prevention, upgrade costs, customization, and reset. Browser tests cover the complete mobile flow, reopening activities, intro expressions and keyboard focus, reduced motion, responsive dialogs, reset, refresh, and preservation of Home.

On Windows, with `pnpm dev` running, the following works with the installed Edge browser and avoids the existing shell-specific test script and missing Windows Playwright shim:

```powershell
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:3000'
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
pnpm exec node node_modules/@playwright/test/cli.js test
```

Validation: all 10 unit tests and six browser tests passed, along with lint, typecheck, and web/API builds. The browser checks cover 320px, 390px, 768px, and 1280px widths and confirm the original Home layout is preserved. Desktop intro and reward dialog and the mobile reward dialog were also visually reviewed. Vite reported a non-failing bundle-size warning. No browser or package installation was needed.

M2 only: fictional activities/attendees, simulated proof and confirmations, local currency and progression. No file input, photo capture, upload, actual verification, persistence, real accounts, event scraping, matchmaking, backend, or schema changes. No packages were added.

Product direction and reference art: project owner. Implementation and local verification: coding agent. Final visual review and team integration decisions remain with the project owner and team.
