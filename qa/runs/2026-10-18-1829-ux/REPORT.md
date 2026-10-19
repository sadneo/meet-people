# UX formatting report: 2026-10-18-1829-ux

2026-10-18 · branch dev @ dc9e94a · areas HOME/Community, MATCH, EVENTS, profile/settings/auth/messages · testers 3 · status Fixed and verified

## Summary

This visual pass covered formatting, spacing, hierarchy, alignment and responsive layout within `docs/DESIGN.md`. The visual direction is in DESIGN-PLAN.md. Codex ran the review and wrote all 10 findings. It finished fixes for the forms and home groups in isolated worktrees and wrote tests for the events group, then ran out of usage before integration. Claude resumed from that point. It merged the forms and home fixes into the main tree, implemented the four events and matching fixes, fixed two flaky new tests, and verified everything in a real browser at 320–1920px.

**11 findings (9 P2, 2 P3 fixed on request): all fixed and verified.** MSG-UX-01 was reported by the user after the run; the testers missed it. The full e2e suite shows the same 19 failures as the baseline and no new ones. Earlier QA fixes from run 2026-10-18-1700 stay in the working tree. There was no database reset or data write, no commit and no push.

## Issues

| ID | Sev | Area | Type | Summary | Page / viewport | Status | Fix |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [UX-COMMUNITY-01](findings/UX-COMMUNITY-01.md) | P2 | Community | visual | Signed-in bell takes its own 64px row, pushing week controls behind phone navigation | /community · 320×568 | Fixed and verified | `calm.css` |
| [EVENTS-UX-02](findings/EVENTS-UX-02.md) | P2 | Events | formatting | Multi-day events drop the end date and appear to end before they start | /events, /events/:id · 390, 1280 | Fixed and verified | `client.ts` |
| [EVENTS-UX-01](findings/EVENTS-UX-01.md) | P2 | Events | visual | Go together section is an equal-weight wall of text; queue buttons touch | /events/:id, wide preview · 320–1920 | Fixed and verified | `EventGroupQueue.tsx`, `events.css` |
| [MATCH-UX-01](findings/MATCH-UX-01.md) | P2 | Matching | visual | Preferences editor wastes short screens on chrome; interest labels wrap beside inputs | /matchmaking prefs · 320–1280 | Fixed and verified | `matchmaking.css` |
| [FORMS-01](findings/FORMS-01.md) | P2 | Profile | visual | Empty-photo avatar clipped to a sliver at the top of the cover | /profile · all sizes | Fixed and verified | `profile.css` |
| [FORMS-02](findings/FORMS-02.md) | P2 | Settings | visual | Social preferences fields touch the card edges (1px inset) | /settings · all sizes | Fixed and verified | `settings.css` |
| [FORMS-03](findings/FORMS-03.md) | P2 | Auth | visual | Forgot password / recovery links are browser blue | /login password step, /reset-password | Fixed and verified | `account.css` |
| [FORMS-04](findings/FORMS-04.md) | P2 | Messages | visual | Refresh covers the Messages heading at the expanded layout's narrow edge | /messages · 801px | Fixed and verified | `messaging.css` |
| [MSG-UX-01](findings/MSG-UX-01.md) | P2 | Messages | visual | Empty details column leaves a blank gap; Participants shown for one-on-one chats | /messages · ≥801px | Fixed and verified | `Feature.tsx`, `messages.css`, `DESIGN.md` |
| [UX-HOME-01](findings/UX-HOME-01.md) | P3 | Home | visual | Mascot and action shrink 28% between 800 and 801px | / · 800/801 | Fixed and verified (on request) | `home-preview.css` |
| [EVENTS-UX-03](findings/EVENTS-UX-03.md) | P3 | Events | visual | Event card titles are browser-blue underlined links | /events · all sizes | Fixed and verified (on request) | `events.css` |

UX-HOME-01 and EVENTS-UX-03 are polish by the rubric. They were fixed because this pass was explicitly about formatting.

