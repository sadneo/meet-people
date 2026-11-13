# Local fictional demo accounts

For the current passive Discover and active Messages flows, use
[matchmaking-demo.md](matchmaking-demo.md). The legacy queue instructions below
describe the earlier manual discovery flow.

These commands target **only** the running `supabase_db_meet-people` local project on loopback port 54321. They refuse remote targets and identities without the seeder's admin-owned marker. They require the already reviewed/activated Friends, Dating, photo and trusted-location schema. They are operator tools, not public endpoints.

## Populate the main testing scenarios

```sh
pnpm demo:populate --dry-run          # preview everything, no database access
pnpm demo:populate                    # 60 contacts for the development login
pnpm demo:populate --count 100        # optional 12–100 contacts
```

The command renews the existing reviewed Stony Brook campus catalogue entry and
creates labeled fictional profiles, initials avatars, preferences and compatible
Dating pairs. The dedicated development account is the main test account:

| Area | What the development account receives |
| --- | --- |
| Messages | Six connected contacts (001–006), each with three saved sample messages; the last messages are from the contact to exercise unread badges |
| Activity | Incoming requests from 007/008 and an outgoing request to 009 |
| Friends | All 60 contacts opted into passive Friends discovery, subject to reciprocal filters; no legacy queue enrollment |
| Dating | A large compatible pool with broad adult age filters, distinct interests, bios, preferences and labeled demo avatars |
| Profile cards | Rich fictional profiles, education/occupation/languages and visibility settings; candidate cards display the fields supported by the existing API |
| Event groups | The development account and 17 unconnected contacts queued for each of three demo events |

Population also queues up to 17 labeled test contacts in **every future active
event**, including regular SBU events. It leaves the development account's own
participation unchanged. With the default 60-contact pool there are 17 per event;
smaller pools use the available planned count. Started/cancelled events are
excluded because their group queues are closed.

Open http://127.0.0.1:3000 and choose **Sign in as development user**. The command
authenticates through its fixed private credential file and verifies its server-owned
development marker. Its existing password, username, name, bio, birthdate, interests,
availability and profile edits are preserved. Discovery is enabled for both modes,
and their search areas use the existing reviewed temporary Stony Brook campus anchor.
Existing age/distance choices remain authoritative.

Only a completely empty Dating persona receives fictional Man/Straight test defaults
(long-term/monogamy); existing choices are retained. A partially completed Dating
profile must be completed rather than silently guessed. Profiles in the pool vary
across compatible straight, gay, lesbian and clarified identity examples. New pool
profiles have broad 18–99 age filters, with enough compatible women for the default
development persona to browse several candidates. Existing fixture edits can still
affect eligibility.

The Events list includes three `[DEMO]` events: campus coffee, board games, and a
study-break walk. The command prints their direct URLs; they can also be found by
their Demo categories. Contacts 010–060 are split across these event queues with
the development account. Existing unrelated queue memberships are preserved.
Run the local matching worker in a separate terminal:

```sh
pnpm dev:groups
```

It installs the local matching policy, enables its dedicated worker and processes
eligible event queues until stopped. Matching ranks saved shared interests, then
weekly availability overlap. It uses no Gemini, embeddings or external scoring.
The development account's pending enrollments are processed first. Open an event
to see **Suggested group** once matched. While waiting, the page checks every
three seconds and displays the group automatically. **Refresh group status** is
an optional manual check.
Fixture-only queues wait until a real account joins, keeping those contacts
available for testing instead of consuming their attempts on each other.

The worker retains the existing consent, eligibility, block, lease and completion
checks. It stops on uncertain work instead of replaying a ranking. An enrollment
has one matching attempt; a person left waiting after their cohort is processed
can leave and explicitly rejoin to request another attempt. Credentials stay in
the private local worker file. Population itself leaves worker configuration
unchanged and does not manufacture proposals, attendance, or event-group chats.
The retired `/api/events/:id/company` feature is not reinstated.

### Worker diagnostics and recovery

`pnpm dev:groups` now identifies the failed startup step or queue operation rather
than printing one generic error. For example:

```text
Worker diagnostic: stage=claim; reason=timeout. Outcomes may be uncertain; no automatic replay.
Local group worker stopped [general_queue]. ...
```

Queue stages are `claim`, `rank`, `fail` (recording an unsuccessful attempt),
`complete`, and `reconcile`. Reasons distinguish `timeout`, `invalid_response`
(a contract/schema mismatch), and `request_failed` (a rejected or unavailable
request; it does not identify a specific provider cause). A completion error may
still reconcile as completed; the completed count includes that confirmed result,
but the worker still stops instead of taking another job.

| Stop category | Safe next action |
| --- | --- |
| `local_database`, `local_configuration`, `worker_transport` | Run `pnpm run doctor`; check local Docker/Supabase/API availability. Doctor does not start anything. |
| `private_credentials`, `worker_identity`, `worker_authentication` | Inspect local Auth availability and private file ownership/permissions. Do not publish credentials, replace an identity or reset passwords to bypass checks. |
| `worker_provisioning`, `policy_setup`, `worker_setup` | Earlier setup work may already be committed. Inspect existing identity/schema/worker state before explicitly rerunning setup; failure does not imply rollback. |
| `matching_policy` | Check database readiness and the local policy installation before explicitly running setup. Do not reset existing data. |
| `development_queue`, `general_queue` | Inspect existing job, lease and proposal state before explicitly restarting or rejoining. Never replay uncertain ranking/completion calls. |

