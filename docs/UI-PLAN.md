# Pebble UI integration

The `wiring` branch replaces the old frontend with the alternate Pebble design.
`docs/DESIGN.md` is the product-design authority. `src/main.tsx` now loads the
React screens in `src/ui/` through `src/App.tsx`; there is no second demo server.

The local development navigator sits in its own normal-flow strip above the app,
not over mobile actions or message composers. It remains absent from normal
production builds. Discover shows a saved search-area label only after a location
reference exists; Profile home does not stand in for an unconfirmed search area.

| Route | Current behavior |
| --- | --- |
| `/`, `/welcome` | Public marketing; signed-in `/` opens Garden after account readiness |
| `/login`, `/register` | Supabase email/password, email link and Google sign-in |
| `/auth/callback`, `/reset-password` | Explicit grant verification and URL scrubbing |
| `/auth/forgot-password`, `/forgot-password` | Real recovery email request |
| `/onboarding` | Guided four-stone journey from the original dev flow, with a welcome scene and confirmed completion screen. About you (identity, private birthdate, home area), interests (1–5, premade or custom; at most 2 custom), social intentions, then weekly availability, general plan preferences and an explicit saved timezone. Each chapter persists and resumes from confirmed account data. Dating and group/event queues retain separate opt-in. |
| `/home`, `/community` | Local floating garden |
| `/matchmaking` | Passive Friends/Dating recommendations, consent and search preferences |
| `/events`, `/events/:id` | API listings and event group queue/proposals |
| `/explore`, `/explore/:id` | Public event reads; sign-in link for group participation |
| `/messages`, `/messages/chat?conversation=…` | Saved inbox, history, read state and idempotent sends |
| `/messages/requests` | Standalone private requests view; live acceptance, decline and safety; Close returns to Messages |
| `/profile` | Account hub with Edit profile, Discovery, Notifications, Account & security, Safety, Privacy & legal, and sign-out. Focused settings pages use `?section=…` and return to Profile. Profile editor retains identity/interests/Dating-details tabs. Search preferences live in Discover. |
| `/settings` | Legacy redirect to Profile; existing `?section=…` links open the corresponding Profile settings section. Legacy downtime controls removed; active group matching remains in Messages. |
| `/activity`, `/matches` | Real connection requests, connections and event proposal notifications |
| `/terms`, `/privacy`, `/cookies` | Existing policy content in the new visual layout |
| `/logout` | Confirmed local session sign-out |

Private routes wait for session hydration and persisted account readiness. A
signed-in account with missing chapters resumes onboarding; account read failures
block entry with retry and sign-out. Unknown routes pass through the same gate.
Profile photo selection/removal is staged with the profile draft: Cancel discards
it and Save changes performs the revisioned photo write after profile/detail
saves. These resources are not an atomic transaction; partial or uncertain saves
stay explicit and require read-only reconciliation before another photo write.
Timezone/sharing controls retain their separately labeled immediate-save behavior
in the editor. Privacy and the editor expose the same canonical schedule-sharing
opt-in; the legacy account availability flag is preserved but not presented as a
second consent gate. Device-location permission is separate from profile home
and each discovery mode's confirmed search area, and is requested only by the
explicit location action.
Garden and the other signed-in destinations share one account loader and shell.
An account-scoped TanStack Query cache retains display reads and decoded private
photos across navigation, with background refresh and short freshness windows.
Events and inbox data warm after the shell becomes idle and on navigation intent.
Changing accounts or signing out clears the cache and revokes private image URLs.
Cached request lists and chat histories remain visible during refresh, while their
write controls wait for fresh permissions. Editable settings, queue/consent actions,
request allowances and mutation readbacks retain their canonical server checks.

Keep the existing browser clients and shared schema validation. Use bearer tokens
for private API calls; use no database tables or privileged keys in the browser.
Versioned preference writes keep their compare-and-swap/readback behavior. Failed
or uncertain mutations require read-only reconciliation before another write.
Message retries reuse the same client request ID. Passive recommendations never
enroll someone in the separate Messages group queue.
An open conversation refreshes its display history every four seconds while the
tab is visible, and rechecks on return. Polling stops when the conversation
unmounts. Drafts and loaded history remain during background refresh; stale or
failed permission reads cannot authorize sends. Automatic reads never retry a
message send, and read acknowledgements are deduplicated by message sequence.
The one-interest readiness policy requires additive migration
`20261101000000_one_interest_minimum.sql` on existing databases before rolling out
the relaxed client rule. Existing profiles remain intact; five-total/two-custom
caps and matchmaking weights are unchanged. Shared-interest badges use scoring's
normalization/aliases and count distinct shared topics.
Friends reads an owner-only setup status before requesting recommendations. It
shows specific guidance for the supported age range (18–99), disabled discovery,
missing preferences, or a search area that needs confirmation. Eligibility changes
during scoring return a setup conflict and recheck status, rather than a generic
server error. This requires `20261030000200_friends_discovery_status.sql`.
Friends preferences require an explicitly confirmed search area before Done can
finish setup. Done waits for confirmed saves and a fresh owner setup check;
expired areas and unavailable checks keep the dialog open. An unconfirmed area
shows “Choose an area” rather than the Profile home label.
Dating uses its existing owner-only runtime for specific age (18+), discovery,
profile, search-area and participation guidance. Recommendations wait until that
runtime permits them; eligible users still explicitly start participation. Setup
rejections retain their conflict category, and a definitively rejected opt-in is
distinct from an unconfirmed write. Pause remains available after eligibility
expires. Automatic setup rechecks are bounded to prevent recommendation loops.
Discover checks the account's shared rolling allowance before showing request
actions and after each request. At ten new requests in 24 hours, both modes show
the limit screen with the next available time and links to Messages and incoming
requests. Sending remains blocked while allowance reads are pending or failed;
availability is checked again on focus and when the next slot opens. The read-only
allowance API requires `20261030000100_connection_request_allowance.sql`.
Event group queues check for a result every three seconds while waiting, stopping
after a group appears, leaving the queue, or the event becomes unavailable.

The API/schema and deployment configuration are retained from `origin/main`.
This frontend work does not install SQL, change provider configuration or deploy.
Optional capabilities remain unavailable if the target backend has not activated
them. No new backend contracts were invented for the demo’s unsupported features.

Verification covers retained backend/client tests and a replacement browser suite
in `tests/browser/wiring.spec.ts`. The retired screen-specific suites were removed
with their implementations; account, preference, API and database contract tests
remain. Browser fixtures establish request/response integration, not live database
or hosted provider acceptance. See `docs/FRONTEND-WIRING.md` for validation scope.
