# Account profile separation and Dating views

## Implementation and activation status

The frontend, authenticated account-profile HTTP/RPC wiring, and compatibility
adapter are implemented in source. Database support is a **review candidate only**:
it has not been installed or executed. Dating is a disabled frontend view with no
connected backend. No database, queue algorithm, embedding service, or provider
has been activated as part of this work.

## Account profile and matching preferences

The forest Profile and Settings paths link to `/profile/account`. This route uses
the real session gate rather than a prototype login. Names, username, bio, and
avatar belong to the canonical account profile; matching preferences are separate.
The account editor never derives identity from email, anonymous metadata, or
prototype profile fixtures.

The authenticated account endpoints are `GET` and `PUT`
`/api/matchmaking/account-profile`, mapped to fixed `get_account_profile()` and
`save_account_profile(profile_in jsonb)` RPCs. The API validates exactly
`{username, display_name, bio, avatar_url}` and uses the existing verified actor
transport. A successful save requires a validated persisted response. Missing
RPCs and failed saves produce explicit unavailable/error states, not local
persistence or a fabricated successful save. A supported backend with no account
profile opens a blank identity form for explicit user entry.

Matching preferences handle the transition through an adapter boundary:

- While checking account compatibility, preference saving is disabled.
- When canonical account support is available, editable identity fields are
  removed from matching preferences. The editor links to Account profile and
  states that identity comes from that profile. A missing canonical account blocks
  preference saving with the prerequisite: “Save an account profile before
  matching preferences.”
- The current Friends backend still requires the full legacy profile shape.
  The adapter supplies validated canonical account identity alongside birthdate,
  area, interests, and weekly availability to that existing save contract.
- When account-profile support is unavailable, the editor explicitly describes
  legacy compatibility and retains the required legacy identity fields. This
  preserves real Friends saves without hiding required fields and submitting an
  invalid legacy payload. Such a save is not presented as a canonical account save.

Existing `profiles` data, matching tables, old matching RPC names and payloads,
Friends queue behavior, and ranking algorithm remain in place. Account saves have
no browser/Express dual-write fallback. Other local social/onboarding previews do
not become canonical account identity.

## Migration and SQL behavioral test candidates — unapplied

The exact candidate files are:

- [`docs/account-profile-matching-migration.sql`](account-profile-matching-migration.sql)
- [`docs/account-profile-matching-migration-README.md`](account-profile-matching-migration-README.md)
- [`tests/account-profile-matching.sql`](../tests/account-profile-matching.sql)

All are **unapplied and SQL-unexecuted**. No `supabase/**` file was edited. The
parent owns review, disposable-database validation, and any separately approved
installation.

The migration candidate adds an actor-owned account identity table and restricted
RPCs. It proposes backfilling only valid existing legacy identities, retaining
invalid legacy rows for explicit correction. It does not create identity from Auth
signup metadata or fabricate matching profiles. After installation, canonical
identity would be projected to existing `profiles` identity columns so existing
algorithms can continue to consume them. A projection trigger would prevent stale
legacy identity writes from replacing canonical identity. Account saves would not
create a missing matching profile or modify interests, availability, coordinates,
or queue enrollment.

The SQL test candidate covers identity round trips, invalid/extra fields,
authentication, RLS isolation, anonymous denial, legacy compatibility, projection,
and conflict rollback. These are authored assertions, not execution evidence.
Syntax, grants, trigger interactions, backfill, concurrency, and SQL/Zod validation
parity still require parent validation described in the candidate README.

## Friends and Dating views

Active `/matchmaking` is **Friends only**, with no segmented control or Dating
destination. `/matchmaking?view=dating` safely renders the normal Friends screen;
the ignored query is not a queue enrollment, cancellation, switch, or automatic
result lookup. Normal Friends status/profile/notification reads remain available.

Only `/downtime-matchmaking` has accessible native segmented links for Friends
and Dating. Friends is the default, including unknown `view` values.
`/downtime-matchmaking?view=dating` selects Dating; other query parameters are
preserved when switching. Native URLs support direct links, refresh, history,
Back/Forward, and keyboard activation. The shell moves focus to the current
heading when the URL query changes. Downtime Friends retains its existing queue,
profile, preferences, and manual matching flow.

Following the corrected visual direction, Dating uses the existing ivory/forest
matching composition with **PixelPebble as its focal point**. A small rose/berry
heart thought accent sits beside the Happy mascot; the decorative artwork is
hidden from assistive technology. Semantic classes are `dating-mascot` and
`dating-heart-thought`. There is no standalone pale landing card or oversized
heart. The heading is “Dating in your downtime,” with the concise purpose:
“Free time in common, room for a little spark.”

There is one disabled action, **Find a date in your downtime**, described by the
explicit **“Dating backend not connected”** status. The Friends/Dating links
remain available for keyboard navigation.

There are no fake profiles, matches, swipes, countdowns, or dating results. Dating
does not mount `useMatchmaking`; the shell also suppresses matching notifications
on downtime Dating URLs. It makes no matching or dating API/queue/RPC/provider calls and does not
mutate the Friends queue. Returning to Friends resumes the existing confirmed
status/profile loading and manual matching flow.

## PixelPebble expression repair

