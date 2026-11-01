# Real-user coverage matrix

Use `coverage` actions with `{feature, scenario, status, evidence, notes}`.
Statuses: `passed`, `failed`, `blocked`, `not-tested`, `expected-rejection`.
A screenshot alone is not a persistence assertion. A passing smoke is not a full
product audit. Two testers cannot promise exhaustive coverage of every state.

| Area | Required scenarios | Main tester |
| --- | --- | --- |
| Auth | Email-first signup, confirmation, password login, wrong password, logout, private-route gate | Both |
| Onboarding | All chapters, invalid/missing input, interest limits, weekly time, timezone, reload/resume | Both |
| Profile | Save/readback, Cancel, photo upload/remove, visibility, preview, username | A |
| Friends | Setup, trusted area, skip/undo, request, acceptance/decline, persisted state | A |
| Dating | Identity vs search, pause/start consent, eligibility, skip/undo, like/like-back | B |
| Social | Two-user send/receive, unread/read indicators, reload, retry behavior, duplicate sends | Both |
| Safety | Report validation, block/unblock, disconnect and post-removal access (coordinated last) | B |
| Settings | All categories, switches, save/readback, keyboard navigation | A |
| Events | Filters, list/detail, Close/Back, queue join/leave, unavailable proposal guidance | A |
| Garden | Load, local interactions, inventory controls, scope of persistence | A |
| Mobile | 320px, 390px, scrolling, fixed controls, modal focus/Escape, touch reachability | Both |
| Desktop | 1280px, sidebar, two-pane chat and focused editor layout | A |
| Errors | Expected validation/401/429 vs genuine 5xx, console exceptions, inaccessible recovery | B |

Not included by default: production, real Google/device/provider permissions,
email delivery outside Mailpit, paid APIs, external images, real phones/native
apps, 500 concurrent users, account deletion/export, or unimplemented features.

Bug evidence must include current viewport, role, route, action sequence,
expected/actual result and the screenshot path. Findings need coordinator
deduplication and independent reproduction before being called confirmed.
