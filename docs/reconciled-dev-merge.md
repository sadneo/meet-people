# Reconciled branch / dev merge review

## Release branch integration (2026-10-19)

Merged `origin/dev` at `940b9ea` into `feat/mvp-deploy-final` for PR #21.
Kept the incoming canonical profile, Friends, Dating, safety and actor-scoped
social implementation. Retained the release branch's CI/CD, Firebase configuration,
deployment scripts, worker wiring, authenticated embedding endpoint and historical
database migrations; dev's deletion of these files would break the existing release
pipeline or remove already-deployed migration history. Restored hosting package
scripts and their referenced checks. This merge does not install the candidate SQL
files under `docs/` or claim those capabilities are available in production.

Verification: frozen dependency install and `pnpm build` pass (web and API).
`pnpm verify` stops at lint: 91 errors, 6 warnings in the combined tree.
Separate `pnpm test`: 860 passed, 39 failed, plus one suite-load failure
(`dating-candidate.test.ts`, file-URL handling); 106 test files pass and 10 fail.
Failures include auth UI expectations and retired matchmaking preference controls.
No check was disabled to accept the merge. Production release remains blocked on
verification and review; no release tag was pushed by this integration.

2026-10-19. Merge of dev `5c5390e` into `feat/reconciled-ui-baseline` after PR20
reported conflicts. This updates the feature branch only; it does not merge the PR
into dev or activate schema elsewhere.

## Resolution decisions

- Retain canonical account/onboarding, Friends filters/real queue/manual candidate,
  reciprocal opted-in Dating, private profile photos and owner-bound safety/social
  API contracts. Do not restore the older separate account/messaging services or
  the retired preference dialog, Profile promotions, refresh/device-status controls.
- Retain incoming public Events browsing at `/explore`, public list/detail links,
  event fetch/date/retry fixes and Events rate limiting. Private `/events`, matching,
  Profile and messaging retain their signed-in gate; public browsing does not enroll
  anyone in an event group or expose private product navigation.
- Combine incoming API no-store protection and Events limiter with the current
  authenticated social/matching routers; do not restore the deleted admin-backed
  Auth router as a shortcut around the documented email-first login gate.
- Retain incoming account 401 recovery, refreshed-token fencing, messaging denial,
  polling/pagination and two-pane layout fixes. Preserve bearer tokens in the tests.
- Retain useful incoming safe back-navigation from another person's profile.
- Port repeated validation-error focus into the current shared-preference editor;
  port custom-interest remove/reselect coverage into canonical Profile controls.
  Saved custom chips remain available during an unsaved edit, so removal is reversible.
  Adapt incoming account fixtures to the current canonical readiness schema.
- Restore the incoming mocked messaging fixture/browser suite because incoming
  formatting tests import it, and it still describes supported frontend contracts.
  It is explicitly synthetic UI evidence, not real group/database capability proof.
- Retain incoming ignore rules, QA documentation/artifacts and nonconflicting UX
  fixes. Do not rewrite archived QA patch/log evidence to normalize whitespace.

## Verification actually executed

- `pnpm install --offline --frozen-lockfile`: initial sandbox store access denied;
  escalated retry installed cached additions but exited on missing offline registry
  metadata. `pnpm install --frozen-lockfile` then completed successfully. No lockfile
  resolution changes beyond the merged express-rate-limit dependency.
- `pnpm --config.verify-deps-before-run=false typecheck`: PASS after dependency install.
- `pnpm --config.verify-deps-before-run=false exec tsc -p tsconfig.api.json --noEmit`: PASS.
- `pnpm --config.verify-deps-before-run=false exec tsc -p tsconfig.demo.json --noEmit`: PASS.
- `DEBUG_PRINT_LIMIT=0 pnpm --config.verify-deps-before-run=false exec vitest run --configLoader runner --config vite.isolated.config.ts --environment jsdom tests/account-recovery.test.tsx tests/profile-editor.test.tsx tests/routes.test.tsx tests/messaging.test.tsx tests/matching-validation-focus.test.tsx tests/profile-interests.test.tsx tests/find-friends.test.tsx tests/dating-views.test.tsx`: **104 PASS**.
- `pnpm --config.verify-deps-before-run=false exec vitest run --configLoader runner --config vite.isolated.config.ts --environment node tests/events-client.test.ts tests/events-dates.test.ts tests/social-api.test.ts tests/dating-api.test.ts tests/demo-seed.test.ts`: **40 PASS**.
- `pnpm --config.verify-deps-before-run=false test:e2e --config worktree/friends-light-review/playwright.config.ts e2e/profile-settings-visual.spec.ts e2e/public-pages.spec.ts e2e/messaging-persistence.spec.ts --grep 'Profile handoff (390x844|1440x900)|marketing and legal pages at (390|1440)px|saved messaging UI at (390|1280)px'`: **6 PASS**. Actual screenshot inspection of mobile Profile footer and desktop Messaging. Mocked/isolated Auth/API, not live database testing.
- `git diff --check`: PASS for unstaged resolutions. Staged check excluding `qa/**`
  PASS. Full staged check reports inherited whitespace in incoming archived QA
  patch/log files; these were deliberately retained unchanged.

The separately executed unchanged `tests/matchmaking-integrated.test.tsx` legacy
suite has **17 PASS / 11 FAIL**. Failures target retired dialog controls, “Refresh
status,” “On this device,” and “Save preferences.” This is not an all-green suite.
Current-flow coverage above passes; the legacy suite still needs migration rather
than restoring controls explicitly removed by the product brief. The two incoming
validation-focus cases were moved to `tests/matching-validation-focus.test.tsx`
and exercise the current component without weakening canonical validation.

Full unrelated suites, production build, Android/emulator, live Auth/matcher/photo
flows and SQL/race activation were not rerun for this source merge. Existing local
demo and documented ordinary-login/native callback/rollout gates remain. No database,
provider, credential/environment file, protected worktree or deployment action was
performed to resolve these conflicts. No force push or rebase is needed.
