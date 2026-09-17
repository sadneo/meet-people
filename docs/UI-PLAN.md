# Pebble UI Plan

## Goal

Create a polished, mobile-first visual prototype for a student-focused,
platonic social app. The prototype demonstrates the product's core navigation
and the focused Home matching experience. It does not connect to matching,
events, chat, profile, or Supabase data.

## Information Architecture

| Route | Purpose |
| --- | --- |
| `/` | Start or cancel matching from the Pebble world |
| `/events` | Browse an event registry and see how joining an event looks |
| `/chats` | See the empty conversations state and its next step |
| `/profile` | Review a concise student profile and preferences summary |
| `*` | Show the existing not-found experience |

There is no separate Match or Community route. Matching is Home's primary
action. A future community or progression feature can be entered from the
scene only when it grows into a meaningful destination.

## Home

Home is centered and intentionally sparse.

```text
             Pebble

        [ stateful scene ]

        Ready when you are.

        [ Start matching ]

 Home      Events      Chats     Profile
```

### Prototype states

| State | Trigger | Content | Action |
| --- | --- | --- | --- |
| Idle | Initial load or cancellation | Resting Pebble scene and `Ready when you are.` | `Start matching` |
| Matching | Start matching | Searching Pebble scene and `Looking around...` | `Cancel search` |

Do not simulate an automatic match or invent a named match. Match-found and
plan-coming-up states belong in the design system for later implementation,
but do not need a fake data flow in this prototype.

## Events

The Events screen is a date-led registry, not a social-media feed. It uses a
title, a short location/filter summary, and a small set of static event cards.
Each card shows the date, time, event name, host/location, and one `Join event`
action. Use enough example records to establish hierarchy, not an endless list.

## Chats

The first version is an empty state. It explains that conversations begin after
matching and gives a clear action back to Home. Do not fabricate messages,
unread counts, or an online presence system.

## Profile

The first version is a compact identity summary for a student. It shows a
name, course or campus context, a short introduction, selected interests, and
availability preferences. `Edit profile` is visual-only for now.

## Shared UI

- A persistent four-item bottom navigation appears on every product route.
- The active route stays identifiable when icons fail to load because labels
  remain visible.
- Standard routes use left-aligned page titles and content; Home is centered.
- Each route reserves space for the bottom navigation so content is never
  obscured on a short screen.

## Implementation Shape

Keep the initial implementation small:

```text
src/
  components/
    AppShell.tsx        shared page frame
    BottomNav.tsx       four-route navigation
    PebbleScene.tsx     SVG placeholder scene
  routes/
    Home.tsx            idle and matching prototype state
    Events.tsx          static event registry
    Chats.tsx           empty state
    Profile.tsx         static profile summary
    NotFound.tsx
  App.tsx               route definitions
  index.css             design tokens and component styles
```

Use CSS custom properties and semantic class names. Tailwind remains available
but should not be used to create a second, competing token system. Use inline
SVG for the placeholder scene and navigation icons rather than adding an icon
or image dependency.

## Interaction Rules

- `Start matching` changes Home to the matching state without a network call.
- `Cancel search` restores the idle state.
- Bottom navigation uses real router links.
- Prototype actions outside Home remain visually present but do not promise
  completed workflows. If clicked, they should either be disabled with a clear
  label or have no action until their behavior is designed.

## Verification

1. Route tests cover Home, Events, Chats, Profile, and the fallback route.
2. A Home interaction test verifies that matching starts and can be cancelled.
3. The browser smoke test confirms the Home title and API health endpoint.
4. Review at mobile width and desktop width, using keyboard-only navigation.
5. Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build`.

## Non-Goals

- Authentication and data fetching
- Real matching, event registration, chats, or profile editing
- Community/progression screen
- Pixel-art generation or an asset pipeline
- A general-purpose component library or dark mode
