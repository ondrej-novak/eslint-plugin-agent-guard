---
name: plan
description: Create a comprehensive implementation plan for a task. Asks thorough clarification questions, explores the codebase, and produces a detailed plan for approval in plan mode.
---

# Plan Skill

Create a comprehensive, well-researched implementation plan for a given task.

## Arguments

The user provides the task description after `/plan`. Example: `/plan add a rule that bans default exports`

## Behavior

### Step 0: Enter Plan Mode

Switch to plan mode using `EnterPlanMode` tool immediately. All subsequent work happens in plan mode.

### Step 1: Determine Source

If the argument references a **GitHub issue** (e.g. `/plan #12`), read it with `gh issue view <number> --comments`.

If the argument references a **file** (e.g. a draft in the repo), read the file contents.

Otherwise, treat the argument as a **plain text** task description.

### Step 2: Clarify Requirements

Before any exploration, **grill the user** to fully understand the task. Use `AskUserQuestion` extensively — ask multiple rounds of questions if needed. Do NOT assume intent. Cover:

- **Scope**: What exactly should be built? What's in scope and what's out?
- **Existing context**: Is there an issue, an article, or prior discussion?
- **Behavior**: For a rule, what it reports, what it must leave alone, and what its message tells the reader to do. For a hook, what Claude Code sees when it fires.
- **Presets**: Which of `recommended`, `react`, `angular` turn it on, and with which options?
- **Compatibility**: Does it need anything ESLint 9, ESLint 10 or Node 22 don't all have?
- **Acceptance criteria**: How will we know this is done? What does "working" look like?

Ask 2-4 focused questions per round. Continue asking until you have enough clarity to produce a solid plan. Don't ask obvious questions — focus on ambiguities and decision points.

### Step 3: Explore the Codebase

Use Explore agents to understand the relevant parts of the codebase:
- Find existing patterns and helpers that should be reused (`withHint`, `number-names.js`, the hook settings loader)
- Identify files that will need modification
- Check the README section the change belongs to
- Understand the current architecture around the area of change

### Step 4: Design the Plan

Use a Plan agent to design the implementation approach based on gathered requirements and codebase exploration.

### Step 5: Write the Plan Document

Write the plan to **the plan mode file** (provided by the system as the plan file path). This is what plan mode reads for approval.

**Plan document structure:**

```markdown
# <Title>

## Context
Why this change is being made — the problem, what prompted it, the intended outcome.
Link to the issue if applicable.

## Requirements
Bullet list of concrete requirements gathered from clarification.

## Scope
What's included and what's explicitly excluded.

## Implementation Plan

### Phase N: <Phase Name>
For each phase, list:
- **Files to modify/create** with full paths
- **What changes** in each file — be specific enough to execute
- **Existing helpers/patterns to reuse** with file paths

### Phase N+1: ...

## Verification
- `npm test` and `npm run lint`
- RuleTester cases: what is reported, what is left alone
- Anything to check by hand, such as a hook inside a real Claude Code session
```

**As you write, verify each concrete claim against the code** — don't carry assumptions from exploration:
- File paths, functions, options → open with `Read` / `Grep` and confirm they exist with the signature you assume.
- "Reuse X" → confirm X still fits across the full change.
- "Just do X" (add an option, extend a helper, wrap a rule) → check for second callers, every preset, the README, the examples and tests.
- Counts you cite ("N call sites") → re-run the search; filter false positives (comments, tests, fixtures).

Fix the plan to match reality; don't paper over mismatches.

### Step 6: Critical Review

For non-trivial plans, do one critical pass before `ExitPlanMode` — first on the design, then on user choices.

**Design gotchas** — look for:
- **False positives** — legitimate code the rule would report. A rule that fires on good code teaches people and agents to work around it.
- **Unhandled edge cases** — empty files, JSX, TypeScript syntax through `typescript-eslint`, Windows paths in hooks, missing optional config.
- **Exemptions the plan forgets** — test files, config files, generated files, the test override in `src/configs.js`.
- **Downstream impact the plan under-sells** — every preset, the README, the examples, CI's ESLint 9 / 10 matrix.
- **Ambiguity or mixed strategies** — two approaches for the same problem; pick one.

**Challenge user choices** — revisit every choice collected via `AskUserQuestion`:
- Is it still the right call given what exploration revealed?
- Does it conflict with CLAUDE.md or existing patterns?
- Is there a materially cheaper alternative worth naming, even if you don't recommend it?
- Are there footguns the user likely didn't consider — e.g. a breaking change for people already on the preset, an option name that can't change after publishing?

Surface findings as a short, direct critique — gotchas first, then challenges. If any finding changes the design (not just clarifies it), re-ask with `AskUserQuestion` and update the plan before moving on. Minor clarifications can be applied directly.

Do **not** call `ExitPlanMode` during this step.

### Step 7: Exit Plan Mode

Call `ExitPlanMode` to present the plan for user approval. Iterate with the user until the plan is finalized and they have no more comments.

## Rules

- Always enter plan mode first.
- Ask questions BEFORE exploring — don't waste exploration on wrong assumptions.
- Reference existing code patterns and helpers — avoid proposing new abstractions when existing ones work.
- Keep the plan actionable: specific file paths, specific changes, specific verification steps.
- Plans should be concise enough to scan but detailed enough to execute without ambiguity.
- Follow project conventions from CLAUDE.md.
- The plan file is the deliverable — it should stand on its own as an implementation guide.
- **User answers aren't gospel** — if exploration reveals a choice was wrong, challenge it before ExitPlanMode rather than shipping a known footgun.
