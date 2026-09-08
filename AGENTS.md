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
