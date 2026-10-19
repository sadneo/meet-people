---
id: EVENTS-01
area: events
severity: P2
type: ux
page: /events/ab955825-dc9e-4c0f-9dbd-5128ae3a4a03
viewport: 390x844; 1280x860
user: dave
---
**Summary:** A failed event request displays JSON parser diagnostics instead of an understandable service error.

**Steps:**
1. Sign in as dave and open an imported event detail at 390x844 (also reproduced at 1280x860).
2. Simulate `GET /api/events/<id>` returning HTTP 502 with `Content-Type: text/html` and body `<html><body>Bad gateway</body></html>` using Playwright routing.
3. Read the event detail error.

**Expected:** A concise event-unavailable message and Retry, consistent with the event list's existing failure state.
**Actual:** The main error says `Unexpected token '<', "<html><bod"... is not valid JSON`. The event's title/details disappear. Retry remains available, but the explanation is a raw browser diagnostic. A normal JSON error response is handled correctly, so this is specifically the non-JSON/network failure path.
**Evidence:** screenshots/EVENTS-01-recovered-1-390.png; screenshots/EVENTS-01-recovered-2-1280.png. Browser response: `502: GET http://127.0.0.1:3000/api/events/ab955825-dc9e-4c0f-9dbd-5128ae3a4a03`. Exact alert: `Unexpected token '<', "<html><bod"... is not valid JSON`. Reproducer: `scratch/EVENTS/recovery-errors.mjs`; after replacing the simulated response with a JSON 404 and clicking Retry, both sessions recovered to `This event is no longer available.` Original interrupted artifact: screenshots/EVENTS-fail-detail-502-390.png.
**Reproduced:** 2/2 in fresh browser sessions with only the event response mocked; live app and authenticated sessions. No server or database changes.
**Suspected cause (optional):** `eventRequest` in `src/features/events/client.ts` parses JSON before checking status, and the detail screen in `src/features/events/Browse.tsx` renders the thrown `Error.message` verbatim. The list already presents a generic state. P2 because Retry and back navigation still work.
