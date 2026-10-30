# Alternate frontend integration

For the October 29 local database activation and native UUID messaging adapters,
see [local backend activation](local-backend-activation.md). That later work fixes
missing live feature RPCs; the frontend merge verification below remains its own
historical scope.

`wiring` starts at `origin/main` (`bfbb2a8`) and includes the alternate frontend
snapshot (`108e15a`, cherry-picked as `1df6aff`). The standalone fixture app has
been replaced by React screens in `src/ui`. Normal `pnpm dev` and build commands
now use this frontend; `dev:alt` and `test:alt` were retired.

The retained API clients validate server responses with the existing schemas.
Account persistence uses `useUnifiedAccount`, including readback and concurrent
field checks. Optional facts, detailed settings and Friends/Dating preferences
retain their existing owner-bound resource hooks. Auth callbacks retain explicit
grant parsing, URL scrubbing and server user verification. Photos use the existing
binary upload, private image and revisioned readback routes. Messages use the
conversation APIs and preserve a retry’s client request ID. Safety uses actual
block and report receipts, with the backend’s limited contact-mutation enforcement
stated in the interface.

The normal app never imports the old fixture auth adapter, people queues, fake
chats or simulated notifications. The new garden canvas/renderer is preserved as
an explicitly local creative feature; fabricated weekly social statistics were
removed. Marketing photography remains illustrative. Backend-less support,
account export/deletion, plans, group growth and session management no longer
present simulated mutations.

No API server behavior, SQL, provider settings or deployment was changed. In
particular `feature/events-backend`’s unmerged event/cache changes are not included.
A target without optional resource capabilities shows unavailable states rather
than silently saving in browser memory. Existing environment variables and API
proxying are unchanged, including the native app’s API base URL and callback bridge.

## Validation

Run `pnpm typecheck`, `pnpm build:web`, `pnpm build:api`, `pnpm test:unit` and
`pnpm test:browser`. The browser suite uses the isolated server and mocked
Supabase/API boundaries; it must never contact a live account or database.
It covers account gates, profile save/readback, shared preferences and trusted
areas, Friends queue replacement and manual checks, Dating consent and requests,
public event reads, messages and idempotent retry, safety, garden lifecycle and
responsive layouts. The API and database contract unit tests remain independent.

The checkout has existing full-lint errors in unchanged backend/hooks and test
files (including React ref fences and Node script globals). The new frontend and
safety client are linted separately; these errors do not establish a clean full
repository lint run. Live Auth/database acceptance, production delivery and native
device behavior still require the configured target environment.

### Checks completed for this change

- TypeScript app/API checks and web/API builds passed.
- Retained unit suite: 342 tests in 55 files passed.
- Replacement frontend browser suite: 33 tests passed, including concurrent
  account edits, failed-save draft reconciliation, Friends profile retries and
  normalized password recovery routes in `tests/browser/wiring-regressions.spec.ts`.
- Production artifact smoke: one test passed, using a synthetic loopback API
  configuration and no real database credentials.
- Focused lint for the new UI, safety client and browser tests passed;
  `git diff --check` passed.

Browser screenshots were inspected at 320px and responsive checks also cover
800px and 1280px. Garden purchases retain their local state across navigation
and clear on refresh or sign-out. No deployed/live-database or native-device
acceptance is claimed by these checks.
