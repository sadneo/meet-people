# Pebble multi-screen design review

Entry: `http://localhost:3000/` after `pnpm dev`.

This frontend-only design is now the main application. Primary screens use canonical routes: `/`, `/events`, `/free-time`, `/messages`, `/profile`, and `/settings`. The earlier Community milestone remains available only at `/prototype/yzcommunity`.


## Focused community revision

- The repeated LOCAL PROTOTYPE banner is removed; DEV review controls remain separate.
- Home is only the edge-to-edge pixel world, pouch/balance, right-edge Build control, and bottom navigation. Plans and activities remain in their dedicated tabs.
- Select **Intro** to start the original pouch experience from idle. Tap to open/scatter, then it transitions to Home. Selecting Intro again starts a fresh instance; **Replay Intro** resets it even during opening. Intro does not change the wallet or purchases.
- **Build your community** opens a non-modal right drawer. Costs live in `src/features/prototype/economy.ts`: Wildflower Patch 10, Garden Bench 15, Path Lanterns 20, Picnic Spot 25, Footbridge 30, Community Garden 40, Café Cart 55, Music Stage 70, Cottage Expansion 90, Community Hall 120.
- The reducer checks ownership and balance before deducting once. Insufficient purchases are disabled with a readable shortfall; purchased items show Owned. Each purchase adds distinct SVG artwork with a brief build animation.
- Completing a chapter adds 10 Pebbles once; it never builds or enlarges anything. Already-earned chapter receipts persist so replaying onboarding after refresh cannot earn the same reward again.
- Browser localStorage key `pebble:full-ui:community:v1` stores only balance, upgrade IDs, and chapter-reward receipts. No profile, credentials, chat, or plan data is stored. Invalid storage falls back safely. If the browser disables storage, the economy remains session-only. It is a single-browser review save, not cross-device or concurrent-tab synchronization.
- DEV controls **Add 100 demo Pebbles** and **Reset community/upgrades** are omitted from production builds. Reset clears the wallet and built items, preserving chapter reward receipts. Five clicks of Add 100 fund the entire 475-Pebble catalog, leaving 25.
- The landscape uses a responsive viewBox, crisp vector pixel shapes, repeating ground details, extended trees, and repositioned landmarks. The cottage starts as scenery; all expansions are manual. Characters gather at several purchased landmarks. Tapping the main Pebble produces a short hop/emote.
- Login/Register mascots use fixed viewport positioning, with small mobile characters and 140–220px desktop characters. Text/forms keep readable widths within the full canvas.

Review: Intro/replay; Home before and after purchases at 390px, 1440px, and 3840px; drawer shortfalls/Owned/reset; Login/Register on every edge; Free Time and Free Time Match; Events including the wide preview; Messages/Chat; Profile; onboarding → balance increase → manual Build. Reduced motion keeps all interactions usable.

## Strongest demo (about 90 seconds)

1. Open **Free Time** from the navigation. Home is exclusively the virtual community.
2. Keep **Later today** → **Continue**.
3. Keep **Low-key** → **Continue**.
4. Keep **Nearby** → **Find people**.
5. Select **Jamie** and **Aaron** → **Choose an activity**.
6. Choose **Coffee** → **Choose a time**.
7. Select **4:00–4:45 PM** → **Review plan**. Aaron’s conflicting 5 PM slot is disabled.
8. **Confirm plan** → **Open group chat**.
9. See the confirmed plan card and send a made-up message. **Messages** and **Profile** also show the same plan.
10. Optional: **Change plan** → **Change activity** → **Walk** → **Choose a time** → **Review plan** → **Confirm plan**. The existing plan updates; it is not duplicated.

The sample clock is Saturday, September 26, 2026 at 3 PM. It intentionally stays fixed for repeatable reviews. **Pick a time** accepts another date and time; resulting overlap is simulated, not calculated against calendars. Tonight has its own sample times. Vibe and distance are recorded in the draft but do not run a matching algorithm.

## Scenes and review controls

The gray **DEV · Design review** toolbar is shown only by Vite development mode (`import.meta.env.DEV`); production builds omit it. It can open:

- Intro, Login, Register, Onboarding
- Home, Events, Event Detail
- Free Time, Free Time Match, Activities, Planning, Review, Confirmed
- Messages, Chat, Connection
- Profile, Other User Profile, Settings

Each screen has a path, including `/events`, `/free-time/matches`, and `/messages/chat`, so browser Back/Forward works without query-string scenes. Draft choices survive in-app navigation. Refresh resets planning/profile/chat state. The community balance, purchases, and already-earned chapter receipts persist locally. Direct jumps to later planning screens show a useful start action if prerequisites have not been chosen.

