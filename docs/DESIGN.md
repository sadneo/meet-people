# Pebble Design System

## Purpose

Pebble helps students make local, platonic connections. The interface should
feel like a tiny, cozy world sitting inside a straightforward social utility.
The pixel scene provides the personality; the surrounding interface stays
quiet, practical, and easy to scan.

## Principles

1. Home has one job: move someone toward meeting another person.
2. Reserve visual drama for the Pebble scene and connection-moving actions.
3. Make the application chrome calm and familiar. Do not turn every surface
   into a field guide, bulletin board, or game UI.
4. Show a clear next action in empty, loading, and error states.
5. Prefer one consistent pattern over several near-identical variants.

## Color

Use semantic names in code. Do not use palette values directly in component
styles.

| Token | Value | Use |
| --- | --- | --- |
| `--color-page` | `#FFF9EC` | Main application background |
| `--color-surface` | `#FFFFFF` | Navigation and elevated surfaces |
| `--color-ink` | `#3E4934` | Main text and icons |
| `--color-muted` | `#6D7862` | Supporting text and inactive UI |
| `--color-line` | `#E6DEC9` | Borders and separators |
| `--color-pine` | `#647653` | Secondary actions and active navigation |
| `--color-meadow` | `#A9C77E` | Scene-only landscape green |
| `--color-stone` | `#A89D87` | Scene-only rocks and quiet fills |
| `--color-coral` | `#FF7A63` | Actions that move a person toward an in-person connection |
| `--color-coral-pressed` | `#E96552` | Pressed coral actions |
| `--color-focus` | `#315F9B` | Visible keyboard focus ring |

Coral is exclusive to `Start matching`, `Accept match`, `Make plan`, and
`Join event`. It is not a general decoration or badge color. Scene colors do
not belong in application controls unless a component specifically represents
the world.

## Typography

Use a rounded system display stack for the Pebble wordmark and page titles,
with the system sans-serif stack for all application UI. The prototype does
not load remote fonts.

| Role | Size | Weight | Notes |
| --- | --- | --- | --- |
| Wordmark | 3rem | 800 | Compact, rounded, used only on Home |
| Page title | 1.75rem | 750 | One per standard screen |
| Section title | 1.125rem | 700 | Introduces a meaningful group |
| Body | 1rem | 450 | Default reading text |
| Supporting text | 0.875rem | 500 | Metadata and directions |
| Navigation label | 0.6875rem | 650 | Always visible under its icon |

Use sentence case. Avoid all-caps labels, decorative eyebrow text, and
monospace data labels. Keep body copy under 70 characters per line where
possible.

## Spacing And Shape

Use a four-pixel spacing base: `4`, `8`, `12`, `16`, `20`, `24`, `32`, `40`,
and `48` pixels. Standard screen content has `20px` horizontal padding on
mobile and a `32px` maximum outer gutter on larger screens.

| Token | Value | Use |
| --- | --- | --- |
| `--radius-control` | `14px` | Buttons and fields |
| `--radius-card` | `18px` | Record surfaces |
| `--radius-shell` | `24px` | Bottom navigation and app frame details |
| `--shadow-float` | soft moss-tinted shadow | Coral primary action only |

Do not put every section in a card. Cards represent distinct records such as
an event, person, invitation, or profile summary.

## Layout

The prototype is mobile-first. On desktop, retain a centered app frame rather
than turning the product into a wide dashboard.

```text
Desktop                         Mobile
+---------------------+         +-----------------+
|     app frame       |         |     content     |
|                     |         |                 |
|      page body      |         |   page body     |
|                     |         |                 |
|  Home Events Chats  |         | Home Events ... |
+---------------------+         +-----------------+
```

Standard content is left-aligned. The Home wordmark, scene, matching status,
and primary action are centered as a deliberate exception.

## Components

### App shell

Provides the page background, safe content area, centered desktop frame, and
room for the persistent bottom navigation. It does not add a header by
default.

### Bottom navigation

Has exactly four destinations: Home, Events, Chats, and Profile. Every item
uses an icon and visible text label. The current location is identified by
color and a small indicator, not color alone.

### Primary action

Coral, full-width on mobile, and described by the outcome: `Start matching`,
`Join event`, or `Make plan`. It has a visible focus ring, pressed state, and
disabled state. It never relies on an arrow glyph to communicate meaning.

### Secondary action

Text or quiet outlined control for reversible actions such as `Cancel search`
and `Edit profile`. It must remain visibly actionable and keyboard reachable.

### Record card

Used for a discrete event or profile summary. It has a clear title, compact
metadata, a single optional action, and no decorative shadow by default.

### Status and empty states

Explain the current condition and give a next step. Use `Looking around...`
while matching, not an indefinite spinner. An empty chat state directs someone
to matching or events.

## Pebble Scene

The scene is the brand signature, not a generic header illustration. It is a
small pixel-like diorama that represents the current Home state:

| State | Copy | Scene |
| --- | --- | --- |
| Idle | `Ready when you are.` | Pebble resting in a quiet meadow |
| Matching | `Looking around...` | Pebble moving through the meadow |
| Match found | `You found someone!` | Two pebbles meeting |
| Plan coming up | Event name and time | Pebbles gathered around an activity |

The initial prototype may implement only idle and matching. Build the scene as
a self-contained SVG placeholder with crisp, grid-aligned shapes. Do not add
a pixel-art dependency or use decorative animation. Any later animation must
respond to the user's matching action and respect reduced-motion preferences.

## Accessibility

- Meet WCAG AA contrast for text and interactive controls.
- Use semantic buttons and links. Do not attach click handlers to decorative
  scene elements until they have a defined action.
- Keep a visible `:focus-visible` ring using `--color-focus`.
- Bottom navigation has accessible names and an `aria-current` value for the
  active destination.
- Preserve a 44px minimum target for touch controls.
- Respect `prefers-reduced-motion` for any future scene movement.

## Boundaries

This system intentionally excludes a remote font provider, icon package,
asset pipeline, dark theme, elaborate elevation scale, and a broad component
catalog. Add them only after a real product need appears.
