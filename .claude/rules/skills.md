---
paths:
  - ".claude/skills/**"
---

# Skills

A skill's temporary working files go under `.skills-tmp/<skill-name>/` at the repo root (gitignored), never at the
repo root itself.

Scripts under `.claude/skills/` are linted with the repo's own preset like any other file: ES modules (`.mjs`), no
comments in function bodies, at most two parameters, numbers in named constants.
