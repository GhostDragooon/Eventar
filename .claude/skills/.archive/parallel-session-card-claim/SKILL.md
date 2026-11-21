---
name: parallel-session-card-claim
description: Use when starting a card or messaging a linked session.
category: git-workflow
---

# Claim a card before building; never relay a go

1. Before starting a card or spawning a session for it, run `list_sessions` with `linked: true` and search the titles for the card ID (for example UX-02). If another session already owns the card, message that session or stop. Never start a second one.
2. A go or push approval belongs to the session where Ivan gave it. Do not forward it to another session as if Ivan had said it there. Send the task and state that the approval is still pending.
3. Push approval is per session. Ask for it at wrap-up with the exact SHA, never from a go quoted in a handoff or a message.
4. If a duplicate session already started, name both session IDs to Ivan and let him pick which one to keep. Do not archive or kill either one on your own.
