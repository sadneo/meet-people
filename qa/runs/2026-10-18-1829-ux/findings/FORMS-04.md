---
id: FORMS-04
area: messages
severity: P2
type: visual
page: /messages; /messages/chat
viewport: 801x844
user: alice (read-only; mark-read requests intercepted)
---
**Summary:** At the expanded layout's narrow edge, the Refresh button covers most of the Messages heading.

**Steps:** Open `/messages` at 801px wide, then open an existing chat.
**Expected:** Both the Messages title and Refresh remain fully readable; the button wraps below the heading when the inbox pane cannot fit them together.
**Actual:** The 186.39px inbox pane shrinks the heading's wrapper below its text width, allowing Refresh to overlap the word “Messages”. Flex wrapping is enabled, but the title wrapper's `flex: 1; min-width: 0` prevents the wrap from happening.
**Evidence:** `screenshots/FORMS-inbox-801x844.png`; `screenshots/FORMS-chat-801x844.png`; `scratch/messages-heading-bounds.json`. The text and button overlap by 67.55px horizontally and 35px vertically. The 1280px control has no overlap.
**Reproduced:** Inbox and selected-chat states at 801px.
**Proposed fix:** In `src/features/messaging/messaging.css`, give the inbox heading wrapper an intrinsic flex basis so Refresh wraps rather than covering the title. Keep the prescribed 26/48/26 columns, existing type scale, and 800px shell boundary.

