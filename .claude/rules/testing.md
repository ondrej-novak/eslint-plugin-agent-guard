---
paths:
  - "test/**"
  - "src/**"
---

# Testing

## Running tests

1. **Always synchronous**, never `&`, `nohup` or `run_in_background`. Narrow a run with a file:
   `npm test -- test/no-body-comments.test.js`. Run the full suite and `npm run lint` before calling a task done.
2. **Read the whole output**, not a `grep` or `tail` of it. A skipped test is not a failure: the bulk suppressions tests
   are skipped on purpose when the installed ESLint can't apply `eslint-suppressions.json` (ESLint 9).
3. On failure, read the output and fix. Don't re-run an unchanged failing test hoping it passes.

## Writing tests

- **Every test must catch something no other test catches.** Before adding an `it()`, check whether an assertion in an
  existing test covers it. Prefer adding an assertion or a RuleTester case to a new test.
- Rules are tested with `RuleTester` (`test/rule-tester.js`): `valid` cases for what the rule leaves alone, `invalid`
  cases with the `messageId` and the data the message carries. The message is the fix instruction, so assert on it.
- A false positive found in the wild becomes a `valid` case before the rule changes.
- Hook tests feed the hook the JSON Claude Code would send and lint files in `test/fixtures/project`. Files the tests
  write under `test/fixtures/project/src/` are gitignored; leave `.gitkeep` in place.
- Test names say the behavior, not the mechanism: "blocks edits to eslint.config.js", not "calls isProtected".
- Mock only what the test can't own: the clock, the temp directory, the process environment. Never mock ESLint.
