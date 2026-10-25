# eslint-plugin-agent-guard

[![npm](https://img.shields.io/npm/v/eslint-plugin-agent-guard)](https://www.npmjs.com/package/eslint-plugin-agent-guard)
[![CI](https://github.com/ondrej-novak/eslint-plugin-agent-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/ondrej-novak/eslint-plugin-agent-guard/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/eslint-plugin-agent-guard)](LICENSE)

ESLint rules and Claude Code hooks that keep AI-written code small, named and readable.

AI coding agents write code that works. Left alone, they also write 180-line functions, `setTimeout(run, 10000)` with no hint of what 10000 is, six positional parameters, and `// download the file` above the line that downloads the file. Instructions in `CLAUDE.md` help, but the agent can ignore them. It cannot ignore a lint error that fails the build.

The five limits come from Alex Brohshtut's [ESLint as AI Guardrails](https://medium.com/@albro/eslint-as-ai-guardrails-the-rules-that-make-ai-code-readable-8899c71d3446): no comments, two parameters, 50 lines per function, 250 lines per file, no magic numbers. This package ships them as one preset and adds three things:

- **Messages that say where the fix goes.** "Maximum allowed is 2" says what is wrong. "Pass one typed object and destructure it" is what the agent acts on.
- **Closing the obvious escapes.** Disable comments have no effect, `const TEN_THOUSAND = 10000` is rejected, and the hooks stop the agent from editing the lint setup.
- **A feedback loop.** Every edited file is linted at once, and after three failures on the same file the agent is told to stop and ask.

It is the TypeScript sibling of [stylelint-plugin-design-system-guard](https://github.com/ondrej-novak/stylelint-plugin-design-system-guard).

## Install

```sh
npm install --save-dev eslint eslint-plugin-agent-guard
```

Needs Node 22.13+ or 24+ and ESLint 9.39+ or 10. The package also installs the `agent-guard` CLI for the [Claude Code hooks](#claude-code-hooks), and ships type declarations, so an `eslint.config.ts` type-checks.

```js
// eslint.config.js
import { defineConfig } from 'eslint/config';
import agentGuard from 'eslint-plugin-agent-guard';

export default defineConfig(
  { files: ['**/*.{js,jsx,ts,tsx}'], extends: [agentGuard.configs.recommended] },
);
```

A CommonJS config, such as the `eslint.config.js` Expo generates, loads the package with `require()`, which returns the module namespace. Take `.default`:

```js
// eslint.config.js (CommonJS)
const { defineConfig, globalIgnores } = require('eslint/config');
const agentGuard = require('eslint-plugin-agent-guard').default;

module.exports = defineConfig(
  globalIgnores(['.expo/']),
  { files: ['**/*.{js,jsx,ts,tsx}'], extends: [agentGuard.configs.react] },
);
```

Presets:

| Preset | |
|---|---|
| `recommended` | The rules below, disable comments switched off, size and number rules relaxed in test files |
| `react` | `recommended`, plus JSX parsing for `.js` and `.jsx` files |
| `angular` | `recommended`, plus a ban on importing `environments/environment` outside `main.ts` and `app.config.ts` |

Full configs for [React](examples/react/eslint.config.js) and [Angular](examples/angular/eslint.config.js) are in `examples/`.
For TypeScript, use the `typescript-eslint` parser. The core rules here understand TypeScript syntax, and `no-magic-numbers` ignores enums, numeric literal types, type indexes and readonly class fields.

## The five limits

| Rule | Preset setting | Hint added to the message |
|---|---|---|
| `agent-guard/max-lines-per-function` | 50, blank lines and comments skipped | Extract the steps into small, well-named functions. |
| `agent-guard/max-lines` | 250, blank lines and comments skipped | Split the file by responsibility into separate modules. |
| `agent-guard/max-params` | 2 | Pass one typed object and destructure it. |
| `agent-guard/no-magic-numbers` | `-1`, `0`, `1`, `2` allowed | Move it to a named constant, for example REQUEST_TIMEOUT_MS, at the top of the module or in a *.constants file. |
| `agent-guard/no-body-comments` | | |

The first four are ESLint's own rules with one extra option, `hint`. Every other option works as in the ESLint docs. Override the limits or the hints as you would for any rule:

```js
rules: {
  'agent-guard/max-lines-per-function': ['error', { max: 40, skipBlankLines: true, hint: 'See docs/code-shape.md.' }],
},
```

In files matching `*.spec.*`, `*.test.*` or folders named `test`, `tests`, `__tests__` and `e2e`, the size rules and `no-magic-numbers` are off. A `describe` block is one long function, and expected values are numbers.

### `no-body-comments`

Rejects comments inside function bodies. Comments elsewhere, including JSDoc on functions, classes and methods, stay allowed.

```ts
/** Retries once, because the storage API drops the first request after a cold start. */ // ✓
export async function download(url: string) {
  // download the file                                                                   // ✗
  const response = await fetch(url);
  // eslint-disable-next-line agent-guard/no-magic-numbers                              // ✗
  return response;
}
```

```
Comment inside a function body. Make the code say it instead: rename, or extract a well-named function. Put the why in JSDoc above the declaration.
```

The article bans every comment. That also removes the comments worth keeping, the ones that say why. Comments inside a function are where the narration happens, and where `eslint-disable-next-line` hides, so this rule draws the line there.

| Option | Default | |
|---|---|---|
| `allow` | `[]` | Regular expressions. A comment whose trimmed text matches one is allowed, for example `'^@ts-expect-error '` |
| `hint` | | Text appended to every message |

### `no-self-named-constant`

`no-magic-numbers` asks for a named constant, and the quickest way to satisfy it is a name that only repeats the number. This rule rejects constants, class fields and enum members whose name is just their value.

```ts
const TEN_THOUSAND = 10_000;      // ✗
const N_5 = 5;                    // ✗
const MINUS_ONE = -1;             // ✗
enum Size { Ten = 10 }            // ✗
const REQUEST_TIMEOUT_MS = 10_000; // ✓
const PAGE_SIZE_TEN = 10;          // ✓ says what it is for, even if clumsily
```

```
"TEN_THOUSAND" only restates its value 10000. Name it after what the number means, for example REQUEST_TIMEOUT_MS or MAX_RETRY_ATTEMPTS.
```

| Option | Default | |
|---|---|---|
| `hint` | | Text appended to every message |

### Disable comments

The presets set `linterOptions.noInlineConfig`, so `/* eslint-disable */` and `// eslint-disable-next-line` do nothing. If a rule is wrong for a file, change the config, which is a person's decision.

Generated files often start with `/* eslint-disable */`, and ESLint warns that it has no effect. ESLint only skips `node_modules/` and `.git/` on its own, so ignore generated folders such as `.expo/`, `dist/` or `coverage/` with `globalIgnores`, as in the CommonJS example above.

### Hints on other rules

`withHint` wraps any rule, so other plugins' rules can carry hints too:

```js
import tseslint from 'typescript-eslint';
import { withHint } from 'eslint-plugin-agent-guard';

const local = { rules: { 'no-explicit-any': withHint(tseslint.plugin.rules['no-explicit-any']) } };

export default [
  { plugins: { local } },
  { rules: { 'local/no-explicit-any': ['error', { hint: 'Use unknown and narrow it with a type guard.' }] } },
];
```

In an `eslint.config.ts`, take the rule from `@typescript-eslint/eslint-plugin` instead: `tseslint.plugin` is typed without its rules.

## Claude Code hooks

The package ships a small CLI for two [Claude Code hooks](https://docs.claude.com/en/docs/claude-code/hooks). Copy [`examples/.claude/settings.json`](examples/.claude/settings.json) into your project:

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Edit|Write|MultiEdit|NotebookEdit|Bash|PowerShell",
        "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/node_modules/eslint-plugin-agent-guard/bin/agent-guard.mjs\" protect" }] }
    ],
    "PostToolUse": [
      { "matcher": "Edit|Write|MultiEdit",
        "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/node_modules/eslint-plugin-agent-guard/bin/agent-guard.mjs\" lint" }] }
    ]
  }
}
```

The paths assume the package is installed in the project root. For an app in a subfolder, point them at its `node_modules`, for example `$CLAUDE_PROJECT_DIR/mobile/node_modules/eslint-plugin-agent-guard/bin/agent-guard.mjs`.

**`protect`** blocks edits to the lint setup: `eslint.config.*`, `.eslintrc*`, `.eslintignore`, `eslint-suppressions.json`, the same files for Stylelint, `.agent-guard.json`, `.claude/settings*.json` and `.husky/`. It also blocks changes to lint scripts and inline lint configs in `package.json`, Bash and PowerShell commands that write to those files, and `--no-verify` or `HUSKY=0`. The message tells the agent it may stop and explain why a rule makes the task impossible. A person then decides.

**`lint`** runs after every edit. JavaScript and TypeScript files go through the project's ESLint, stylesheets through its Stylelint when installed. Both are loaded from the project root, or, when the root has none, from the nearest folder above the edited file that has a `package.json`, so an app in `mobile/` is linted with its own ESLint and config. Errors go straight back to the agent. Failures are counted per file, so passing on one file does not reset another. After three failures in a row the agent is told to stop and report. If no ESLint is found at all, Claude Code shows you a notice once per session instead of the hook quietly doing nothing.

Both are optional. `.agent-guard.json` in the project root adjusts them:

```json
{
  "maxAttempts": 3,
  "protect": ["^src/generated/", "^docs/adr/"]
}
```

`protect` adds regular expressions tested against the path relative to the project. All protected names and patterns are matched without regard to case, because on Windows and macOS `ESLint.config.js` is the same file as `eslint.config.js`.

If `.agent-guard.json` is invalid, or a hook fails for any other reason, `protect` blocks the tool call and says why, and `lint` tells you the edit went unlinted. Claude Code lets a tool call through when its hook crashes, so a guard that crashed silently would be off.

A matching instruction for the agent is in [`examples/.claude/rules/code-shape.md`](examples/.claude/rules/code-shape.md). The rules hold either way; the instruction saves the agent a few failed attempts.

The hooks block the easy paths, not every path. Lint in CI is the real gate: run `eslint .` there and block the merge on errors.

## Existing codebases

On an existing app the size rules will report hundreds of errors on day one. Use ESLint's [bulk suppressions](https://eslint.org/docs/latest/use/suppressions): `eslint --suppress-all` records today's violations in `eslint-suppressions.json`, new code is held to the rules, and `eslint --prune-suppressions` removes entries as files get fixed. With ESLint 10 the `lint` hook reads the same file, so an agent editing an old file is only told about what it broke, and the `protect` hook stops it from adding to the file.

## Development

```sh
npm install
npm test
npm run lint
```

To release, bump `version` in `package.json`, merge, then publish a GitHub release tagged `v<version>`. The [release workflow](.github/workflows/release.yml) checks the tag against `package.json`, runs lint and tests, and publishes to npm with provenance. It needs an `NPM_TOKEN` repository secret.

## License

MIT
