# QA areas

Each tester owns one area and checks it for bugs, UX, layout and accessibility at **390x844** (phone)
and **1280x860** (desktop) at minimum. Every tester uses only its own seeded users, so testers can
run in parallel without changing each other's data. All seeded users: password `password123`,
email `<name>@example.com`, onboarding finished.

Seeded relationships: alice–bob connected (chat with 2 messages), erin → alice pending request,
carol–hank and carol–kim connected, frank–liam connected.

App: http://127.0.0.1:3000 (local stack). Local mail viewer: http://127.0.0.1:54324.

## AUTH: sign-in, registration, onboarding, profile and settings

- Routes: `/login`, `/register`, `/forgot-password`, `/reset-password`, `/auth/callback`, `/onboarding`, `/profile`, `/settings`, log out from the account menu.
- Users: `grace` (existing account), plus new accounts `qa-auth-<n>@example.com` you register yourself (confirm via the mail viewer; `latestEmailLinks()` in the helper).
- Focus: email-first sign-in, wrong password, unknown email → register, confirmation email, password reset, onboarding chapters save and resume after refresh, profile edits persist, settings toggles persist, returnTo after sign-in, signed-out redirects.
- Limit: the sign-in form calls `/api/auth/email`, which allows **10 attempts per IP per 10 minutes** for the whole machine. Use the form for at most 6 sign-ins per run; use the helper's `openAs()` for everything else.

## MSG: messages and connections

- Routes: `/messages`, `/messages/chat?conversation=…`, the Messages tab dot, Connect/Accept/Decline.
- Users: `alice`, `bob`, `erin` (two browsers at once for real-time behaviour).
- Focus: request → accept → chat appears for both, sending/receiving, unread dots and "Seen", polling delays, refresh mid-conversation, drafts on failure, very long messages, empty inbox, search, narrow screens with the keyboard, signed-out access.
- Read `known-issues.md` first; four messaging issues are already known.

## MATCH: matchmaking

- Routes: `/matchmaking`, `/downtime-matchmaking`, the candidate card and its Connect button, matching notifications.
- Users: `carol`, `hank`, `kim`, `jack` (put two in the queue at once to get a candidate).
- Focus: profile save before matching, start/stop matching, checking for a match, candidate card content, Connect → Cancel request → request shows up for the other person, empty and error states, notifications.

## EVENTS: events and event groups

- Routes: `/events`, `/events/:id`, the event group queue on an event.
- Users: `dave`, `iris`.
- Setup: the local database has no events. Insert a few before testing:
  `docker exec supabase_db_meet-people psql -U postgres -c "insert into listings (title, source, external_id, starts_at) select 'QA event ' || n, 'qa', 'qa-' || n, now() + (n || ' days')::interval from generate_series(1, 5) n on conflict do nothing;"`
- Focus: list, filters, detail page, images and fallbacks, interest/join/leave, empty and error states.

## HOME: home, community and the remaining pages

- Routes: `/`, `/community`, `/intro`, `/profile/person`, and the prototype planning pages `/free-time`, `/free-time/matches`, `/free-time/activities`, `/free-time/plan`, `/free-time/review`, `/free-time/confirmed`, `/free-time/connection` (prototype: crashes and broken navigation only), plus an unknown URL for the 404 page.
- Users: `guest` (signed out) and `frank` (read-only: don't connect, message or change settings; MOBILE also uses frank).
- Focus: first visit, navigation to every main area, signed-out vs signed-in differences, animations with reduced motion. Artwork is intentional; only report broken or overlapping art.

## MOBILE: cross-cutting layout and accessibility

- Routes: every main route above.
- Users: `liam` (and `frank` read-only).
- Viewports: 320x568, 390x844, 768x1024, 1280x800, 1920x1080.
- Focus: horizontal overflow, content hidden behind the bottom nav or safe areas, tap targets under 44px, keyboard-only navigation and visible focus, labels on inputs and icon buttons, colour contrast, reduced motion.
