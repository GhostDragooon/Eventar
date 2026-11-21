---
name: eventar-server-action-write-order
description: Use when a Server Action's RPC reply is mapped or checked.
category: verification
---

# After a committed write, run revalidation before any check on the reply

- Once the RPC or write has committed, call `revalidatePath` and every other side effect before any shape check or mapping that can throw. A throw after commit leaves the page stale while the write stands.
- Map a known database error (a window violation, a capacity guard) to its own user-facing copy, by error code or message. A generic "failed" hides a rule the user can act on.
- A null or unexpected reply after a committed write is still reported as an error. It must not skip the revalidation the committed write needs.
- Test first: the mapped-error case and the null-reply case each fail on the current code before the change.
- Read the copy back in the walk, on the page that shows it.
