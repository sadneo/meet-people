# Deployment plan

Keep the current single-package repository until independent package lifecycles justify workspaces:

- React 19 + Vite static SPA
- React Router in declarative/library mode
- Express 5 API deployed to Cloud Run
- Zod at runtime trust boundaries
- Local Supabase through the CLI and Docker, plus one hosted project
- Firebase Hosting for static files and same-origin `/api/**` rewrites
- GitHub Actions for checks and version-tag releases through Google Workload Identity Federation

Current scope excludes Capacitor, hosted staging, TanStack React Query, browser-direct Supabase access, and end-user authentication. Add them only when the project needs them.

## Phase 1: React Router And Zod

### Packages

Add immediately:

```bash
pnpm add react-router zod
```

Do not add React Router framework mode or `@react-router/dev`; the existing Vite SPA only needs declarative routing.

### React Router setup

1. Wrap the application in `BrowserRouter` in `src/main.tsx`.
2. Define routes in `src/App.tsx` or a small `src/routes.tsx` if `App.tsx` becomes unwieldy.
3. Start with only:
   - `/`: home/readiness page
   - `*`: not-found page
4. Keep the current page as the index route.
5. Replace the delayed `/api/hello` side effect with an explicit status component or remove it until a product feature needs it.
6. Configure Firebase Hosting later to serve `index.html` for unknown non-API paths.
7. Verify direct navigation and browser refresh on each route.

Do not create route loaders, generated route configuration, protected-route abstractions, or nested feature layouts before features require them.

### Zod setup

Use Zod only where untrusted data enters the application:

1. Add an API environment schema for `PORT`, Supabase configuration, and deployment-specific values.
2. Validate API configuration once at startup.
3. Add a schema for the `/api/hello` response to prove the frontend/API validation path.
4. Use `safeParse` for HTTP request input so malformed input can produce a `400` response.
5. Use inferred types rather than maintaining separate TypeScript interfaces.
6. Keep server credentials out of browser code, committed files, logs, and test snapshots.

Suggested placement:

```text
src/
  routes/
    Home.tsx
    NotFound.tsx
api/
  env.ts
  index.ts
shared/
  schemas.ts
```

Only create `shared/` when the same schema is genuinely consumed by browser and API code.

### Phase exit criteria

- `/` renders successfully.
- An unknown URL renders the not-found page.
- Refreshing either route works through Vite.
- Invalid environment configuration fails at startup with a readable error.
- `pnpm typecheck` passes.
- `pnpm build` still produces the current frontend artifact.

## Phase 2: Vital Packages

Add packages only when their integration is implemented in the same change.

### Runtime packages

```bash
pnpm add @supabase/supabase-js
pnpm add -D tailwindcss @tailwindcss/vite
```

Responsibilities:

- `@supabase/supabase-js`: server-side Supabase access and local infrastructure smoke tests.
- Tailwind: application styling through the Vite plugin.

For Radix, install individual primitives when the first real component needs them. Do not install every Radix package during scaffolding.

Do not add TanStack React Query. Use direct API calls until a concrete cache or server-state requirement justifies it. Do not add Capacitor or native targets in this plan.

### Development and test packages

Before establishing local quality gates:

```bash
pnpm add -D vitest @testing-library/react jsdom @playwright/test
```

Use:

- Vitest for Zod, route, and API behavior.
- Testing Library for the minimal React route checks.
- Playwright for local browser smoke tests.

Prefer testing the Express application without adding Supertest: export the app, start it on an ephemeral local port, and use built-in `fetch`.

### Tooling

Add one linting setup before CI. Use the normal ESLint flat configuration with TypeScript and React Hooks support. Formatting can remain editor-driven initially; a separate formatter is not required to deploy safely.

## Phase 3: Supabase Local Project

### Initialize

1. Pin the Supabase CLI used by contributors and CI rather than relying solely on the floating Nix package.
2. Run `supabase init`.
3. Commit generated configuration under `supabase/`.
4. Add scripts for:
   - Starting local Supabase
   - Stopping it
   - Resetting the database
   - Generating database types
   - Checking migration consistency

