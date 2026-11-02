# Local development sign-in

With local Supabase running and `.env.local` configured, click **Sign in as dev**. The development-only Vite endpoint creates a confirmed,
marked local account with a starter profile on first use, then returns a verified
session. Later sign-ins reuse the account and preserve its completed profile.

Provisioning only accepts `http://127.0.0.1:54321`. It requires the server-only
`SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_PUBLISHABLE_KEY`; neither the admin key
nor the generated password is returned to the browser. Requests must be same-origin
and loopback, using `localhost` or `127.0.0.1`. Production and preview builds do
not register the endpoint.

The generated password is stored with owner-only permissions at
`~/.local/share/pebble/development-account.json`. Keep this file while retaining
the local database. If it is missing but the reserved account already exists,
provisioning refuses to reset that account's password. Existing manually configured
development credentials continue to use the original verified sign-in flow.

Account identity: `pebble-development@example.test`, UUID
`d0000000-0000-4000-8000-000000000001`, Auth metadata marker
`pebble_development=local-development-v1`. Cleanup can target this marked local
account through local Supabase Studio; deleting the credential file alone does
not delete the account. No other demo users or matchmaking queues are created.

## Windows and troubleshooting

Windows credential reads validate NTFS ownership and access rules: only the current
user, SYSTEM and Administrators may have access, and reparse-point files are refused.
Unix still requires the current owner and mode 0600. No credential permissions are
silently relaxed. The local endpoint keeps its same-origin, loopback and development-only guards.

If provisioning is unavailable, start Docker Desktop and check that the existing
local Supabase containers are running. Restart `pnpm dev` after changing local
configuration. Do not reset the database or delete the credential file as a login fix.
The Windows reader previously rejected valid files because it relied on Unix
`getuid()` and mode bits; this has been corrected. First-time provisioning now
saves all four required onboarding chapters sequentially before verifying readiness.
A failed chapter stops the operation; a completed account is not overwritten.

On October 31, 2026, the existing local account passed the real browser button,
returned HTTP 200 and remained signed in after reload. This is a local result,
not evidence about hosted sign-in or deployment readiness.