**Empty states** toggles sample empty screens in Events, Messages, and Free Time Match. This control is separate from the product UI. Desktop places the logo and primary tabs at the top with Profile and Settings on the right. Mobile uses five bottom tabs; Settings remains inside Profile.

## Other interactive references

- Login/register validate email/password format locally and navigate to Home/onboarding. Use invented credentials; no authentication request occurs. The curious stone retreats on click, then appears from a different edge after a short random delay.
- Onboarding has a skippable shadow → boulder → impact → overhead fracture animation. Its four physical stone chapters collect a demo photo/name/bio, interests, social intent, and availability/preferences. Chapters unlock in order; completed chapters can be edited. Each chapter awards `DEMO_CHAPTER_REWARD` (10) once. The final pouch/community moment leads Home. Profile editing uses a normal form without replaying the cinematic.
- Event categories filter three local fixtures. Detail pages show mock interested people and enter the planning flow. Photos are illustrative, not pictures of actual listed campus events.
- Match selection, branching activity paths, shared-time conflicts, optional plan note, review/edit, and confirmation are connected.
- Conversations have independent local messages; the confirmed group plan is shared across Profile and group chat. The default Jamie conversation is separate. Reading it clears its unread indicator for the current session.
- Profiles support ordinary local name/bio/interest edits. Other profiles show sample shared ground and lead to a short connection moment.
- Settings switches retain their values while navigating. They illustrate preferences, not actual notification/privacy/location services.
- Report has a reason form and explicit not-submitted confirmation. Block hides the person in sample matches, removes them from the draft, and disables sending in affected conversations. Unblock is available in Settings. These actions never affect real users.

## Identity and implementation choices

- Home recomposes the existing Community pixel primitives (stones, trees, flowers, cottages) into a viewport-wide SVG landscape, without editing the earlier `/prototype/yzcommunity` world. Cream, moss/grass greens, terracotta, rounded controls, friendly stones, the cloth pouch, and occasional motion come from Community.
- `feature/meet-planning-ui` was inspected with read-only Git commands. People context, shared availability/conflict labels, progressive planning, exact meeting-point summaries, and editable review/confirmation informed this implementation. No files were merged, cherry-picked, or copied wholesale from that branch.
- New screens use scoped `.pt-*` styles and shared buttons, chips, avatars, icons, typography, and navigation. No new dependencies.
- `prefers-reduced-motion` disables CSS movement and skips the opening cinematic. Essential form/reward transitions still finish; Skip animation is available during the opening and chapter reward moments.

## Explicit limits

All people, interests, overlap, availability, events, places, prices, messages, and rewards are fixtures or React state. No API calls, auth, backend persistence, uploads, geolocation, event ingestion, matchmaking, real invitations, reporting backend, or economy is implemented. The app supports one active demo plan; confirming a new plan replaces it. Settings switches and stock photos are design references. The world has local, manual purchases and a clickable Pebble, not a simulation. The cinematic is a lightweight 2D CSS/SVG interpretation, not 3D. Desktop uses top navigation, wider utility layouts, a conversation list beside chat, and an event preview above 1800px. No production-ready moderation or account workflows are claimed.

## Validation

- `pnpm verify`: passes TypeScript, ESLint, 21 Vitest tests, and production web/API builds.
- All 20 Playwright browser tests pass, including canonical routes, desktop/mobile app shells, purchases at 390px/1440px/3840px, persistence/reset, Intro replay, viewport-edge mascot behavior, and responsive event/conversation panes.
- Browser coverage: connected path at 1440px and 390px, all scenes at 360px, plan edits and state consistency, disabled conflicts/incomplete confirmation, onboarding completion/unique rewards, animation skip/reduced motion, report/block controls, event filters, empty states, and existing Community behavior.
- Windows browser command (existing Playwright dependency, installed Edge):

```powershell
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:3000'
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
pnpm exec node node_modules/@playwright/test/cli.js test
```

## Placeholder photo sources

Local copies in `public/prototype` keep the review independent of third-party image requests. Names/bios are fictional and do not identify the people in these placeholder photos. Replace them with approved production assets before shipping.

| Asset | Source |
| --- | --- |
| `coffee.jpg` | https://images.unsplash.com/photo-1442512595331-e89e73853f31?w=1100&q=85&fit=crop |
| `music.jpg` | https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1100&q=85&fit=crop |
| `walk.jpg` | https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1100&q=85&fit=crop |
| `jamie.jpg` | https://randomuser.me/api/portraits/women/44.jpg |
| `aaron.jpg` | https://randomuser.me/api/portraits/men/32.jpg |
| `maya.jpg` | https://randomuser.me/api/portraits/women/68.jpg |
| `you.jpg` | https://randomuser.me/api/portraits/men/75.jpg |