Expected structure:

```text
supabase/
  config.toml
  migrations/
  seed.sql
```

### Initial migration

Create the smallest infrastructure migration:

1. Enable PostGIS.
2. Do not create speculative social, profile, event, matching, or location tables yet.
3. Add tables only after their ownership and row-level security behavior are known.
4. Keep `seed.sql` minimal, deterministic, and safe to rerun.

### Local clients

Create a server Supabase client only when an API endpoint needs database access. The browser talks only to the same-origin Express API; remove public `VITE_SUPABASE_*` configuration and browser Supabase clients.

Use user-scoped credentials and row-level security when user-facing database access is introduced. Reserve the service-role key for explicitly privileged server operations. Never commit or log service-role credentials.

### Authentication and authorization

1. Configure local email authentication for an infrastructure smoke test.
2. Defer browser authentication, redirect URLs, and protected routes until a product feature needs them.
3. Require row-level security on every future user-owned table.
4. Test policies through user-level clients rather than relying only on service-role access.

### Storage and realtime

Defer storage and realtime resources until requirements exist:

- Create storage buckets with explicit access policies when image upload is implemented.
- Add tables to realtime publication only when realtime database changes are needed.
- Use Realtime Broadcast when the first live interaction requires it.

### Generated types

Generate database types from the local schema into a committed TypeScript file, such as:

```text
src/types/database.ts
```

Regenerate after every migration and check for an uncommitted diff during CI.

### Phase exit criteria

- `supabase start` succeeds.
- `supabase db reset` applies every migration and seed from scratch.
- PostGIS is available.
- Generated database types match the migration state.
- The local API or infrastructure smoke test can connect to Supabase.
- Local auth initialization succeeds.

## Phase 4: Local Testing

Define canonical scripts so contributors do not need to know individual tool commands:

```text
pnpm dev
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
pnpm start:api
pnpm verify
```

`pnpm verify` should run the same reproducibility checks as CI:

1. Type-check.
2. Lint.
3. Unit and integration tests.
4. Reset local Supabase and confirm generated types have no diff.
5. Build web and API artifacts.
6. Run the local browser smoke suite against the production-style build.

### Minimum test coverage

- React Router renders `/`.
- Unknown routes render the not-found page.
- Environment schemas accept valid configuration and reject missing values.
- An API input schema rejects invalid data.
- API health endpoint returns success.
- Frontend can load and reach `/api/health`.
- Local Supabase migration reset succeeds.
- One local Supabase authentication smoke flow.

Avoid broad component snapshot suites. Test boundaries and critical flows.

## Phase 5: Define And Run Production Builds

The existing `build` script only type-checks and builds the frontend. Split the production outputs:

```text
dist/
  web/
  api/
```

### Web build

1. Configure Vite to output static assets to `dist/web`.
2. Keep API requests relative, such as `/api/health`, because Firebase will proxy them.
3. Ensure no server secret appears in generated assets.

### API build

1. Introduce a server-specific TypeScript configuration.
2. Compile `api/` and any genuinely shared schemas to `dist/api`.
3. Run the artifact using Node, not the development watcher.
4. Read `PORT` from the environment.
5. Listen on `0.0.0.0`.
6. Add `/api/health`.
7. Handle termination signals so Cloud Run can stop the process cleanly.
8. Use Express’s built-in JSON middleware when request bodies are introduced.

### Container build

Create a multi-stage Dockerfile:

1. Install dependencies using the frozen pnpm lockfile.
2. Build the API.
3. Copy only production runtime dependencies and API output into the final image.
4. Run as a non-root user.
5. Start the compiled API with Node.
6. Add `.dockerignore`.

### One-off verification

Before creating any pipeline:

1. Run `pnpm verify`.
2. Build the API container locally.
3. Run it with `PORT=8080`.
4. Request `/api/health`.
5. Build the frontend.
6. Serve `dist/web` locally.
7. Run Playwright against the production-style local setup.
8. Inspect the web artifact for accidental server secrets.

This phase establishes and documents how builds work before automating them.

