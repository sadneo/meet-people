# Public visitor frontend

Scope: Yaozhou's marketing, signed-out Events, legal drafts, and entry into the
existing authentication flow. No backend, authentication, onboarding,
matchmaking algorithm, messaging integration, Android, or deployment changes.

## Routes and design

- `/`: marketing for guests; the existing Home for signed-in users.
- `/events` and `/events/:id`: the existing Events components and API contract,
  with public navigation for guests and the existing app shell for members.
- `/terms`, `/privacy`, `/cookies`: public, including when signed-in account
  loading fails or onboarding is incomplete.
- `/home`: preserves the existing Home preview for direct UI review. It is
  not linked from the public landing page. Guest Home links to `/` now return
  to marketing. Signed-in Home remains `/`.
- `/register?returnTo=…` and `/login?returnTo=…`: unchanged auth forms. Event
  signup/sign-in keeps the selected event through the existing returnTo flow.

The public layout only supplies navigation, readable content width, footer and
focus/scroll handling. It reuses `Brand`, the original Pebble artwork, `.pt-button`, the existing
font stack and semantic product tokens. It does not mount the prototype store
or developer panel for guests. A single member workspace stays mounted across
signed-in product routes, preserving existing session state.

Design plan: tan `#DDCABC`, forest `#1F5A3C`, muted forest `#425B49`, berry
`#D93467`, pale green `#EAF5D9`, and off-white `#FFFEF9`, all from existing tokens.
Trebuchet/Segoe UI retain the product's typography. The large left-aligned
headline faces a green pouch collecting different pixel Pebbles. A short story
about shared time and plans leads to a wide Community media stage and final
signup action. Mobile stacks the artwork and story.
No statistics, endorsements, fictitious events or live-presence claims.

```
Brand                                  Events  Sign in  Get started
Find a little time in common.           Animated Pebble pouch
Get started / Explore events
Shared time story                      Event discovery story
            Community build-up media (16:9)
                       Create an account
Brand                                  Terms / Privacy / Cookies
```

Review against the brief: keep the supplied character as the focal point;
avoid decorative feature cards or a second design system. Public layout uses
the existing 800px breakpoint, fluid spacing, real links and keyboard focus.

### Marketing motion and video replacement

The signed-out landing's motion is isolated in `MarketingMedia.tsx` and
`marketing.css`. The pouch uses a 12-second CSS timeline: four original sprite
crops arrive alternately from left/right on integer-position, stepped frames.
Only the SVG pouch (not raster sprites) squashes on each landing. The foreground
pouch hides the falling sprites, so the loop resets out of sight.

The Community fallback is an illustration assembled from original terrain and
sprite assets. A 16-second CSS sequence adds nature, buildings and friends,
holds the finished world, then fades through the reset. It does not mount the
app Community, mutate state, or imply real account activity. It pauses offscreen.
The page's motion control pauses both scenes. Reduced motion stops animation and
shows a completed Community illustration. No animation timers or React frame loops.

An optional Vite asset glob detects `src/assets/public/community-demo.mp4`.
When available, it replaces the illustration with a muted inline looping video;
reduced motion, manual pause and offscreen visibility all stop playback. Video
errors return to the illustration; blocked autoplay offers a play button.
See `src/assets/public/README.md` for export specifications and exact replacement
steps. No real recording is supplied yet.

Visual review captures: `output/marketing-motion-review/` includes mobile,
1280px, 1440px and 2560px layouts, individual pouch landing/personality frames,
and reduced motion. The focused motion check is `e2e/marketing-motion.spec.ts`.

## Events integration and Winson handoff

The inspected current `api/events.ts` already exposes list and detail GETs
without authentication. No public-backend implementation was added here.
The existing `eventRequest` sends a bearer token only when a session exists.

- `GET /api/events?page=1&category=…`: validates with `EventsResponseSchema`.
  Optional distance requests add latitude/longitude only after a user click
  and successful browser permission.
- `GET /api/events/:id`: validates with `EventSchema`.
- Public event details show signup and sign-in links rather than mounting a
  signed-in group queue. They never call private matching endpoints.
- Signed-in event details still mount the original `EventGroupQueue`.
- No data is seeded or copied into production. 401/429/503/network/malformed
  responses show unavailable/retry states. Empty results remain empty.

Winson: confirm the deployed service exposes both anonymous GET routes, returns
the shared schemas, and keeps private company/group actions authenticated.
Confirm `listings`, `event_categories`, and `event_interest_counts` are ready,
populate real upcoming events, and add the planned public-endpoint rate limit.
This checkout has no public rate-limiter in the Events router. The local app
has no `.env.local`; real listings cannot be verified here until configured.

## Aidan handoff

