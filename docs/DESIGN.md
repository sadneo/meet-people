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
6. Order information by utility, social presence, Pebble personality, then
   decoration.
7. Design recurring screens for the fifteenth visit, not only the first
   screenshot.

## Product Structure

Pebble has four product destinations: Home, Events, Chats, and Profile. There
is no Community destination or separate Activities area.

- Home owns matching, the Pebble world, progression, balance, unlocks, and
  world customization.
- Events owns activity discovery, event details, joining, attendance, and
  event rewards.
- Chats owns conversations created through matches and events.
- Profile owns identity, preferences, and settings.

Use real routes and links for destinations. Do not reproduce product
navigation with feature-local tabs or component state.

## Screen Hierarchy

Recurring product screens are not landing pages. Standard screens begin with
a concise page title and immediately expose useful records, status, filters,
or actions. Do not repeat this marketing-page structure on product routes:

```text
eyebrow -> oversized statement -> mood copy -> large illustration
```

Large editorial statements and centered compositions are reserved for
onboarding, true empty states, and meaningful milestones. A returning user
should understand the current state and next action without reading mood copy.

Use space to separate groups, not to hide low information density. At common
mobile and desktop sizes, prioritize useful records and controls above the
fold. Decoration must shrink before functional information does.

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

Use a rounded system display stack for the Pebble wordmark, a restrained serif
stack for editorial headings, and the system sans-serif stack for application
UI. The prototype does not load remote fonts. Serif type adds identity; it
must not make functional records slower to scan.

| Role | Size | Weight | Notes |
| --- | --- | --- | --- |
| Wordmark | 3rem | 800 | Compact, rounded, used only on Home |
| Page title | 1.75rem | 700 | One per standard screen; serif is optional |
| Section title | 1.125rem | 700 | Introduces a meaningful group |
| Body | 1rem | 450 | Default reading text |
| Supporting text | 0.875rem | 500 | Metadata and directions |
| Navigation label | 0.6875rem | 650 | Always visible under its icon |

Use sentence case. Avoid all-caps labels, decorative eyebrow text, and
monospace data labels. Keep body copy under 70 characters per line where
possible. Functional text must use `Supporting text` or larger. Smaller text
is limited to nonessential legal or prototype notes and must still meet WCAG
AA contrast.

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

Event cards follow the questions people use to decide whether to participate:

1. When is it?
2. Where is it?
3. What is it?
4. Who is hosting and attending?
5. Is there space, and what can I do next?

Show date and time prominently, then location, event name, host, recognizable
attendees, capacity when relevant, and one literal action such as
`View event` or `Join event`. Duration, category, rewards, and illustration are
secondary. Do not make art or currency more prominent than people.

### Social presence

Pebble is a social utility. Human presence is content, not decoration. Prefer
names and meaningful attendee summaries such as `Jamie, Aaron, and 2 others`
over anonymous dots or unexplained overlapping circles. Never imply that demo
people, attendance, verification, or availability are real.

### Progression and Pebbles

The Home scene is the single visual source of truth for world progression. Do
not repeat the current stage in a scene caption, timeline, progress panel, and
completion panel at the same time. Pair the scene with one compact status and
one next action.

Always connect the loop explicitly:

```text
participate in an event -> earn Pebbles -> advance the Home world
```

Rewards reinforce participation; they do not replace an event's social value
or become its primary card action. World customization opens as a deliberate
Home action rather than a permanent style-control strip.

### Dialogs

A dialog handles one task. Its title states that task, its body shows only the
information needed to complete it, and it has at most one primary action.
Completion dialogs summarize the outcome first; optional accounting details
belong in a disclosure. Do not leave completed or impossible controls visible
as disabled workflow debris.

Use native `<dialog>` until product needs require a shared primitive. Provide a
labelled title, useful description, Escape and close behavior, focus return,
short-screen scrolling, and 44px controls.

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

The scene and its progression remain on Home. Event artwork may borrow its
pixel/diorama language, but Events must not become a second game screen.

## Voice

Pebble is warm, not relentlessly whimsical. Use expressive copy for one page
heading, a milestone, an empty state, or an occasional event name. Use plain,
literal language for navigation, metadata, status, instructions, and actions.

- Say `Attendance confirmed`, not `Seen by your people`.
- Say `Reset demo`, not `Start a fresh story`.
- Say `Collect 40 Pebbles`, not `Bring 40 Pebbles home`.

Each text element does one job. Do not stack a slogan, poetic heading,
sentimental subtitle, decorative section label, and whimsical footer on one
screen.

## Prototype Controls

Prototype machinery must not masquerade as product UI. Label simulations and
fictional data directly, place demo controls outside the primary hierarchy,
and never describe simulated proof as verified attendance. Destructive reset
controls remain quiet, separate, and confirmed.

## Accessibility

- Meet WCAG AA contrast for text and interactive controls.
- Use semantic buttons and links. Do not attach click handlers to decorative
  scene elements until they have a defined action.
- Keep a visible `:focus-visible` ring using `--color-focus`.
- Bottom navigation has accessible names and an `aria-current` value for the
  active destination.
- Preserve a 44px minimum target for touch controls.
- Respect `prefers-reduced-motion` for any future scene movement.

## Review Checklist

Before considering a product screen complete, verify:

- The purpose and next action are clear within a few seconds.
- Returning users reach useful content without crossing a repeated hero.
- Important time, place, people, capacity, and state are not styled as
  footnotes.
- Social information is at least as prominent as rewards and illustration.
- Actions describe their actual outcome and completed controls disappear.
- The screen uses shared tokens, shell, navigation, controls, and focus rules.
- Functional text is at least 0.875rem, meets WCAG AA contrast, and survives
  200% zoom.
- Every control has a 44px target and a visible keyboard focus state.
- The layout works at 320px width and on a short viewport without hiding
  content or dialog actions.
- Removing decorative copy or art would not make the product harder to use.

## Boundaries

This system intentionally excludes a remote font provider, icon package,
asset pipeline, dark theme, elaborate elevation scale, and a broad component
catalog. Add them only after a real product need appears.

It also excludes a Community route, feature-local shell, competing token
layer, and screenshot-specific component variants.