Diagnostics contain fixed codes and guidance, not raw exceptions, provider
responses, SQL, account IDs, job IDs, lease tokens, passwords or keys. A missing
optional development-account credential file is reported as a general-queue
fallback, not a fatal error. Normal shutdown after the current cycle is logged
separately from failure. These diagnostics add no automatic retries, provisioning
or schema changes beyond the command's existing explicit `--setup` behavior.

To fill all currently available events without rerunning the full profile seed:

```sh
pnpm demo:event --all
```

Each event has its own queue. To populate only one regular event, first **Join
group queue** as the development user, then copy the UUID from its URL and run:

```sh
pnpm demo:event --event-id <event-uuid> --dry-run
pnpm demo:event --event-id <event-uuid>
```

This queues 17 existing labeled demo contacts for that event only (`--count 1–50`
changes the number). It skips connected or blocked contacts and requires a future
active event. It preserves the imported event, profiles, existing enrollments and
matching attempts. Keep `pnpm dev:groups` running; the waiting page updates
automatically. It refuses single-event population when the development account
has not joined.

Scenarios use deterministic event IDs and message retry keys. Running again
does not duplicate messages, events or active enrollments, or reset read receipts.
Pending requests already accepted during testing retain their new state. Blocked
or otherwise incompatible fixture edits cause a checked failure rather than
silently removing safeguards. To renew only this script's expired/cancelled events:

```sh
pnpm demo:populate --refresh-events
```

The development-account command preserves existing contact passwords and assigns
generated passwords to newly created contacts without logging or storing them.
It does not need you to sign into the contacts. To deliberately set a shared login
password for the seeded contacts, use the separate interactive tool:

```sh
pnpm demo:seed --count 60 --refresh-location --reset-passwords
```

This resets passwords only on marked fixture accounts; it preserves the dedicated
development account's password. The development-account command rejects password
input/reset flags so those changes remain explicit.

Auth creation, profile population and scenario population are separate stages.
Profile and scenario SQL each run in their own transaction; a failed later stage
can leave earlier stages completed. Rerun after resolving the error. Failures and
uncertain responses do not imply a full-run rollback.

## Profiles and separate Friends queue tools

```sh
pnpm demo:seed --dry-run              # preview 50; no database/network access
pnpm demo:seed                        # create/onboard 50; hidden password prompt
pnpm demo:queue --count 2             # queue accounts 001 and 002 for Friends
```

Sign in to your own onboarded demo account at http://127.0.0.1:3000. Choose **Find Friends**, then **Check for a match**. The real matcher chooses at most one candidate per check. Queuing two accounts does not create a group, a connection, online presence, a request, or a completed match. Reciprocal age/distance filters, discovery and safety rules still apply. Use Stony Brook University as the reviewed temporary search area for this local demo. Queued fixtures need no browser window open.

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

The trusted catalogue and references expire. `--refresh-location` explicitly reapplies the existing reviewed campus entry through the narrow publisher role, using the existing local database administrator without changing role memberships. It does not call an external provider, change home location for existing profiles, or resolve arbitrary city text. A location-not-ready queue failure requires reviewing/renewing the catalogue and rerunning the seed to issue fresh references.

Auth creation happens before the atomic profile transaction. A failed run may leave marked Auth accounts awaiting onboarding; rerun to resume. This is not atomic across Auth and PostgreSQL. Scripted canonical interest saves suppress only the existing embedding trigger within the same transaction, restoring it before commit or on rollback. Other writers wait on the table lock; all other authorization and data triggers remain active. No embedding provider call is made. Any changed trigger inventory stops seeding for review.

## Verification

Focused unit tests validate 50 varied schema-valid profiles, canonical chapter progression, reciprocal pair compatibility, bounded stable identities and queue scope. The opt-in real integration test creates only two previously absent fixtures, runs both scripts, signs in with real JWTs, reads canonical settings/private images, verifies actual Friends/Dating candidates, checks queue idempotence/scoped leave, rerun preservation, marker-collision refusal and transactional rollback. It removes only its newly created fixtures after confirming no connections exist. Do not run it if those reserved identities already hold demo accounts; it deliberately refuses to touch them.

```sh
pnpm exec vitest run --config vite.config.ts tests/unit/demo-seed.test.ts
pnpm exec tsc -p tsconfig.demo.json
pnpm test:demo-populate
# Optional real Auth test; refuses occupied fixture identities:
pnpm exec tsx tests/integration/offline/demo-seed-real.ts
```

No production population, deployment, provider integration, or full 50-account load run is implied by the two-account integration check.

`test:demo-populate` uses a new empty schema-only disposable database and offline
interest enrichment. It verifies the actual profile
and scenario SQL, Friends/Dating candidate reads, a connected chat and three
messages, a pending request, three events and ten enrollments, idempotent reruns,
ownership-collision rollback and explicit event date renewal. It copies no app
or Auth rows and removes its disposable database afterward. The real application
database is not populated by this test.

It also verifies a synthetic development-account hub with 60 rich contacts, six
conversations/18 messages, incoming/outgoing requests, unread state, many Friends
and Dating candidates, shared event queues, preserved development profile edits,
and idempotent reruns. The older six-user standalone scenarios remain supported
with `pnpm demo:seed --scenarios --count 6 --refresh-location`.
