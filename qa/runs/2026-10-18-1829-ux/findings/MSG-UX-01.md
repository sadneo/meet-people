---
id: MSG-UX-01
area: messages
severity: P2
type: visual
page: /messages; /messages/chat
viewport: 801x844; 1280x720; 1920x1080
user: alice (read-only; mark-read requests intercepted)
source: reported by the user after the run; testers missed it
---
**Summary:** Expanded Messages reserves an empty 26% details column, leaving a blank gap beside the conversation.

**Steps:** Open `/messages` as alice at 801px or wider, with or without a one-on-one chat selected.
**Expected:** The conversation uses the available width. A Participants list only appears where it helps, in conversations of more than two people.
**Actual:** The `.pt-chat-details` aside always occupies the third grid column. With no chat selected, and no local demo plan, it is empty. In a one-on-one chat it only lists the two people already shown in the chat header.
**Fix:** `src/features/messaging/Feature.tsx` renders the aside only when it has content. Participants appear only when `participants.length > 2`, as the user directed; the local demo plan still uses the column. `src/features/prototype/messages.css` adds `.pt-messages-workspace.is-two-pane` with 26/74 columns. `docs/DESIGN.md` is updated to match.
**Verified:** with no aside, columns are 189/538px at 801, 302/860px at 1280 and 453/1290px at 1920. There is no horizontal overflow, and bubble widths stay capped. Screenshots: `screenshots/after/messages-inbox-801x844.png`, `messages-chat-1280x720.png`, `messages-chat-1920x1080.png`.
**Test:** `e2e/messaging-persistence.spec.ts` checks that the details column is absent and the chat pane reaches the workspace edge for a direct chat. It also checks that Participants lists all 3 people for the fixture group, now Sam, Jordan and Casey.
