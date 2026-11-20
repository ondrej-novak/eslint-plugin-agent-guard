# eslint-plugin-agent-guard

[![npm](https://img.shields.io/npm/v/eslint-plugin-agent-guard)](https://www.npmjs.com/package/eslint-plugin-agent-guard)
[![CI](https://github.com/ondrej-novak/eslint-plugin-agent-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/ondrej-novak/eslint-plugin-agent-guard/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/eslint-plugin-agent-guard)](LICENSE)

ESLint rules and agent hooks for Claude Code, Cursor and Codex that keep AI-written code small, named and readable.

AI coding agents write code that works. Left alone, they also write 180-line functions, `setTimeout(run, 10000)` with no hint of what 10000 is, six positional parameters, and `// download the file` above the line that downloads the file. Instructions in `CLAUDE.md` help, but the agent can ignore them. It cannot ignore a lint error that fails the build.

The five limits come from Alex Brohshtut's [ESLint as AI Guardrails](https://medium.com/@albro/eslint-as-ai-guardrails-the-rules-that-make-ai-code-readable-8899c71d3446): no comments, two parameters, 50 lines per function, 250 lines per file, no magic numbers. This package ships them as one preset and adds three things:

- **Messages that say where the fix goes.** "Maximum allowed is 2" says what is wrong. "Pass one typed object and destructure it" is what the agent acts on.
- **Closing the obvious escapes.** Disable comments have no effect, `const TEN_THOUSAND = 10000` is rejected, and the hooks stop the agent from editing the lint setup.
- **A feedback loop.** Every edited file is linted at once, and after three failures on the same file the agent is told to stop and ask.

[eslint-plugin-human-first](https://github.com/olistic/eslint-plugin-human-first) ships the article's rules as written and bans JSDoc with every other comment. This package keeps JSDoc, because why the code exists is the one thing the code cannot say, and adds the hooks, because an agent can edit an ESLint config as easily as any other file.

It is the TypeScript sibling of [stylelint-plugin-design-system-guard](https://github.com/ondrej-novak/stylelint-plugin-design-system-guard).

## Install

```sh
npx eslint-plugin-agent-guard init
```

Run it in the folder with your `package.json`. It installs `eslint` and this package with the package manager your lockfile shows, creates an `eslint.config.js` with the preset that fits your dependencies when there is no ESLint config yet, adds the [agent hooks](#agent-hooks) to `.claude/settings.json` in the repository root, and copies an instruction for the agent to `.claude/rules/code-shape.md`. Add `--codex` to set up [Codex](#codex) too; it is added anyway when a `.codex` folder exists. `--skip-install` leaves the dependencies to you. It never overwrites a file: an existing config is left alone with a note on what to add, and existing hooks are kept.

Use the full package name. `agent-guard` is the CLI's name once the package is installed, but on npm it belongs to an unrelated package, so `npx agent-guard` in a project without this package downloads and runs that one.

To set it up by hand:

```sh
npm install --save-dev eslint eslint-plugin-agent-guard
```

Needs Node 22.13+ or 24+ and ESLint 9.39+ or 10. The package also installs the `agent-guard` CLI for the [agent hooks](#agent-hooks), and ships type declarations, so an `eslint.config.ts` type-checks.

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

Comments that tools act on are always allowed, because deleting them changes the output: bundler annotations such as `/*#__PURE__*/`, webpack magic comments, `/* @vite-ignore */`, `istanbul`, `c8` and `v8` ignore hints, `node:coverage` and `prettier-ignore`.

| Option | Default | |
|---|---|---|
| `allow` | `[]` | Regular expressions for more comments to allow. A comment whose trimmed text matches one is allowed, for example `'^@ts-expect-error '` |
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

## Agent hooks

The package ships a small CLI for two hooks, `protect` and `lint`. They run in Claude Code, in Cursor, which loads the same file, and in [Codex](#codex). `init` sets them up; by hand, for [Claude Code](https://docs.claude.com/en/docs/claude-code/hooks), copy [`examples/.claude/settings.json`](examples/.claude/settings.json) into your project:

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Edit|Write|MultiEdit|NotebookEdit|Bash|PowerShell|Shell|Delete",
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

**`protect`** blocks edits to the lint setup: `eslint.config.*`, `.eslintrc*`, `.eslintignore`, `eslint-suppressions.json`, the same files for Stylelint, `.oxlintrc.json` and `oxlint.config.*`, `.agent-guard.json`, `.claude/settings*.json`, `.husky/`, and the agent hook files `.cursor/hooks.json`, `.codex/hooks.json` and `.codex/config.toml`. It also blocks changes to lint scripts (any script whose name or command mentions lint) and inline lint configs in `package.json`, while other `package.json` edits such as adding a dependency go through, Bash and PowerShell commands that write to those files (with `/` or `\` in the path) or remove `.husky`, `.claude`, `.cursor`, `.codex` or this package, and skipping git hooks with `--no-verify`, `git commit -n`, a changed `core.hooksPath` or `HUSKY=0`. Those flags are read the way the shell reads them, so a commit message or PR body that mentions `--no-verify` goes through. `npm pkg set` on a lint script is blocked, and so is any other shell command that writes to `package.json`, because its result cannot be judged: that message sends the agent to the Edit tool. `git checkout -- package.json` and `npm install` still work. A shell command is judged pipeline by pipeline and redirects, `tee` and `cp` by their target, so `rm a.ts; cat eslint.config.js` and `cp eslint.config.js /tmp/old.js` pass. When a variable, `xargs`, an alias, a function, a started shell or a changed directory could carry the path from one pipeline to a write in another, any write in a command that names one of those files is blocked. The message tells the agent it may stop and explain why a rule makes the task impossible. A person then decides.

**`lint`** runs after every edit. JavaScript and TypeScript files go through the project's ESLint, stylesheets through its Stylelint when installed. Both are loaded from the project root, or, when the root has none, from the nearest folder above the edited file that has a `package.json`, so an app in `mobile/` is linted with its own ESLint and config. Errors go straight back to the agent. Failures are counted per file, so passing on one file does not reset another. After three failures in a row the agent is told to stop and report. If no ESLint is found at all, or a linter cannot run, for example Stylelint without a config, Claude Code shows you a notice once per session instead of the hook quietly doing nothing.

Both are optional. `.agent-guard.json` in the project root adjusts them:

```json
{
  "maxAttempts": 3,
  "protect": ["^src/generated/", "^docs/adr/"]
}
```

The file is read from `$CLAUDE_PROJECT_DIR`, so a `cd` during the session does not change which rules apply. `protect` adds regular expressions tested against the path relative to the project. All protected names and patterns are matched without regard to case, because on Windows and macOS `ESLint.config.js` is the same file as `eslint.config.js`.

If `.agent-guard.json` is invalid, or a hook fails for any other reason, `protect` blocks the tool call and says why. With an invalid file, `lint` still hands lint errors to the agent, using the default limit, and tells you once; if it fails for another reason, it tells you the edit went unlinted. Claude Code lets a tool call through when its hook crashes, so a guard that crashed silently would be off. Where the CLI itself cannot answer, for example with a mistyped hook name, it exits with code 2, which Claude Code treats as a block.

A matching instruction for the agent is in [`src/init/code-shape.md`](src/init/code-shape.md), which `init` copies to `.claude/rules/`. Codex reads `AGENTS.md` instead, so point it there. The rules hold either way; the instruction saves the agent a few failed attempts.

The hooks block the easy paths, not every path. Lint in CI is the real gate: run `eslint .` there and block the merge on errors.

### Cursor

Cursor loads the same hooks from `.claude/settings.json` while Settings → Agents → Third-Party Imports is on, which is the default. It renames Bash to `Shell` and has its own `Delete` tool, hence the two extra names in the matcher. Cursor does not say which shell runs a command, so `protect` reads a `Shell` command both as Bash and as PowerShell and blocks it if either reading would change the lint setup. Cursor shows a Claude Code block reason to you only and has no mapping for a PostToolUse block, so when an event comes from Cursor the hooks add Cursor's own fields: the reason for a block as `agent_message`, lint errors as `additional_context`. Lint failures are counted per Cursor conversation. These fields follow Cursor's documentation and have not yet been tried in Cursor itself.

### Codex

Codex reads hooks in the same format from `.codex/hooks.json`. Its file edits arrive as one `apply_patch` call:

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash|apply_patch",
        "hooks": [{ "type": "command", "command": "node \"$(git rev-parse --show-toplevel)/node_modules/eslint-plugin-agent-guard/bin/agent-guard.mjs\" protect" }] }
    ],
    "PostToolUse": [
      { "matcher": "apply_patch",
        "hooks": [{ "type": "command", "command": "node \"$(git rev-parse --show-toplevel)/node_modules/eslint-plugin-agent-guard/bin/agent-guard.mjs\" lint" }] }
    ]
  }
}
```

Codex sets no variable for the project folder and can start in a subfolder, so the path starts at the git root. `protect` judges every file in a patch, both names of a moved file included, and `lint` lints every file the patch leaves behind. Codex does not say which shell runs a command either, so commands are read both as Bash and as PowerShell. `.agent-guard.json` is read from the folder Codex started in.

Codex runs a new or changed hook only after you trust it in `/hooks`. On Windows, [openai/codex#27833](https://github.com/openai/codex/issues/27833) reports that a denied `apply_patch` is written anyway, so there CI is the only gate.

## Existing codebases

On an existing app the size rules will report hundreds of errors on day one. Use ESLint's [bulk suppressions](https://eslint.org/docs/latest/use/suppressions): `eslint --suppress-all` records today's violations in `eslint-suppressions.json`, new code is held to the rules, and `eslint --prune-suppressions` removes entries as files get fixed. With ESLint 10 the `lint` hook reads the same file, so an agent editing an old file is only told about what it broke, and the `protect` hook stops it from adding to the file.

## Oxlint

Oxlint is much faster, but it cannot hold the line on its own. It has no `noInlineConfig`: `respectEslintDisableDirectives: false` makes `eslint-disable` comments do nothing, yet `// oxlint-disable` still works and no option turns it off ([oxc#15173](https://github.com/oxc-project/oxc/issues/15173)). The `lint` hook runs ESLint, because Oxlint has no Node API yet.

So run Oxlint for its own rules and keep ESLint with this plugin as the gate in CI. [`eslint-plugin-oxlint`](https://github.com/oxc-project/eslint-plugin-oxlint) turns off the ESLint rules Oxlint already runs and leaves `agent-guard/*` on.

To see the rules in Oxlint's output as well, load the package as a [JS plugin](https://oxc.rs/docs/guide/usage/linter/js-plugins.html). JS plugins are alpha; this was checked with oxlint 1.94. `eslint` must be installed, because the four core rules come from it, and the presets are written by hand, since Oxlint does not read flat configs:

```json
{
  "jsPlugins": ["eslint-plugin-agent-guard"],
  "options": { "respectEslintDisableDirectives": false, "reportUnusedDisableDirectives": "error" },
  "rules": {
    "agent-guard/max-lines": ["error", { "max": 250, "skipBlankLines": true, "skipComments": true, "hint": "Split the file by responsibility into separate modules." }],
    "agent-guard/max-lines-per-function": ["error", { "max": 50, "skipBlankLines": true, "skipComments": true, "hint": "Extract the steps into small, well-named functions." }],
    "agent-guard/max-params": ["error", { "max": 2, "hint": "Pass one typed object and destructure it." }],
    "agent-guard/no-magic-numbers": ["error", {
      "ignore": [-1, 0, 1, 2], "ignoreArrayIndexes": true, "ignoreDefaultValues": true, "enforceConst": true,
      "ignoreEnums": true, "ignoreNumericLiteralTypes": true, "ignoreReadonlyClassProperties": true, "ignoreTypeIndexes": true,
      "hint": "Move it to a named constant, for example REQUEST_TIMEOUT_MS, at the top of the module or in a *.constants file."
    }],
    "agent-guard/no-self-named-constant": "error",
    "agent-guard/no-body-comments": "error"
  },
  "overrides": [
    {
      "files": ["**/*.{spec,test}.{js,jsx,ts,tsx}", "**/{test,tests,__tests__,e2e}/**"],
      "rules": { "agent-guard/max-lines": "off", "agent-guard/max-lines-per-function": "off", "agent-guard/no-magic-numbers": "off" }
    }
  ]
}
```

`protect` guards `.oxlintrc.json` and `oxlint.config.*` like the ESLint config.

## Development

```sh
npm install
npm test
npm run lint
```

To release, bump `version` in `package.json`, merge, then publish a GitHub release tagged `v<version>`. The [release workflow](.github/workflows/release.yml) checks the tag against `package.json`, runs lint and tests, and publishes to npm with provenance through [trusted publishing](https://docs.npmjs.com/trusted-publishers), so no npm token is stored. The package's trusted publisher on npmjs.com names this repository and `release.yml`, with `npm publish` allowed.

## License

MIT
