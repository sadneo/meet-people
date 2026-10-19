---
id: FORMS-03
area: auth
severity: P2
type: visual
page: /login (password step); /reset-password
viewport: 390x844; 1280x720
user: guest
---
**Summary:** Password and recovery actions retain browser-blue link styling that breaks the account forms' forest palette.

**Steps:** Open the password sign-in step, or open `/reset-password` without a recovery session.
**Expected:** Text links use the existing semantic forest colors while retaining recognizable underlines, hover treatment, and keyboard focus.
**Actual:** **Forgot password?** and **Request another link** render as `rgb(0, 0, 238)`, while **Back to home** and surrounding controls use the app palette. The local email-viewer link leaks the same browser default.
**Evidence:** `screenshots/FORMS-password-390.png`; `screenshots/FORMS-expired-recovery-390.png`; desktop counterparts at 1280px. Computed **Forgot password?** color is `rgb(0, 0, 238)` at both sizes.
**Reproduced:** Two form states at two sizes.
**Proposed fix:** In `src/auth/account.css`, scope text-link color, visited color, underline offset, and hover styling to `.pt-auth`; preserve existing `.pt-button` styling and focus behavior.
**User direction:** The user requested removal of “New to Pebble? Create an account”. The lead already removed that paragraph in main. This finding and fix do not restore it or change `AuthScreen.tsx`.

