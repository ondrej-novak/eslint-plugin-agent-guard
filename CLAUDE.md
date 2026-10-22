# eslint-plugin-agent-guard

ESLint rules, flat config presets and Claude Code hooks that keep AI-written code small, named and readable.
Sister project of [stylelint-plugin-design-system-guard](https://github.com/ondrej-novak/stylelint-plugin-design-system-guard): same ideas, same tone.

## Layout

- `src/with-hint.js` wraps any existing ESLint rule so its options accept a `hint` that is appended to every message.
- `src/rules/core.js` wraps the four core rules the presets use: `max-lines`, `max-lines-per-function`, `max-params`, `no-magic-numbers`.
- `src/rules/no-self-named-constant.js` and `src/rules/no-body-comments.js` are the two rules of our own.
- `src/configs.js` builds the `recommended`, `react` and `angular` presets.
- `src/hooks/` holds the Claude Code hooks, run through `bin/agent-guard.mjs protect|lint`.
- `test/` uses vitest and ESLint's `RuleTester`. `test/fixtures/project` is a tiny project the hook tests lint.

## Commands

```sh
npm test        # vitest
npm run lint    # this repo is linted with its own recommended preset
```

Run both before you say a change is done. CI runs them on Node 22 and 24 with ESLint 9 and 10.

## How we write code here

- The repo follows its own rules: functions up to 50 lines, files up to 250, at most two parameters, no magic numbers, no comments inside function bodies. JSDoc above a declaration explains why it exists.
- Plain JavaScript with ES modules. No build step, no TypeScript in `src`.
- Rule messages tell the reader what to do, not only what is wrong. An agent should be able to fix the code from the message alone.
- Keep rules narrow. A rule that fires on legitimate code teaches people and agents to look for a way around it.
- Every rule change comes with RuleTester cases for what it reports and what it leaves alone.
- README sections follow the existing pattern: a short reason, ✗/✓ examples, an options table.

## Guardrails on this repo

`.claude/settings.json` runs this package's own hooks: edits to lint configuration are blocked and every edited file is linted. If a rule makes a task impossible, stop and explain which rule and why. Do not work around it.
