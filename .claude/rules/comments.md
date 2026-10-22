---
paths:
  - "**/*.js"
  - "**/*.mjs"
  - "**/*.cjs"
---

# Code comments

**Default to no comment.** `agent-guard/no-body-comments` already rejects comments inside function bodies, so the
choice is only about JSDoc above a declaration. Write one only for a WHY the code can't show: a hidden constraint, a
workaround, an invariant a well-meaning refactor would break. Keep it to a line or two.

Never: narrate the next line, restate the name or parameters, label sections, leave notes about removed code, or
reference an issue, PR, commit or author (that belongs in the commit). The test: if deleting the comment wouldn't
confuse a future reader, don't write it.

If a comment inside a function feels necessary, the code wants a better name or an extracted function instead.
