# Complete-demo visual consistency review

Reviewed October 29, 2026 against the supplied v125 complete demo, including its
`app.js`, `account-ui.js`, `style.css` and `account-ui.css`. Product authority
remains `docs/DESIGN.md`; sample identities, permissions and successes are not
production features.

## Comparison

Compared the running demo and live local app in Chromium at 390px, with additional
320px and 1280px captures of Garden, Events, Discover, Messages, Profile and
Settings. Inspected Profile’s three editor sections, Friends preferences,
Settings categories, event details and preview/dialog behavior. Existing browser
coverage also exercises login, chat, Requests, safety and onboarding.

Development comparison images are outside the repository under
`/tmp/opencode/demo-audit/` (`demo-*`, `live-*` and `fixed-*`). Different real saved
names, portraits, counts, schedules and areas are not visual defects.

## Corrected differences

| Area | Difference corrected |
| --- | --- |
| Mobile chrome | Removed the extra Updates/Settings toolbar, which changed page spacing and overlapped Garden’s balance. The demo’s page-header destinations remain reachable through Messages and Profile. |
| Desktop navigation | Removed the extra sidebar wordmark that pushed every destination down, and matched sidebar top spacing. |
| Discover | Generic mobile card padding inset portraits by 18px. Restored the full-width card and the demo’s 550px desktop focus width. |
| Profile overview | Restored native gear/chevrons, correct desktop/mobile portrait sizes, and saved search-area/Dating/availability summary text instead of generic descriptions. |
| Profile tabs | Added the missing pressed state; the existing demo stylesheet now actually highlights the selected tab. Removed extra tab icons. |
| Profile editor | Replaced separate large photo/account/facts panels with a compact photo row and one demo-style field surface; matched input size, weight, labels, bio counter, visibility controls and spacing. Kept username in a secondary disclosure. |
| Profile saving | Matched the Cancel-left/Save-right mobile bar above bottom navigation. Core profile and optional facts share this action but retain separate validation, revision and readback checks. Partial success keeps the editor open and explicitly requires reconciliation. |
| Development overlay | Moved the lazy-loaded DEV navigator above the mobile save bar so it cannot intercept Cancel. This fixes an overlap also present in the sample rather than copying it. Production still excludes the navigator. |
| Interests/time | Matched interest chips and custom-entry layout; removed repeated headings; collapsed weekly time-window editing behind an area-style control. Timezone/shared-availability editing remains an explicit, lazy-read disclosure. |
| Dating profile | Separated Profile identity/visibility fields from age, targets and search-area controls. Visibility checkboxes sit beside their fields and the profile editor uses the same mobile save bar. Existing pause and identity-transition rules remain enforced. |
| Preview | Reused the real dialog, matched the mode selector, photo hero, public facts and interest sections. Preview explicitly uses saved data and hides private facts. Fixed Tab focus containment, Escape and focus return. |
| Settings | Replaced the long stacked form with the demo’s profile summary and five category rows. Categories have focused forms, real switch visuals, matching chevrons, back navigation and functional preference shortcuts. URL state supports browser Back/reload. |
| Friends preferences | Matched goal chips, compact age columns and collapsed area selection. Unlike the sample, saving remains explicit and area confirmation still uses the real resolver. |
| Event details | Matched title/Close header, cover size/radius, category/date/location hierarchy and a white, full-height mobile surface. Actual group queue/proposal controls remain intact. |
| Desktop Messages | Matched the 330px inbox, warm surface, viewport height and quiet icon-led empty conversation state. |

## Deliberate differences retained

- Existing account contracts allow a 1000-character bio and 30 interests. Old
  saved content is not truncated to the demo’s 300/5 limits.
- Photo storage supports JPG/PNG/WebP up to **5 MB**, not the demo’s 10 MB.
  Change/upload/remove work; no nonfunctional Adjust/crop control was added.
  Photo changes save separately and are labeled accordingly.
- Pronouns and some extra demo visibility/settings categories have no persisted
  contract. No pretend controls or new identity storage were introduced.
- Dating height remains inches, matching the canonical resource and avoiding
  rounding existing stored values. Dating participation is never silently paused
  or enabled to make a form look editable.
- Preview is explicitly **saved** profile data, not unsaved drafts. It does not
  fabricate shared-time overlap without a viewer.
- Real consent, uncertain-write recovery, optional-service errors and group
  proposal confirmation remain visible even when absent from the sample.
- App-store downloads, sample notification permissions/delivery, sessions,
  support delivery, account export/deletion and unsupported planning are not
  presented as working. Real authentication and legal content remain intact.
- The mobile breakpoint remains the product’s 800px requirement rather than
  adopting the demo’s narrower breakpoint.

## Regression checks

`tests/browser/demo-consistency.spec.ts` covers Settings categories at
320/390/800px, pressed tabs, touch-control sizing, save-bar placement, collapsed
availability, preview modes and keyboard focus, Profile/search ownership, Settings
shortcuts, partial-save reconciliation, full-width portraits and event-detail
layout/Close. The existing profile/facts/photo/settings tests were updated for
the new paths and retain persistence assertions.

The visual work does not add migrations, change deployment configuration or
modify seeded personal data.

Verified: 77 browser tests, 406 unit tests, TypeScript, targeted ESLint and the
web/API production build pass. Vite still reports the existing large-chunk
advisory. The six primary destinations have no horizontal overflow at 320px or
1280px in the live browser comparison.
