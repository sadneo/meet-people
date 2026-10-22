# Public visitor frontend

Scope: Yaozhou's marketing, legal pages, and entry into the
existing authentication flow. No backend, authentication, onboarding,
matchmaking algorithm, messaging integration, Android, or deployment changes.

## Routes and design

- `/`: marketing for guests; the existing Home for signed-in users.
- `/events` and `/events/:id`: unchanged origin/dev app routes. Marketing links
  to Events without supplying its layout or behavior.
- `/terms`, `/privacy`, `/cookies`: public, including when signed-in account
  loading fails or onboarding is incomplete.
- `/home`: preserves the existing Home preview for direct UI review. It is
  not linked from the public landing page. Guest Home links to `/` now return
  to marketing. Signed-in Home remains `/`.
- `/register?returnTo=…` and `/login?returnTo=…`: unchanged auth forms. Marketing links use the existing safe returnTo helper.

The public layout only supplies navigation, readable content width, footer and
focus/scroll handling. It reuses `Brand`, the original Pebble artwork, `.pt-button`, the existing
font stack and semantic product tokens. It does not mount the prototype store
or developer panel for guests. A single member workspace stays mounted across
signed-in product routes, preserving existing session state.

Design plan: cream `#fffdf4`, forest `#1F5A3C`, muted forest `#425B49`, berry
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

`e2e/public-pages.spec.ts` covers marketing, legal links, responsive layouts,
keyboard access, signup/sign-in handoff, and the signed-in Home boundary.
`e2e/marketing-motion.spec.ts` covers pause/resume and reduced motion.
The original app preview remains accessible at `/home`; unit route tests use
that route when exercising the previous guest Home composition.

Events source files, tests, requests and app-shell behavior are inherited from
origin/dev. This branch does not include the Events loading fix, public Events
wrapper, local seed utility or Events-specific browser assertions. The Explore
events links remain because `/events` is still a valid baseline app route.