### UX-COMMUNITY-01: Community bell row hides week controls on short phones
Steps, evidence and the root cause are in the finding. **Fix:** `.pt-scene-community .pt-inbox-controls` is positioned absolutely beside Back, mirroring Home: 32px top on compact screens, header height + 18px on expanded ones. The bell, its label and the notification dialog are unchanged. **Verified:** at 320×568 the bell sits at y32 next to Back (x76 vs Back's right edge at x68). Week controls end at y451, clear of navigation at y496 (was y527, covered). Back and the bell share a row at 390, 799, 800, 801, 1280 and 1920. **Test:** `e2e/community-toolbar.spec.ts` checks geometry at 320, 390, 800 and 801, plus bell-dialog focus return and Build opening.

### EVENTS-UX-02: Multi-day ranges lose their end date
**Fix:** `eventDate` names the ending date when it falls on a different calendar day, adds years when the range crosses a year, and keeps same-day ranges compact. An invalid end now falls back to the start alone instead of printing "Invalid Date". **Verified:** the card and detail at 390 and 1280 read `Sat, Oct 24, 6:00 PM EDT – Mon, Oct 26, 2:00 PM EDT` (was `… – 2:00 PM EDT`), using Codex's response fixture. **Test:** `tests/events-dates.test.ts` (4 cases).

### EVENTS-UX-01: Go together hierarchy
**Fix:** the section now has three levels: a concise purpose line, a bold queue status, then a wrapping action row with a 10px gap. Service limits and the legacy Company/compatibility note follow as quiet 13px notes. All copy, roles and button names are unchanged, so existing tests keep passing. "Background processing is not enabled" stays visible, as `e2e/event-group-queue.spec.ts` requires. That is why the finding's disclosure option was not used. **Verified:** buttons sit 10px apart at 390–1920 and stack 10px apart at 320. There is no horizontal overflow. The 1920 selected-event preview uses the same structure.

### MATCH-UX-01: Preferences editor density
**Fix (scoped to `.match-preferences.match-live-dialog`):**
- Heading changed from 29.6px Georgia to a 22px app-stack heading on one line.
- Inherited `.pt-app label` 15px margins removed; the `.match-live fieldset label { display: flex }` override reset, so labels stack.
- Each interest's textarea and Remove action grouped together.
- The form's inherited 16px grid gap removed.
- Header and footer dividers restored. The original `.match-preferences > header/footer` rules never matched because a `<form>` wraps those elements.
- Footer labels kept on one line, with compact padding at ≤800px.

**Verified:**

| Viewport | Scroll body before | Scroll body after | Heading | Save button |
| --- | --- | --- | --- | --- |
| 320×568 | 205px, ~1 field visible | 295px, 3 fields | 27.5px, one line | 46px, one line (was 102px footer) |
| Desktop | 1,690px total scroll | 1,508px total scroll | — | — |

At 320px the total scroll height dropped from 1,980px to 1,708px. There is no horizontal overflow at any size. Two regressions appeared during integration and were fixed before verification: footer `nowrap` widened the dialog at 320, and a `min-height: 0` reset collapsed the scroll body's grid rows. **Test:** `e2e/matchmaking-preferences-layout.spec.ts` at 320 and 390.

### FORMS-01 to FORMS-04
- **FORMS-01:** the presence-dot selector now excludes `.pt-avatar`. The portrait is 132px (compact) or 204px (expanded) tall, down from 0, and spans the cover edge.
- **FORMS-02:** the direct Settings fieldset gets 16px or 20/24px padding. The inset is 17px compact and 25px expanded (was 1px).
- **FORMS-03:** non-button links in `.pt-auth` use the forest ink and green hover. Computed color is `rgb(31, 90, 60)` (was `rgb(0, 0, 238)`).
- **FORMS-04:** the inbox heading wrapper gets an intrinsic flex basis, so Refresh wraps below "Messages". Overlap is 0 at 801, 1024 and 1280 (was 67×35px at 801).
- **Test:** `e2e/forms-formatting.spec.ts`.

### MSG-UX-01: Empty Messages details column (user-reported)
**Fix:** the details aside renders only with content: Participants when there are more than 2 people (per your direction), or the local demo plan. Otherwise `.is-two-pane` gives 26/74 columns, so the chat fills the gap. DESIGN.md is updated. **Verified:** columns are 302/860px at 1280; no overflow; bubbles stay capped. **Test:** `e2e/messaging-persistence.spec.ts` (direct chat has no aside and fills the edge; 3-person group lists all 3). The fixture group gains a third member, Casey.

## Nitpicks (P3, not fixed)
- Messages · at 801px the inbox names and timestamps truncate heavily in the 26% column. This was not in scope; the 26/48/26 split is prescribed by DESIGN.md.
- All areas · `404` console noise from the missing favicon (known).

## Design questions for you
- Events · should the legacy "Old Company interest and compatibility opt-in do not enroll you" note stay user-facing at all? It is now a quiet footnote. It could be removed once no users have old consent.

## Changes made

| File | Change | For |
| --- | --- | --- |
| `src/auth/AuthScreen.tsx` | Removed "New to Pebble? Create an account" (your explicit request during the Codex run) | User edit |
| `src/auth/account.css` | Forest link and hover colors scoped to `.pt-auth` | FORMS-03 |
| `src/features/prototype/profile.css` | Presence-dot selector excludes the avatar | FORMS-01 |
| `src/features/prototype/settings.css` | Fieldset body padding | FORMS-02 |
| `src/features/messaging/messaging.css` | Heading wrapper flex basis | FORMS-04 |
| `src/features/prototype/calm.css` | Community bell positioned in the existing toolbar | UX-COMMUNITY-01 |
| `src/features/prototype/home-preview.css` | Expanded Home focal size and action width | UX-HOME-01 |
| `src/features/events/client.ts` | Multi-day / cross-year `eventDate` | EVENTS-UX-02 |
| `src/features/events/EventGroupQueue.tsx` | Purpose / status / actions / notes structure | EVENTS-UX-01 |
| `src/features/events/events.css` | Queue spacing and action row; themed title links | EVENTS-UX-01, EVENTS-UX-03 |
| `src/features/prototype/matchmaking.css` | Scoped preferences-editor density rules | MATCH-UX-01 |
| `src/features/messaging/Feature.tsx` | Details aside only with content; Participants only for >2 people | MSG-UX-01 |
| `src/features/prototype/messages.css` | `.is-two-pane` 26/74 columns | MSG-UX-01 |
| `docs/DESIGN.md` | Messages details-column rule | MSG-UX-01 |
| `e2e/messaging-fixture.ts`, `e2e/messaging-persistence.spec.ts` | 3-person fixture group; two-pane and Participants assertions | MSG-UX-01 |

Tests added:
- `e2e/community-toolbar.spec.ts`
- `e2e/forms-formatting.spec.ts`: Codex wrote it; Claude fixed a strict-mode avatar locator and a loading-header race.
- `e2e/matchmaking-preferences-layout.spec.ts`
- `tests/events-dates.test.ts`

The delta for this pass alone is `patches/ux-pass.patch`; `patches/pre-ux-working-tree.patch` is the starting state. `git diff --stat` for the whole working tree, including the earlier run: 23 files changed, 354 insertions(+), 60 deletions(-), plus 8 new test files.

## Checks
- `pnpm typecheck`: pass. `pnpm lint`: pass. `pnpm build`: pass.
- `pnpm test`: 50 files, 324 tests pass, including 4 new date tests.
- e2e (`e2e-vs-baseline.sh`, after MSG-UX-01): 116 passed, 20 failed. 19 are the baseline. The 20th, `build-purchases.spec.ts` at 320px, is a timing-sensitive pixel-buffer comparison: it passed in the previous full run and 15/15 in isolation (`--repeat-each=5`). The new specs pass 45/45 with `--repeat-each=3`; the messaging, forms, responsive and connections specs pass 28/28.
- One unit test, `tests/auth.test.tsx` (late email lookup), failed once under full-suite load. It passed in 3 isolated reruns and in the full rerun.
- Browser re-tests: `scratch/lead/after.mjs` is read-only and runs as seeded users. Screenshots are in `screenshots/after/`; metrics are quoted in each section above.

## Not covered
- `/reset-password` expired-link state was not re-shot. It shares the `.pt-auth` link rule verified on the password step.
- Onboarding and registration were not re-shot. No findings touched them.
- Real Android and iOS devices were not tested; only Chromium was.