- Keep the existing `/register`, `/login`, `/onboarding` and callback flow.
  Rehearse a real email confirmation and Google sign-in returning to
  `/events/:id`; frontend tests cover only routing/form handoff, not delivery.
- Confirm production serves the SPA on direct loads of `/`, `/events/:id`,
  `/terms`, `/privacy`, `/cookies`, and `/register`; route `/api/*` to the API
  instead of the SPA. No verified host configuration is in this checkout.
- Configure Supabase browser/API values and callback allowlists on the actual
  deployment. Public UI has no production session bypass.
- Existing auth copy says “Back to home preview” and includes local-mail-viewer
  wording in confirmation messages. These are now misleading at the public
  entry and remain an auth-owner copy follow-up, not edited here.
- Existing `quick-login-production-build.test.ts` expects “Send sign-in link”,
  while the routed AuthScreen is email/password. Review that stale expectation;
  no unrelated test was weakened in this pass.

## Legal drafts and storage

All content is in `src/features/public/legal-content.ts`. Replace
`legalPublication.operator` and `legalPublication.contactEmail` after team
confirmation. Both intentionally read `[TO BE CONFIRMED BEFORE PUBLICATION]`.
Visible pages use concise policy copy without a Draft banner. Publication
blockers and review status are tracked in `LEGAL-HANDOFF.md`; no professional
review or regulatory compliance is claimed.

The factual inventory covers Supabase identity, account/profile and availability,
matching/group participation, in-app notifications, sample/local messaging,
optional event-distance location, remote images, guest Community storage, and
display preferences. No analytics/advertising SDK or direct application cookie
writer was found. No tracking or consent-preference store was added.

Storage inventory:

| Storage | Current behavior |
| --- | --- |
| Supabase `sb-…-auth-token` | Default persisted Auth session; provider configuration controls session duration |
| `pebble:full-ui:community:v1` | Guest app preview balance, upgrades, object positions; not mounted on guest public pages |
| `pebble.matchmaking-display-preferences` | Explicitly saved device preferences |
| `pebble.matchmaking-profile` | Legacy preview reader, if old data exists |
| Event filters | URL search parameters |
| Optional event-distance location | In-memory frontend state; coordinates are sent in request URL |

No analytics-consent banner was warranted by the inspected frontend. This is
not a jurisdictional legal determination or a claim that all functional storage
is exempt. Before publication, confirm the operator/contact, applicable legal
requirements, actual hosting/third-party cookies, operational logging,
retention/deletion/export procedures, and provider inventory. Public pages do
not add optional storage; existing product storage is not modified.

Reference checks: [Supabase Auth default session storage](https://supabase.com/docs/reference/javascript/auth),
[ICO storage and access guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/cookies-and-similar-technologies/).
The latter informs the caution around storage, not a claim of UK jurisdiction
or compliance. Primary evidence is the code paths above, `src/supabase.ts`,
`shared/account.ts`, `shared/matchmaking.ts`, and `src/routes/PebbleApp.tsx`.

## Focused verification

Run `pnpm exec playwright test e2e/public-pages.spec.ts` with the dev server.
The suite covers mobile/desktop layouts, legal links, no guest Community writes,
auth handoff/return path, signed-in Home and workspace retention, Events errors,
filters, keyboard access, reduced motion, and legal access with account failure.
Fixture event captures are named `events-fixture-*` / `event-detail-fixture-*`;
they demonstrate the UI contract, not live database availability.

Screenshots: `output/public-review/`. Existing unrelated Home browser suites
that intentionally inspect guest previews at `/` need their setup migrated to
`/home` or a signed-in session by the audit owner; do not revert the new landing
route to satisfy their old assumptions. The relevant unit route tests retain
their existing preview assertions at `/home` and assert the public root.

### Verification results — October 18, 2026

- Typecheck and final production build pass. The existing large-bundle warning remains.
- Scoped ESLint passes for all changed application and test files. Repository-wide
  lint reports six existing `console` / `no-undef` errors in presentation builders
  under `output/`; those unrelated files were preserved.
- Full unit run: 214 passed, one failed. The failure is the auth wording expectation
  described above. A read-only build using HEAD versions of the changed existing
  application files confirmed the same wording mismatch in the baseline.
- After the final routing adjustment, all 39 relevant tests across seven suites pass.
- All 12 focused browser checks pass in Chrome, including 320, 390, 800, 1280,
  1440 and 2560px widths. Screenshots were visually inspected at mobile and desktop
  sizes; fixture screenshots are explicitly named as fixtures.
- The actual, unmocked local Events endpoint returns 503 with
  `Events service is not configured.` The public page renders its unavailable
  state and retry control. No browser errors were recorded in that runtime check.
- Real signup, email delivery, Google sign-in and production deployment were not
  verified. Those remain Aidan's integration checks; live event availability and
  rate limiting remain Winson's checks.
