# Friends active-matchmaking visual port

Daniel's bounded Friends handoff supersedes the old Friends presentation only.
`FriendsPresentation.tsx` and `friends.css` adapt its computed appearance; no
standalone handoff CSS, JavaScript, storage or wrapper is imported.

## Real contracts retained

- `MatchingSetup` still owns a server-profile draft, validated against canonical
  saved identity. Profile remains the editor for identity/location/birthdate.
  Existing Profile labels, including multiline interests, are preserved unchanged.
- New inline custom interests accept at most two whitespace-normalised words and
  40 characters, deduplicate case-insensitively, and retain the 30-interest cap.
- `useMatchmaking` and its client are unchanged. Changed valid preferences save
  before one active join; unchanged preferences do not acquire an extra write.
  Only an authoritative validated save response can satisfy that path. Save errors,
  malformed responses, duplicate/unmount protection and replacement consent remain.
- Availability uses exact existing server windows, Monday–Sunday, 08–12 / 12–17 /
  17–21 / 21–24 in America/New_York. Mixed coverage is exposed as `aria-pressed=mixed`.
  A block edit replaces only its interval, retaining exact portions outside it.
  Clear is explicit. Exact-window editing remains available in a disclosure.
- The supported preferences dialog uses the same server path. Cancel preserves
  the inline draft; an explicit successful dialog save resets it to the confirmed
  profile. No parallel preference store or new localStorage persistence is added.
  The existing explicitly device-only display disclosure is unchanged.
- Results remain manual and single-candidate. No candidate means no fabricated
  person, group, readiness, chat or success. Cancel/leave and read-only status
  reconciliation remain available, including profile-load failure while queued.

## Layout and assets

Friends alone gets an edge-to-edge forest background. Its wrapper cancels host
content gutters; the actual shell still owns navbar placement and safe areas.
`MatchingViews.tsx` adds only the Friends wrapper class to its pre-existing dirty
Dating implementation. Navbar source and Dating behavior/styles are not changed.

On phones up to 430px, period labels sit above their seven cells so the entire
4-by-7 week can retain 44px targets without an internal scroller. Wider layouts
retain the row-label column. Normal page scrolling supports short screens, long
saved labels, expanded exact windows and large text. Scroll margins reserve the
actual host navigation clearance. No drag interception blocks outer scrolling.

The parent supplied the unchanged original and companion at
`public/prototype/friends/`; their filenames, provenance and hashes are documented
in that directory's README. All three decorative companions reuse the same local
sprite, never sample user photos. Pixel rendering, full bounce/rotation headroom
and reduced motion are covered by browser checks. No external image request is
introduced. Existing `src/assets/pebble/**` artwork is untouched.

The 1/2/3 selection is an ephemeral **visual preference only**. It is never sent
or persisted and does not affect single-person queue output. “Make friends. Earn
pebbles.” is artwork copy only: no reward calculation, grant, balance or shop.
Group formation/reveal, peer readiness and chat are intentionally deferred because
the active Friends backend does not expose those contracts.

## Verification and review

Use `playwright.isolated.config.ts` only: its test process disables environment
file loading and real API forwarding. Browser sessions and matching responses
are synthetic fixtures, not a production bypass or real provider request.

Focused unit coverage:

```sh
pnpm test --run tests/friends-presentation.test.tsx tests/find-friends.test.tsx tests/matchmaking-integrated.test.tsx tests/shared-user-profile.test.tsx tests/pixel-expression.test.tsx
pnpm test --run
pnpm typecheck
pnpm lint --ignore-pattern 'worktree/friends-page-handoff-reference/**' --ignore-pattern 'worktree/profile-card-handoff-reference/**'
git diff --check
```

Browser coverage includes `friends-visual.spec.ts`, `matchmaking.spec.ts`,
`main-matching-views.spec.ts`, `account-dating-views.spec.ts`, and
`downtime-layout.spec.ts`. Only obsolete Friends assertions in the pre-existing
dirty acceptance files were updated; their Dating assertions were preserved.

Fresh screenshots outside test-results are written to ignored local evidence
`worktree/friends-visual-review-final-20261018/`: setup, partial availability,
queue, no candidate, fixture candidate, preferences, profile failure and Dating
at 320×568, 375×812, 390×844, 430×932, 800×900 and 1440×900. Separate short-height
and reduced-motion images accompany them. Handoff references and screenshots
remain untracked local evidence, not imported application source.
