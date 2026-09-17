# Pebble Design System

The design system serves the browser and Capacitor 8 from the same React DOM components. It is mobile-first, touch-first, and expands into a centered app frame on wider screens.

## Use

Import components from the public entry point:

```tsx
import { Button, RecordCard } from './design-system'
```

`src/index.css` imports `tokens.css`. Tailwind utilities such as `bg-page`, `text-ink`, `text-page-title`, `rounded-card`, and `shadow-float` are generated from those tokens.

## Rules

- Use semantic token utilities. Do not put palette hex values in components.
- Reserve coral primary actions for `Start matching`, `Accept match`, `Make plan`, and `Join event`.
- Keep controls at least 44px tall and preserve the shared focus ring.
- Build mobile layouts first; add wider-screen changes with responsive utilities.
- Use `100dvh` for full-height layouts. Do not use fixed `100vh` containers.
- Read safe areas through `--safe-area-*`. These support browser `env()` values and Capacitor 8 SystemBars fallbacks.
- Prefer CSS responsiveness over `Capacitor.getPlatform()` branches.
- Keep page copy in sentence case and under 70 characters per line where practical.

## Components

- `AppShell`: route outlet, centered frame, safe areas, and persistent navigation.
- `BottomNav`: the four product destinations with visible labels and active state.
- `Button`: primary and secondary actions.
- `RecordCard`: one distinct event, person, invitation, or profile summary.
- `EmptyState`: a condition, explanation, and optional next action.
- `PebbleScene`: idle and matching SVG scenes.

Add a component only after a repeated product pattern exists. Do not add remote fonts, icon packages, dark mode, or a second token layer without a concrete requirement.