## Phase 6: Hosted Environment

Create one hosted Supabase project and one Google Cloud/Firebase project for the deployed application.

### Supabase

1. Record the project reference without committing credentials.
2. Apply committed migrations with a direct database URL; do not create a persistent CLI link.
3. Verify PostGIS.
4. Confirm row-level security before adding application tables.
5. Store the database URL as a GitHub Actions secret only. Store any server-only Supabase credentials in Secret Manager only when an API feature requires them.

### Google Cloud

1. Create an Artifact Registry repository.
2. Enable Cloud Run, Artifact Registry, and required build APIs.
3. Create one GitHub deploy service account with only the Artifact Registry, Cloud Run, Firebase Hosting, and Secret Manager permissions this release needs.
4. Configure GitHub OpenID Connect and Workload Identity Federation for the repository. Do not store service-account JSON keys.
5. Add a GCP budget alert.

### Firebase Hosting

1. Initialize one production Hosting site for `dist/web`.
2. Commit `firebase.json` and select the Firebase project explicitly in CI.
3. Add rewrites in this order:
   - `/api/**` to the Cloud Run service with explicit `serviceId`, `region`, and `pinTag`.
   - All remaining paths to `/index.html`.
4. Allow unauthenticated Cloud Run invocation so the Hosting rewrite works. Protected application routes will authenticate in Express when they exist.
5. Verify direct route refresh and same-origin `/api/health` access without browser CORS configuration.

## Phase 7: Continuous Integration And Release

Create one GitHub Actions workflow for pull requests, `main`, and pushed `v*` tags:

1. Check out the repository and install the declared Node and pnpm versions.
2. Run `pnpm install --frozen-lockfile`.
3. Run `pnpm verify`, including the local Supabase reset/type check and production-style browser smoke test.
4. Build the API container without pushing it.
5. Upload test reports only on failure.
6. Protect `main` by requiring this workflow before merge.

Use action and package-manager caching. Do not cache `node_modules`.

On a pushed version tag such as `v0.1.0`, continue only after these checks pass:

1. Authenticate to Google Cloud through the deploy service account and OIDC.
2. Build and push an immutable API image tagged with the Git commit SHA.
3. Apply migrations with `supabase db push --db-url "$SUPABASE_DB_URL" --yes`.
4. Deploy that image to the single Cloud Run service.
5. Deploy `dist/web` to the single Firebase Hosting site.
6. Request `/api/health` through the Firebase origin.
7. Record the URL, commit SHA, image digest, and migration version in the workflow summary.

Avoid destructive migrations in the same release as code that depends on them. Cloud Run revisions can overlap briefly, so keep changes additive when possible. If an applied migration causes a problem, fix it with a new forward migration rather than attempting an automatic rollback.

### Release recovery

Document how to redeploy the prior Cloud Run revision and Firebase Hosting release. Do not add formal recovery drills, database restore drills, secret-rotation procedures, dashboards, tracing, or alerting beyond default logs, the health check, the deployment smoke test, and the budget alert until the project has real users.

## Documentation Deliverables

Once the release has been proven, document:

- Required tools and versions
- `nix develop`
- `pnpm install --frozen-lockfile`
- `pnpm dev`
- Local Supabase startup and reset
- Environment variable names and whether each is server-only or a GitHub secret
- Local verification command
- Production-style local build commands
- Tag-based releases
- Troubleshooting for ports, Docker, Supabase, Firebase, and Cloud Run

Do not document guessed deployment commands. Add them after Phase 7 has successfully run.

## Completion Definition

Scaffolding is complete when:

- React Router and Zod are integrated and tested.
- Vital runtime packages have real initialization points.
- Local Supabase can be recreated from committed migrations.
- `pnpm verify` passes from a fresh checkout.
- Web and API production artifacts build locally.
- The API container runs locally.
- Pull requests receive automated reproducibility checks.
- A pushed version tag runs checks, applies migrations, and deploys the hosted application.
- The deployed application passes a same-origin health smoke test.
- Setup and release instructions reflect commands that have actually been executed.
