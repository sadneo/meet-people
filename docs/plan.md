**Target Architecture**
Keep the current single-package repository until independent package lifecycles justify a monorepo:

- React 19 + Vite static SPA
- React Router in declarative/library mode
- Express 5 API deployed to Cloud Run
- Zod at runtime trust boundaries
- Supabase projects for staging and production
- Local Supabase through the CLI and Docker
- Firebase Hosting for static files and same-origin `/api/**` rewrites
- GitHub Actions for checks, staging deployment from `main`, and production deployment from version tags

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
5. Replace the delayed `/api/hello` side effect with an explicit status component or remove it until the query setup is introduced.
6. Configure Firebase Hosting later to serve `index.html` for unknown non-API paths.
7. Verify direct navigation and browser refresh on each route.

Do not create route loaders, generated route configuration, protected-route abstractions, or nested feature layouts before features require them.

### Zod setup

Use Zod only where untrusted data enters the application:

1. Add an API environment schema for `PORT`, Supabase configuration, and deployment-specific values.
2. Add a browser environment schema for public `VITE_*` values.
3. Validate environment configuration once at process/application startup.
4. Add a schema for the `/api/hello` response to prove the frontend/API validation path.
5. Use `safeParse` for HTTP request input so malformed input can produce a `400` response.
6. Use inferred types rather than maintaining separate TypeScript interfaces.
7. Never expose Supabase server credentials through `VITE_*` variables.

Suggested placement:

```text
src/
  env.ts
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
pnpm add @supabase/supabase-js @tanstack/react-query
pnpm add -D tailwindcss @tailwindcss/vite
```

Responsibilities:

- `@supabase/supabase-js`: browser authentication, database, storage, and realtime access.
- `@tanstack/react-query`: remote server-state requests and cache behavior.
- Tailwind: application styling through the Vite plugin.

For Radix, install individual primitives when the first real component needs them. Do not install every Radix package during scaffolding.

### Mobile packages

After the web application builds and deploys successfully:

```bash
pnpm add @capacitor/core
pnpm add -D @capacitor/cli
```

Add `@capacitor/android` and `@capacitor/ios` only when those native targets will actually be initialized and tested. Capacitor should not block the initial web/API deployment.

### Development and test packages

Before establishing local quality gates:

```bash
pnpm add -D vitest @testing-library/react jsdom @playwright/test
```

Use:

- Vitest for Zod, route, and API behavior.
- Testing Library for the minimal React route checks.
- Playwright for local and deployed browser smoke tests.

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

Create:

- A browser Supabase client using public URL and publishable/anonymous credentials.
- A server client only when the API requires privileged operations.
- No service-role key in browser code, committed files, logs, or test snapshots.

### Authentication and authorization

1. Configure local email authentication.
2. Decide redirect URLs for Vite, Firebase staging, and Firebase production.
3. Require row-level security on every future user-owned table.
4. Test policies through user-level clients rather than relying only on service-role access.

### Storage and realtime

Scaffold configuration, but wait to create resources until requirements exist:

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
- The application can connect to local Supabase.
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

`pnpm verify` should run the same non-deployment checks as CI:

1. Type-check.
2. Lint.
3. Unit and integration tests.
4. Build web and API artifacts.

### Minimum test coverage

- React Router renders `/`.
- Unknown routes render the not-found page.
- Environment schemas accept valid configuration and reject missing values.
- An API input schema rejects invalid data.
- API health endpoint returns success.
- Frontend can load and reach `/api/health`.
- Local Supabase migration reset succeeds.
- One authentication smoke flow before auth-dependent application work begins.

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
2. Supply public Supabase staging or production configuration at build time.
3. Keep API requests relative, such as `/api/health`, because Firebase will proxy them.
4. Ensure no server secret appears in generated assets.

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

## Phase 6: Hosted Supabase Environments

Create two Supabase projects:

- `meet-people-staging`
- `meet-people-production`

For each project:

1. Record the project reference without committing credentials.
2. Configure allowed frontend and auth redirect URLs.
3. Apply migrations from the repository.
4. Verify PostGIS.
5. Generate or compare remote database types.
6. Confirm row-level security before adding application tables.
7. Store credentials in the corresponding GitHub environment.

Use separate staging and production data. Never restore staging test data into production.

## Phase 7: Manual Staging Deployment

Complete one successful manual deployment before automating it.

### Google Cloud

Use separate Google Cloud/Firebase projects for staging and production where practical.

For staging:

1. Create an Artifact Registry repository.
2. Enable Cloud Run and required build/container APIs.
3. Build and push the API image.
4. Deploy the image to Cloud Run.
5. Configure non-secret environment variables.
6. Store server secrets using Secret Manager when they become necessary.
7. Restrict privileged Supabase credentials to the API service.

### Firebase Hosting

1. Initialize Firebase Hosting for the Vite output.
2. Set the public directory to `dist/web`.
3. Add rewrites in this order:
   - `/api/**` to the staging Cloud Run service.
   - All remaining paths to `/index.html`.
4. Deploy the frontend manually.
5. Verify direct navigation to every React Router route.
6. Verify API calls use the Firebase origin and require no browser CORS exception.

### Manual staging acceptance

- Firebase serves the frontend over HTTPS.
- Direct route refresh works.
- `/api/health` reaches Cloud Run through Firebase.
- The frontend connects to staging Supabase.
- Authentication redirects return to the staging domain.
- No production Supabase value is present.
- Playwright’s remote smoke suite passes against the staging URL.

## Phase 8: Remote Testing

Make Playwright accept a base URL through an environment variable:

```text
PLAYWRIGHT_BASE_URL
```

Keep the remote suite small:

1. Load the home route.
2. Navigate to another route and refresh it.
3. Confirm the not-found route.
4. Check API health through `/api/health`.
5. Exercise one staging Supabase/auth flow once available.
6. Avoid destructive tests against production.

Tests should create uniquely named staging data and clean it up, or use deterministic seed records reset independently of production.

## Phase 9: Continuous Integration

Create a GitHub Actions check workflow for pull requests, `main`, and version tags:

1. Check out the repository.
2. Install the declared Node and pnpm versions.
3. Run `pnpm install --frozen-lockfile`.
4. Run linting.
5. Run TypeScript checks.
6. Run unit/integration tests.
7. Build web and API artifacts.
8. Build the API container without pushing it.
9. Optionally start local Supabase and run migration tests when Docker is available.
10. Upload useful test reports only on failure.

Use caching supplied by the package-manager/action integrations. Do not cache `node_modules`.

Protect `main` by requiring this workflow before merge.

## Phase 10: Continuous Deployment

### Authentication

Use GitHub OpenID Connect with Google Workload Identity Federation. Do not store long-lived Google service-account JSON keys.

Create GitHub environments:

- `staging`
- `production`

Store environment-specific Firebase, Google Cloud, and Supabase identifiers or secrets there.

### Staging deployment

On a successful push to `main`:

1. Run all CI checks.
2. Authenticate to Google Cloud through OIDC.
3. Build and push an immutable API image tagged with the Git commit SHA.
4. Apply staging Supabase migrations.
5. Deploy that exact image to staging Cloud Run.
6. Build the frontend with staging public Supabase variables.
7. Deploy static files to staging Firebase Hosting.
8. Run remote Playwright smoke tests.
9. Mark the workflow failed if deployment or smoke testing fails.

### Production deployment

On a version tag such as `v0.1.0`:

1. Confirm the tagged commit already passed CI.
2. Require approval through the GitHub `production` environment.
3. Build or promote an image identified by the tagged commit.
4. Apply production migrations.
5. Deploy Cloud Run.
6. Build the frontend with production public values.
7. Deploy Firebase Hosting.
8. Run non-destructive production smoke tests.
9. Record deployed URLs, commit SHA, image digest, and migration version in the workflow summary.

Database migrations should be backward-compatible with both the old and new API revision because Cloud Run rollouts can briefly serve both.

## Documentation Deliverables

Once the build has been proven manually, document:

- Required tools and versions
- `nix develop`
- `pnpm install --frozen-lockfile`
- `pnpm dev`
- Local Supabase startup and reset
- Environment variable names and whether each is public or secret
- Local verification command
- Production-style local build commands
- Manual staging deployment
- Tag-based production releases
- Troubleshooting for ports, Docker, Supabase, and auth redirects

Do not document guessed build commands now. Add them after Phase 5 has successfully run.

## Completion Definition

Scaffolding is complete when:

- React Router and Zod are integrated and tested.
- Vital runtime packages have real initialization points.
- Local Supabase can be recreated from committed migrations.
- `pnpm verify` passes from a fresh checkout.
- Web and API production artifacts build locally.
- The API container runs locally.
- Staging can be manually deployed and remotely tested.
- Pull requests receive automated checks.
- `main` deploys to staging.
- Version tags deploy to production after approval.
- Both deployments pass remote smoke tests.
- Setup and release instructions reflect commands that have actually been executed.