PixelPebble now renders exactly one Happy or Thinking image. Initial rendering
uses the requested expression at full opacity. Subsequent changes replace that
image and can reveal the new expression coherently; two faces cannot crossfade or
occupy a mixed-image frame. Reduced motion disables the reveal animation.

Authenticated matching waits for confirmed queue status before rendering its
expression. Idle uses Happy; an enrolled queue uses Thinking. Transport loading
alone does not change a confirmed idle expression. This avoids the wrong-face
flash during active/downtime navigation and reload. No `setTimeout` workaround was
introduced for the repair.

## Recorded verification

Results below distinguish the original implementation, the browser-test repair,
and the latest product-direction correction. The full suites were last run before
the visual correction; focused regression coverage and build were rerun afterward.

| Slice/check | Recorded result |
| --- | --- |
| Dating component RED → GREEN | 6 expected missing-feature failures → 6 passed |
| Account UI/preferences RED → GREEN | 9 failures → 9 passed |
| Account API RED → GREEN | 3 missing-route failures → 3 passed |
| Mascot RED → GREEN | 3 failures → 3 passed |
| Browser query-navigation focus | Expected focus failure, then feature suite GREEN |
| Original focused isolated feature browser suite | 13 passed |
| Corrected Friends-only/downtime component RED → GREEN | 5 expected behavior failures, 1 pass → 6 passed |
| Corrected browser RED → GREEN | 2 expected failures at 390px → complete focused feature suite 14 passed |
| Latest focused unit regression suite | 51 passed across 7 files, including account, mascot, Friends and routes |
| `pnpm typecheck` | Passed |
| Last full `pnpm verify` (before visual correction) | Typecheck and lint passed; 177 unit tests passed, 1 failed; build not reached in that command |
| Last full isolated browser suite (before visual correction) | 107 passed, 3 unrelated failures out of 110; both feature-related failures fixed |
| Latest `pnpm build` | Passed: typecheck, web production build and API TypeScript build |
| SQL candidates | Not executed or installed |

Focused commands used:

```text
pnpm test --testNamePattern='active Friends only|downtime Dating deep link|downtime preserves other|downtime defaults unknown'
pnpm test --run tests/dating-views.test.tsx tests/account-profile-ui.test.tsx tests/account-profile-api.test.ts tests/pixel-expression.test.tsx tests/matchmaking-integrated.test.tsx tests/downtime-matchmaking.test.tsx tests/routes.test.tsx
pnpm test --testNamePattern='account UI|separated preferences|compatibility preferences'
pnpm test --testNamePattern='account API'
pnpm test --testNamePattern='account API|account UI|separated preferences|compatibility preferences'
pnpm test --testNamePattern='mascot initializes|mascot active waits|mascot downtime waits'
pnpm test:e2e --config=playwright.isolated.config.ts e2e/account-dating-views.spec.ts
pnpm test:e2e --config=playwright.isolated.config.ts
pnpm verify
pnpm build
```

The dedicated browser configuration uses isolated port **3194** (`E2E_PORT` defaults
to 3194 and rejects other ports), refuses server reuse, and launches only the local
browser test process. Its Vite configuration disables environment-file loading,
the API proxy, and real authentication. Browser fixtures intercept authenticated
session/API behavior; unmocked backend requests receive unavailable responses.

### Known failures and unverified behavior

- The unrelated `tests/community-history.test.tsx` failure expects
  `translate(379 300)` but the scene renders `translate(724 595)`. It appeared in
  the initial broad test run before feature implementation.
- Two full-suite Community browser tests fail cumulative-object assertions.
- The isolated API-health test expects a real healthy API; the isolated process
  returns backend-unavailable instead.
- The former ambiguous `Preferences` locator is fixed with exact accessible
  names and dialog-scoped controls. A held save response verifies pending controls,
  the full payload, dialog dismissal, and focus return without timing workarounds.
- Settings browser coverage now verifies the intended Account Profile route from
  both Settings and Profile, signed-out gating, Back navigation, retained settings,
  and the remaining blocked-users dialog's focus return. Both repaired tests
  passed in the last full run.
- Real installed-database behavior remains unverified. The recorded full
  verification is not all GREEN because of the unrelated failures above.

Screenshots were captured outside `test-results` at:

```text
/tmp/opencode/downtime-dating-mascot-{320,390,800,801,1440}.png
/tmp/opencode/active-friends-only-{320,390,800,801,1440}.png
/tmp/opencode/account-profile.png
/tmp/opencode/matching-canonical-preferences.png
/tmp/opencode/matching-legacy-compatibility.png
```

The corrected browser matrix covers active Friends-only fallback and downtime
Dating at 320, 390, 800, 801, and 1440px. Checks include horizontal overflow,
keyboard, history, refresh, one disabled Dating action, focal mascot presence,
small decorative-heart proportions, and absence of matching requests on Dating.
An enrolled downtime Friends queue survives Dating switching and reload with no
background mutations or result lookups. Screenshot readback was denied by harness
permissions, so visual inspection was not completed.

## Operational boundary

No database installation, migration application, Supabase action, embedding or
provider activation, Gemini request, credential access, or real provider/API
request occurred. The migration and SQL assertions remain parent review/install
candidates. No commit, push, PR, deployment, managed-service change, or subagent
use occurred; browser checks used only isolated local test processes.
