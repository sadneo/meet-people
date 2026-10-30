# `src/alt` — alternate Pebble frontend

A standalone, framework-free frontend (the "Pebble Implementation Starter" snapshot,
hosted v119, source commit `b6006352c4bfc11bb6c7944681d7f268125d2b10`).
It is **fully isolated from the React/Vite app** in the rest of `src/`:
nothing in `src/` imports from here, and nothing here imports from `src/`, so it
is never part of `pnpm build`, `tsc`, or the Vite module graph.

## Run

```bash
pnpm dev:alt                 # http://localhost:5174
pnpm dev:alt --port 4000     # custom port
pnpm dev:alt --open          # also open the browser
pnpm test:alt                # fixture interaction checks (Node only)
```

Landing page → **Sign in** → **Sign in as dev** to enter the fixture app.
Everything is in-memory and resets on refresh.

## Layout

| Path | What it is |
| --- | --- |
| `app/` | The editable frontend: `index.html`, `app.js`, `account-ui.js`, `sky-garden.js`, `legal.js`, CSS, `assets/` |
| `serve.mjs` | Zero-dependency static dev server (no-store caching, so a refresh always picks up edits) |
| `tests/` | `account-ui.test.cjs` — runs the JS in a Node `vm` with a stub DOM |
| `docs/` | `APP-GUIDE.md`, `DESIGN-REVIEW.md`, `ASSET-INVENTORY.csv` from the starter package |

## Maintaining it separately

- Edit files in `app/` directly. Refresh the browser; no build step.
- The standalone `Pebble.html` from the starter zip is a *generated export* and is
  intentionally not included. Don't hand-edit an export and the modular files in parallel.
- Keep the DEV bypass, fixture people and simulated account operations here only;
  they must not be ported into the production React app as real behavior.
- When porting a screen to React, treat `app/` as the visual/interaction reference
  and `docs/APP-GUIDE.md` as the spec.
- Suggested tooling hygiene (see the root repo notes): ignore `src/alt/**` in ESLint,
  Prettier (optional), and Vitest/Jest globs so the root toolchain doesn't touch it.
