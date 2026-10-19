---
id: KNOWN-2
area: messages
severity: P2
type: bug
page: /messages; /messages/chat
viewport: 390x844; 1280x844
user: alice
---
**Summary:** Ended conversations remain in the inbox after a successful poll.

**Steps:** Run `scratch/lead/inbox-recovery.mjs`. The script loads the real seeded inbox and chat, then injects deterministic API/network failures or an incoming message using Playwright routing. No chat records are changed.
**Expected:** Access loss is explained and disables sending; authoritative inbox polls remove ended chats; new chat messages update previews immediately; network failures preserve the draft and use actionable copy.
**Actual:** Ended conversations remain in the inbox after a successful poll.
**Evidence:** `screenshots/KNOWN-2-before-390.png` and lead browser output.
**Reproduced:** 2/2 at compact and expanded viewports; independently confirmed from Claude's known-issues list. KNOWN-2 tested in a separate inbox-only pass to isolate it from chat polling.
**Regression:** `tests/messaging.test.tsx`, proven to fail before fixes.
