# Integrating live events

## Module boundaries

- `api/events.ts`, `shared/events.ts`, and the migration provide the API contract
  and persistent event interest/groups independently of any frontend shell.
- `src/features/events/Browse.tsx` exports `EventsScreen` and `EventDetail`.
  Both provide their own feature styling but no navigation, main element, or
  outer page gutters. Mount them beneath the destination app's existing shell.
- `src/routes/Events.tsx` and `events-layout.css` are the standalone adapter for
  the ingestion branch. They supply `main`, page gutters, and its bottom navigation.
  Full-app integrations do not need this adapter.
- `src/features/events/routes.ts` owns list/detail paths and exports
  `isEventDetailPath` for app-level navigation and scene detection.
- `src/auth/useSession.ts` observes the same persisted Supabase session used by
  event API requests. App-level account controls can consume this hook as well.

## Integrating into dev

Keep `dev`'s app shell and mount the two screens as its children:

```tsx
import { EventDetail, EventsScreen } from './features/events/Browse'
import { eventDetailRoute, eventsPath } from './features/events/routes'

<Route element={<AppShell />}>
  {/* Existing routes remain here. */}
  <Route path={eventsPath} element={<EventsScreen />} />
  <Route path={eventDetailRoute} element={<EventDetail />} />
</Route>
```

Use `src/routes/Events.tsx` instead if retaining the ingestion branch's wide,
standalone events layout. Choose one shell: screens never add a second navbar.

## Integrating into the full prototype

Keep the prototype's `PebbleApp`, `AppShell`, Home, and global styles. In
`src/App.tsx`, replace the import of fixture-based events from
`./features/prototype/Browse` with the two live screens, and mount them beneath
the prototype shell using the routes shown above. Retain all other prototype
screens. Replace `/events/detail` with `/events/:id`; real IDs are Supabase UUIDs.

The prototype currently compares `pathname` against fixed scene paths. In
`src/routes/PebbleApp.tsx`, import the route helper and update its scene lookup:

```tsx
import { isEventDetailPath } from '../features/events/routes'

const scene: Scene = isEventDetailPath(pathname)
  ? 'Event Detail'
  : scenes.find(value => scenePaths[value] === pathname) ?? 'Home'
```

This preserves the Events active tab on detail URLs. The development scene
picker must also avoid navigating to the old `/events/detail` path. Either omit
`Event Detail` from that picker (details are selected through the event list), or
route that picker option to `/events`. Remove the obsolete fixed detail path
only after updating its remaining callers. The live screens do not use the
prototype's fixture `eventId`, `setEventId`, or `empty` toggle.

## CSS and authentication

Live events use only `ev-*` classes and custom properties. All feature rules are
scoped beneath `.ev-feature`; no styles target `.pt-app`, the document body,
prototype buttons, or host navigation. This preserves the copied events design
without changing other prototype screens when the stylesheet loads.

The backend uses the identity verified from the Supabase access token. A
prototype profile named Alex or a demo login action does not authenticate a
person. When converting the prototype's login to real authentication, use the
existing `src/supabase.ts` client and `useSession` hook. Do not initialize a
second client/session or send prototype person IDs to event APIs. The inline
event email-link sign-in can stay until the app-wide login is connected.

## Suggested commit split

The current work remains uncommitted. To make selective integration easier,
create two commits when ready:

1. Backend: `api/`, `shared/events.ts`, the event-company migration, generated
   database types, API environment/script changes, backend tests, and the live
   integration test script. Include backend setup documentation here.
2. UI: `src/features/events/`, `src/auth/useSession.ts`, the standalone route
   adapter/styles, `src/App.tsx`, event image assets, company UI tests, browser
   tests, and this integration guide.

The backend commit can be integrated first. Resolve app-shell conflicts using
the destination branch's UI, then apply the routing and session integration
above. Do not discard the event route changes merely to resolve `App.tsx`.

After integration, run `pnpm verify` and browser tests covering `/events`, a
direct `/events/:id` refresh, the Events active tab, the host Home screen, mobile
navigation, and interest/group persistence with a real Supabase session.
