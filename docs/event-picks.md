# Event picks in chat

Direct Friends and Dating chats suggest up to three upcoming events the two
people could go to together. Picks sit in a tray under the chat header, tuck
into a chip as the conversation gets going and then disappear; ••• → Event ideas
always reopens them. Picks are a private suggestion to each person: nothing is
shared until someone taps **Send**.

## Data and privacy

`GET /api/event-picks/:conversationId` verifies the bearer token like the other
social routes, then calls the service-role-only
`public.get_conversation_event_pool(actor, conversation)` from
`20261125000000_conversation_event_picks.sql`. The function refuses anyone who is
not a current participant of that direct conversation, or whose pair fails the
existing messaging contact rule (blocks, revoked connections, inactive or
anonymous accounts). It returns both people's interests and live events starting
in the next 14 days, with each event's distance from each person's search area.

- Search area: the person's usable Friends area, otherwise their Dating area,
  otherwise none. Events with coordinates must fall inside every known area's
  radius. Events without coordinates (most campus listings) are kept.
- Coordinates never leave the database. Distances, radii and interest lists stay
  in the API; the response carries only public event fields and a reason.
- Reasons name only interests the people list on their own profiles.

## Ranking (`event-picks-v1`)

`api/matching/event-picks-scoring.ts` scores each event:

| Signal | Weight | Value |
| --- | --- | --- |
| Interest fit | 0.6 | 1 shared interest matches · 0.6 each person matches a different interest · 0.35 one person matches · otherwise dropped |
| Closeness | 0.25 | Geometric mean of `1 − distance / radius` for each known area; 0.5 when neither is known |
| Soonness | 0.15 | `1 − hours until start / 336` |

An interest matches by whole words in the event's category, title or
description. The built-in interests carry small keyword lists (Music matches
"concert", "band", "open mic"…); custom interests match their own words, with a
plural also matching its singular. Curated spelling aliases work in both
directions, and hyphens match spaces. Ambiguous keywords such as "run", "tea"
and "games" are omitted; phrases such as "latte art", "martial arts" and
"resistance band" do not establish the unrelated Art or Music interest.
The top three are kept with at most one per category and no repeated titles.
No matches means no tray.

## In the chat

- Open until each person has sent two messages, or a pick has been sent; then a
  chip. Hidden at 20 messages, three days after the first message, or after ×
  (remembered per account and chat on the device). Rules live in
  `src/ui/event-picks-state.ts`.
- Tapping a pick's photo or title opens the full event as its own screen (it
  slides in from the right on phones) with Back to chat and Send. The event is
  checked again on opening and before every send. Removed, inactive or started
  events cannot be sent through these controls. Picks refresh once a minute
  while the chat is visible; started picks disappear on the next 15-second
  display update. These client checks are not an atomic event/message write.
- Send posts an ordinary message through the existing send API, with its own
  request ID reused on retry: the title, the date and place, then
  `/events/<id>` on the last line. The app draws any message ending in an event
  path as a card from the live event record. Text before the path stays readable
  in the conversation as well as notifications and previews, even if the event
  changes or disappears. Only a confirmed 404 says the event is no longer
  available; temporary failures offer Retry event details in the chat.
- Chat follows delayed card growth while at the newest message and preserves
  the reader's position when viewing earlier messages. Tray controls move focus
  to the heading, replacement chip or conversation options; send failures keep
  Retry focused, and successful sends return focus to the composer.
- Event-detail lookups have a separate 600-request/15-minute per-IP budget;
  the directory retains its 100-request allowance. Duplicate card reads share
  the session query cache. The tray subtitle says "Next two weeks" because
  events without coordinates do not establish proximity to either person.

## Activation and limits

Apply the migration to each environment before relying on picks; until then the
route returns 503 and the chat simply shows no tray. The migration is replayed
in the production-upgrade rehearsal. Optional local SQL assertions
(`tests/integration/sql/event-picks.sql`) run there when present; this QA file is
Git-ignored.

Not included: availability-based reasons, group chats, a structured event
message type, or learning from what people send.
