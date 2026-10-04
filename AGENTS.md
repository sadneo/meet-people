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

# Frontend

- Read `docs/DESIGN.md` before designing or changing product UI.
- Refer to `docs/UI-PLAN.md` as well for the direction for the app UI
- Reuse existing frontend components when available.
- `docs/DESIGN.md` is the product-design authority.
