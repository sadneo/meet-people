# M2 meet planning prototype

Open `/chats/plan` directly after `pnpm dev` (normally
http://127.0.0.1:3000/chats/plan). The existing shared shell highlights Chats.
The route is a future entry point from a matched conversation; this prototype
does not add a match, chat inbox, or change the Home or Events screens.

## Demo

1. Compare the three people's example availability and choose either shared hour.
   The third time is unavailable because Jamie is in class.
2. Choose one of three short meetup ideas.
3. Review the people, date, time, place, meeting point, duration, and cost.
   Change time or activity if needed; previous choices are preserved.
4. Select **Make plan** to see the demo confirmation. **Edit plan** reopens it.

Everything is local React state. People, availability, places,
and ideas are fictional fixtures in `src/features/meet-planning/demoPlans.ts`.
The flow assumes agreement from the group. It sends no invitations or messages,
makes no reservations, and uses no event registry, calendar, matching, or backend
API. Refreshing or navigating away clears the plan. No dependencies were added.

The feature uses the existing design tokens, shell, navigation, Button, and
RecordCard. Feature styling is scoped to the planning screen. Only the route
registration touches a shared source file.

Each step prioritizes the group, selected time, locations, and next action.
The action bar stays above navigation while scrolling; on very short screens
it returns to normal document flow to preserve reading space. Activity choices
show location and cost without promotional descriptions. Coral is reserved for
the final **Make plan** action.

## Checks

- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`
- Browser tests in `e2e/meet-planning.spec.ts` cover 320px, 390px, and desktop,
  selection guards, edits, reload behavior, keyboard operation, larger text,
  and reduced motion.
