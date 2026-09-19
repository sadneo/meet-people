# Package Management

This project uses pnpm exclusively.

- NEVER use `npm`.
- NEVER use `npx`.
- Use `pnpm install` instead of `npm install`.
- Use `pnpm add` instead of `npm install <package>`.
- Use `pnpm run <script>` or `pnpm <script>` instead of `npm run <script>`.
- Use `pnpm dlx` instead of `npx`.
- Do not create or modify `package-lock.json`.
- `pnpm-lock.yaml` is the canonical lockfile.

# Product Design

- Read `docs/DESIGN.md` before designing or changing product UI.
- Reuse `src/design-system/` components and tokens. Its `README.md` contains
  implementation rules; do not create a feature-local design system.
- `docs/DESIGN.md` is the product-design authority. `src/design-system/` is
  its implementation. Resolve conflicts in favor of `docs/DESIGN.md`.
- Do not merge, cherry-pick, copy, or adapt UI from
  `feature/pebble-community-ui`. Rebuild approved behavior from the design
  system and current product requirements.
- Pebble has no Community destination. World/progression features belong on
  Home; activity discovery and participation belong under Events.
