---
id: KNOWN-3
area: messages
severity: P2
type: bug
page: /messages; /messages/chat
viewport: 390x844; 1280x844
user: alice
---
**Summary:** New messages in an open chat do not update its inbox preview until the slower inbox poll.

**Steps:** Run `scratch/lead/inbox-recovery.mjs`. The script loads the real seeded inbox and chat, then injects deterministic API/network failures or an incoming message using Playwright routing. No chat records are changed.
**Expected:** Access loss is explained and disables sending; authoritative inbox polls remove ended chats; new chat messages update previews immediately; network failures preserve the draft and use actionable copy.
**Actual:** New messages in an open chat do not update its inbox preview until the slower inbox poll.
**Evidence:** `screenshots/KNOWN-3-before-1280.png` and lead browser output.
**Reproduced:** 2/2 at compact and expanded viewports; independently confirmed from Claude's known-issues list. KNOWN-2 tested in a separate inbox-only pass to isolate it from chat polling.
**Regression:** `tests/messaging.test.tsx`, proven to fail before fixes.
