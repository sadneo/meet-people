# Pebble UI integration

The `wiring` branch replaces the old frontend with the alternate Pebble design.
`docs/DESIGN.md` is the product-design authority. `src/main.tsx` now loads the
React screens in `src/ui/` through `src/App.tsx`; there is no second demo server.

| Route | Current behavior |
| --- | --- |
| `/`, `/welcome` | Public marketing; signed-in `/` opens Garden after account readiness |
| `/login`, `/register` | Supabase email/password, email link and Google sign-in |
| `/auth/callback`, `/reset-password` | Explicit grant verification and URL scrubbing |
| `/auth/forgot-password`, `/forgot-password` | Real recovery email request |
| `/onboarding` | Four sequential persisted account chapters |
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

Keep the existing browser clients and shared schema validation. Use bearer tokens
for private API calls; use no database tables or privileged keys in the browser.
Versioned preference writes keep their compare-and-swap/readback behavior. Failed
or uncertain mutations require read-only reconciliation before another write.
Message retries reuse the same client request ID. Passive recommendations never
enroll someone in the separate Messages group queue.
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
