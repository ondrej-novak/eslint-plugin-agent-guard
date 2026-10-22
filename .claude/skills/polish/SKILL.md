---
name: polish
description: Use when implementation is complete and code needs post-implementation tidying — removing unused imports, dead code, stale variables, improving clarity, reducing complexity, and extracting duplicated logic. Supersedes /simplify.
---

# Post-Implementation Code Polish

Clean up, simplify, and refine code in recently changed files. Detects both new and preexisting issues, reports them separately, and lets the user choose what to fix.

## Step 1: Identify Scope

1. Check for uncommitted changes (staged + unstaged): `git diff --name-only HEAD`
2. If files found → that is the scope
3. If no uncommitted changes AND current branch is not `main` → use files from the last commit: `git diff --name-only HEAD~1..HEAD`
4. If on `main` with no changes → nothing to polish, stop

Focus on those files plus any files they directly import/reference.

## Step 2: Automated Checks

- **Lint** (`npm run lint`): the repo's own preset catches unused variables, long functions and files, magic numbers, extra parameters and body comments
- **Tests** (`npm test`): establish a baseline before changes

Fix all errors before proceeding to manual review. Never fix a lint error by weakening the config or adding a disable comment; inline config is off in the presets anyway.

## Step 3: Identify Changed Lines

Use `git diff` to determine which lines in each file were added or modified by recent changes:

- **Uncommitted changes:** `git diff HEAD` (line-level diff)
- **Last commit:** `git diff HEAD~1..HEAD` (line-level diff)

This determines whether each issue found in Steps 4-7 is **new** (on a changed line) or **preexisting** (on an unchanged line).

## Step 4: Analyze — Dead Code

Per file in scope, scan the **entire file** for:

- **Unused imports** and exports nothing imports any more
- **Unused functions and constants** never referenced
- **Unused parameters** or destructured properties never read
- **Unused local variables** assigned but never used
- **Commented-out code** — delete it
- **Unreachable branches** (`else` after `return`, impossible conditions)
- **Debug artifacts** — `console.log`, temp variables, `it.only`

Tag each finding as `[NEW]` or `[PREEXISTING]` based on Step 3.

## Step 5: Analyze — Simplification & Refactoring

Per file in scope, scan the **entire file** for:

- **Reduce nesting** — flatten with early returns / guard clauses
- **Extract duplication** — identical logic in 2+ places → shared function or module
- **Simplify expressions** — verbose conditionals, redundant optional chaining, redundant checks
- **Avoid nested ternaries** — prefer `if`/`else` or a lookup object for multiple conditions
- **Improve names** — unclear abbreviations, misleading names, inconsistent conventions
- **Remove unnecessary abstractions** — wrappers that add no value, single-use helpers
- **Functions close to the limits** — near 50 lines or with 4+ nesting levels; propose breaking into smaller focused functions
- **Consistency with surroundings** — verify changed code follows the same patterns as surrounding code (naming, error handling, import ordering)
- **Rule messages** — a message still tells the reader what to do, not only what is wrong
- **Apply project conventions** from CLAUDE.md

Tag each finding as `[NEW]` or `[PREEXISTING]` based on Step 3.

## Step 6: Analyze — Comments

Comments inside function bodies are already lint errors. Scan the JSDoc and top-level comments that remain:

**Remove** comments that:
- **Paraphrase the identifier** — JSDoc that is just the function name reworded (`/** Loads the settings. */` on `loadSettings`). Obvious from the name and signature.
- **Restate the parameters** — `@param` lines that only repeat names the signature already shows.
- **Reference the issue, PR, or author** — `// fixes #12` or `// added for the Angular preset`. Belongs in the commit / PR, not the source.
- **Dead context** — comments about removed code, stale TODOs, old version notes.

**Keep and trim** comments that:
- Explain a **non-obvious WHY**: a hidden constraint, an ESLint version difference, surprising behavior that would trip a reader.
- Warn about a **workaround**.
- Document a **contract** of an exported function that the signature doesn't show.
- Shorten verbose multi-paragraph JSDoc to a sentence or two capturing the essential WHY.

**One-line test:** if deleting the comment wouldn't confuse a future reader, delete it.

Tag each finding as `[NEW]` or `[PREEXISTING]` based on Step 3.

## Step 7: Analyze — This Repo

- **ESLint 9 and 10**: use `context.sourceCode`, `context.options` and APIs both majors support; nothing removed in 10
- **Node 22**: no APIs newer than the `engines` range in `package.json`
- **Plain ES modules**: no TypeScript or build step in `src`
- **Tests**: a test that catches nothing another test doesn't catch is a removal candidate; an extra case or assertion in an existing test beats a new `it()`

**Cross-file pattern alignment** — if a pattern was changed in one file, check if sibling files (other rules, other hooks, other presets) still use the old pattern and flag them for update.

Tag each finding as `[NEW]` or `[PREEXISTING]` based on Step 3.

## Step 8: Report

Present findings in two separate tables:

**New Issues (from recent changes)**

| # | File:Line | Category | Description |
|---|-----------|----------|-------------|
| 1 | src/configs.js:42 | Dead code | Unused import `HINTS` |
| 2 | src/hooks/protect.js:15 | Simplification | Nested ternary → lookup object |

**Preexisting Issues (already in file before your changes)**

| # | File:Line | Category | Description |
|---|-----------|----------|-------------|
| 1 | src/with-hint.js:10 | Dead code | Unused function `formatHint()` |

Categories: `Dead code`, `Simplification`, `Comments`, `This repo`, `Cross-file alignment`.

If either table is empty, say so explicitly.

## Step 9: Auto-Apply Comment Fixes

**Apply all `Comments` category findings automatically**, both `[NEW]` and `[PREEXISTING]`, without asking the user. Comment cleanup is mechanical and low-risk (no behavior change), so it doesn't need approval. Mention in the final summary how many were applied.

## Step 10: Ask User About Remaining Fixes

For all **non-comment** findings, use the `AskUserQuestion` tool to ask what to fix:

- **New issues only** — fix only issues from the "New Issues" table
- **All issues** — fix both new and preexisting issues
- **None (skip)** — don't fix anything else, end here

Do NOT apply any non-comment fixes until the user responds. If the user selects "None", stop.

## Step 11: Apply Fixes

Apply only the fixes the user approved in Step 10. Work one file at a time, removals first, then simplifications.

## Step 12: Verify

Re-run `npm run lint` and `npm test`. **Both must pass.**

If a test fails, revert that specific change and note why the code was left as-is.

## Rules

- **Preserve behavior** — never change what code does, only how it's written
- **One file at a time** — apply all changes to a file before moving to the next
- **Removals first, then simplifications** — clean slate before restructuring
- **Stay in scope** — only touch files in scope and their direct dependencies
- **Report before fixing** — never apply non-comment changes without user approval
