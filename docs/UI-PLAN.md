# Pebble UI integration

The `yz/prototype-integration` working tree brings the service-connected alternate
frontend into parity with the finalized, read-only `Pebble-Garden-Asset-Work`.
`docs/DESIGN.md` is the product-design authority. `src/main.tsx` now loads the
React screens in `src/ui/` through `src/App.tsx`; the standalone reference is not the application entry.

| Route | Current behavior |
| --- | --- |
| `/`, `/welcome` | Public marketing; signed-in `/` opens Garden after account readiness |
| `/login`, `/register` | Supabase email/password, email link and Google sign-in |
| `/auth/callback`, `/reset-password` | Explicit grant verification and URL scrubbing |
| `/auth/forgot-password`, `/forgot-password` | Real recovery email request |
| `/onboarding` | Four sequential persisted account chapters |
| `/home`, `/community` | Integrated pixel-art Garden; account-keyed browser inventory, placement and unique Geode unlocks (not server ownership) |
| `/matchmaking` | Real Friends queue and capability-gated Dating |
| `/events`, `/events/:id` | API listings and event group queue/proposals |
| `/explore`, `/explore/:id` | Public event reads; sign-in link for group participation |
| `/messages`, `/messages/chat?conversation=…` | Saved inbox, history, read state and idempotent sends |
| `/messages/requests` | Standalone private requests view; live acceptance, decline and safety; Close returns to Messages |
| `/profile` | Prototype overview, saved-profile Preview, Settings gear, identity/interests/adult Dating editors and search-preference links. URL-selected editor tabs support Back/Forward. `?section=settings` contains the five existing settings categories and sign-out; category Back returns there. |
| `/settings` | Legacy redirect to the Profile Settings hub; existing `?section=…` links still open the corresponding section. Active group matching remains in Messages. |
| `/activity`, `/matches` | Activity retains real updates. Matches & Plans presents Upcoming event proposals and Connections in prototype tabs; Past explicitly says history is not available. |
| `/terms`, `/privacy`, `/cookies` | Existing policy content in the new visual layout |
| `/logout` | Confirmed local session sign-out |

Private routes wait for session hydration and persisted account readiness. A
signed-in account with missing chapters resumes onboarding; account read failures
block entry with retry and sign-out. Unknown routes pass through the same gate.

Keep the existing browser clients and shared schema validation. Use bearer tokens
for private API calls; use no database tables or privileged keys in the browser.
Versioned preference writes keep their compare-and-swap/readback behavior. Failed
or uncertain mutations require read-only reconciliation before another write.
Message retries reuse the same client request ID. Friends checks stay manual.

The API/schema and deployment configuration retain the reviewed team foundation.
Newer `origin/wiring` backend/schema changes were inspected as references, not
blindly copied or activated; see `FRONTEND-PARITY-REPORT.md` for the differences.
This frontend work does not install SQL, change provider configuration or deploy.
Optional capabilities remain unavailable if the target backend has not activated
them. No new backend contracts were invented for the demo’s unsupported features.

Verification covers retained backend/client tests and a replacement browser suite
in `tests/browser/wiring.spec.ts`. The retired screen-specific suites were removed
with their implementations; account, preference, API and database contract tests
remain. Browser fixtures establish request/response integration, not live database
or hosted provider acceptance. See `docs/FRONTEND-WIRING.md` for validation scope.
