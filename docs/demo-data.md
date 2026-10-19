# Local fictional demo accounts

These commands target **only** the running `supabase_db_meet-people` local project on loopback port 54321. They refuse remote targets and identities without the seeder's admin-owned marker. They require the already reviewed/activated Friends, Dating, photo and trusted-location schema. They are operator tools, not public endpoints.

```sh
pnpm demo:seed --dry-run              # preview 50; no database/network access
pnpm demo:seed                        # create/onboard 50; hidden password prompt
pnpm demo:queue --count 2             # queue accounts 001 and 002 for Friends
```

Sign in to your own onboarded demo account at http://127.0.0.1:3006. Choose **Find Friends**, then **Check for a match**. The real matcher chooses at most one candidate per check. Queuing two accounts does not create a group, a connection, online presence, a request, or a completed match. Reciprocal age/distance filters, discovery and safety rules still apply. Use Stony Brook University as the reviewed temporary search area for this local demo. Queued fixtures need no browser window open.

```sh
pnpm demo:queue --count 1             # only 001
pnpm demo:queue --start 3 --count 2   # 003 and 004 instead
pnpm demo:queue --count 2 --leave     # remove only 001 and 002 from queue
pnpm demo:queue --count 2 --dry-run   # preview selection without changing anything
```

Joining is idempotent. A missing/unowned identity or failed eligibility/readback rolls back the entire selected queue batch. Existing normal accounts are never enqueued or edited. Queue commands preserve profile data, preferences and Dating participation.

## What is populated

Logins are `pebble-demo-001@example.test` through `pebble-demo-050@example.test`, using the shared password you choose at the hidden prompt (8–128 characters). No password or session key is stored in a file or printed. These are reserved fictional addresses; they cannot receive real mail. Local admin-created fixtures are confirmed; normal registration's email verification is unchanged.

Each fixture goes through all four canonical onboarding save chapters and authoritative readback. It has a labelled fictional name/bio, age 20–34, shared global interests, weekly availability, education, occupation, languages, visibility controls, friendship goals, independent Friends/Dating age and distance filters, and Dating identity/intent/style/height. Preferences vary in compatible pairs across straight, gay, lesbian and clarified nonbinary examples. The first pair uses an inclusive 18–99 preferred age range to simplify a demo; other pairs demonstrate narrower filters. Illustrated initials avatars are generated locally and labelled DEMO, not photos of real people. They are stored through the existing private photo contract and used by Dating.

New profiles are **not queued** by `demo:seed`. Existing queue memberships survive reruns. Dating discovery is enabled and the profiles opted in, so they can appear to eligible signed-in Dating users without a Friends queue command. The seed verifies a real Dating candidate lookup; it does not send or accept requests. Downtime is off, notifications are off, no messages/rewards/purchases are fabricated. All fixtures share the reviewed campus anchor; this demonstrates campus-area proximity, not GPS measurements for individual fictional people.

## Options and reruns

```sh
pnpm demo:seed --count 10             # 2–100 deterministic reserved identities
pnpm demo:seed --no-photos            # omit initial avatars; don't remove existing ones
pnpm demo:seed --reset-profiles       # explicitly replace owned fixture profile/facts/filters/photos
pnpm demo:seed --reset-passwords      # explicitly replace owned fixture passwords
pnpm demo:seed --refresh-location     # renew reviewed local Stony Brook catalogue for seven days
```

Default reruns preserve completed owner profile/facts/identity edits and removed-photo tombstones, resume incomplete onboarding, refresh trusted campus references, and opt fixtures back into discovery/Dating with downtime off. They intentionally keep every selected fixture's temporary location at Stony Brook. Existing preferences remain authoritative; incompatible owner edits can prevent matches. Rerun with the original password unless explicitly resetting it. `--password-stdin` is available to an automated runner; pass secrets through stdin, never command arguments or committed files.

The trusted catalogue and references expire. `--refresh-location` explicitly reapplies the existing reviewed campus entry; review that entry before renewal. It does not call an external provider, change home location for existing profiles, or resolve arbitrary city text. A location-not-ready queue failure requires reviewing/renewing the catalogue and rerunning the seed to issue fresh references.

Auth creation happens before the atomic profile transaction. A failed run may leave marked Auth accounts awaiting onboarding; rerun to resume. This is not atomic across Auth and PostgreSQL. Scripted canonical interest saves suppress only the existing embedding trigger within the same transaction, restoring it before commit or on rollback. Other writers wait on the table lock; all other authorization and data triggers remain active. No embedding provider call is made. Any changed trigger inventory stops seeding for review.

## Verification

Focused unit tests validate 50 varied schema-valid profiles, canonical chapter progression, reciprocal pair compatibility, bounded stable identities and queue scope. The opt-in real integration test creates only two previously absent fixtures, runs both scripts, signs in with real JWTs, reads canonical settings/private images, verifies actual Friends/Dating candidates, checks queue idempotence/scoped leave, rerun preservation, marker-collision refusal and transactional rollback. It removes only its newly created fixtures after confirming no connections exist. Do not run it if those reserved identities already hold demo accounts; it deliberately refuses to touch them.

```sh
pnpm --config.verify-deps-before-run=false exec vitest run --configLoader runner --config vite.isolated.config.ts --environment node tests/demo-seed.test.ts
pnpm --config.verify-deps-before-run=false exec tsc -p tsconfig.demo.json --noEmit
pnpm --config.verify-deps-before-run=false exec tsx tests/offline/demo-seed-real.ts
```

No production population, deployment, provider integration, or full 50-account load run is implied by the two-account integration check.
