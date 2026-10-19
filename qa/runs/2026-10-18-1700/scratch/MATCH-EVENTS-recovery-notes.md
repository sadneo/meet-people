# MATCH / EVENTS interrupted-run recovery

Recovered 2026-10-18 from existing scripts/screenshots and reproduced the two highest-confidence current P2 issues in two fresh browser sessions each. No app code, config, tests, migrations, database reset, worker or provider activation performed.

## Recovered findings

- MATCH-01: live carol profile, invalid preference save; alert remains outside visible dialog body at 390x844 and 1280x860.
- EVENTS-01: signed-in dave, simulated HTTP 502 HTML response; raw JSON parser text at both viewports. Retry was checked against a subsequent JSON response.

## Deliberately excluded

- Missing embedding/scoring provider returns 503 locally. Existing candidate-card scripts explicitly mock only the candidate result. Provider-backed matching was not claimed or activated.
- Old Company interested counts are separate from the new event-group queue by `docs/event-group-queue.md`; joining the new queue need not change that count. No false count bug filed.
- Wide event selection is an existing preview behavior preserved by the design authority, despite an older UI-PLAN sentence implying all selection navigates. No bug filed.
- Queue-mode wording is ambiguous but the Switch to active/downtime control conveys an available path; did not prioritize over confirmed form/error feedback failures.
- Pending outgoing request management is recorded only as a product question.

## Coverage limits

This recovery completes the interrupted investigation's strongest leads, not a new exhaustive audit. Original run screenshots cover list/detail, queue join/leave, signed-out paths, preferences, candidate cards and failure paths. Only the two findings above were freshly reproduced under this recovery. Background event-group proposal generation, providers, Google auth and hosted ingestion were not tested.
