---
id: AUTH-01
area: auth
severity: P1
type: bug
page: /profile; /login
viewport: 390x844; 1280x860
user: qa-auth-2@example.com
---
**Summary:** Logging out on one device traps another signed-in device behind an account error, including the sign-in page.

**Steps:**
1. Sign in to qa-auth-2@example.com with password123 in two independent browser contexts. In context A open `/profile`; in context B open `/settings`.
2. In context B select **Log out**. The app uses Supabase's default global sign-out, which revokes context A's server session as well.
3. Reload context A's `/profile`. Select **Retry**.
4. Navigate context A to `/login` and select **Retry account**.

**Expected:** An invalid server session leads back to a usable sign-in form, or offers a working sign-out/sign-in recovery action.
**Actual:** `/profile` is replaced with “Sign in with a valid session to use matching.” and Retry. `/login` shows “Could not load your account. Please try again.” and Retry account, with no email/password inputs and no Log out action. Retrying repeats 401; Back to home reaches the same account-loading barrier. Clearing browser storage is the only discovered recovery.
**Evidence:** screenshots/AUTH-recovered-revoked-profile-390.png; screenshots/AUTH-recovered-revoked-login-390.png; screenshots/AUTH-recovered-revoked-profile-1280.png; screenshots/AUTH-recovered-revoked-login-1280.png; `GET /api/matchmaking/account → 401` in both reproductions; login password-input count 0 and logout-button count 0.
**Reproduced:** 2/2 independent session pairs, at 390x844 and 1280x860.
**Suspected cause:** `src/auth/account.tsx` retains a locally valid Supabase session after an account 401; `src/auth/AuthScreen.tsx` sees that session and shows only account loading/retry. The barrier also removes the account menu and Settings recovery route.
**Reproduction script:** `node qa/runs/2026-10-18-1700/scratch/AUTH/recovered-revoked.mjs` (local stack required; logs statuses and UI text only).
