---
name: pr
description: Create or update a pull request for the current branch. Use when the user asks to create a PR, submit changes for review, or address PR review comments.
---

# PR Skill

Create or update a pull request for the current branch. Uses the `gh` CLI; run the scripts from the repo root.

## Behavior

1. **Detect current state**: Check if a PR already exists for the current branch using `gh pr view`.

2. **If no PR exists** — create one:
   - Run `npm test` and `npm run lint` first. Both are fast here, and CI runs the same on Node 22 / 24 with ESLint 9 / 10.
   - Run `git status` (never use `-uall`), `git diff` (staged + unstaged), and check if the branch is pushed to remote.
   - Run `git log` and `git diff main...HEAD` to understand all commits since diverging from `main`.
   - **Sync the docs**: the README is the user manual. If the branch adds or changes a rule, an option, a preset or a hook, the matching README section changes with it: a short reason, ✗/✓ examples, an options table. `git diff main...HEAD` touching `src/` but not `README.md` is a red flag. Update CLAUDE.md's Layout when files move.
   - Push the branch to remote with `-u` if not already pushed.
   - Create the PR with `gh pr create`, targeting `main`.
   - Do not include anything as a test plan; no one would act on it.
   - **Title**: Short (under 70 chars), in the style of the existing commit history.
   - **Body format**:
     ```
     ## Summary
     <1-3 bullet points describing what changed and why>

     ## Testing
     <one or two lines — only when there is something true to say; omit otherwise>
     ```
     `## Testing` is a statement of **what is already true**, not a checklist for someone else. One line, past
     tense: which test covers it, or what was verified by hand. Omit the section when a test changed in the same
     PR, since the test itself is the record.

     Good: `Covered by the new invalid cases in no-body-comments.test.js.` · `Ran the hooks in a real Claude Code
     session on Windows.` · `Refactor only — no behaviour change.`
     Bad: `- [ ] Test the happy path` · `Tested locally.` · `Please verify before merge.`

3. **If PR already exists** — update it:
   - Fetch all review comments with a **single command** (threads, review bodies and general comments):
     ```bash
     node .claude/skills/pr/scripts/fetch-reviews.mjs OWNER REPO PR_NUMBER
     ```
     The script prints three sections (Source A: Inline threads, Source B: Review bodies, Source C: General comments). Every entry's full body (for a thread, the whole conversation with authors) is written to `.skills-tmp/pr/` — **read the `thread-*.txt`, `review-*.txt` or `gc-*.txt` file** when the preview is cut. **CRITICAL: Read ALL entries — do not stop at the first few.**
   - **Clean up** after processing: delete `.skills-tmp/pr/`.

   **Source types** (for understanding the output and for the resolve step):
   - **Source A — Inline threads**: have resolvable thread IDs (`PRRT_*`). These are the ones you reply to and resolve.
   - **Source B — Review bodies**: e.g. outside-diff summaries from review bots. No thread ID — the bot re-reviews on the next push.
   - **Source C — General comments**: e.g. `claude[bot]` posts here. Answered with a new PR comment.

   **Deduplication**: Cross-reference all three sources. If the same concern appears in both a thread (A) and a review body/general comment (B/C), use the thread entry — it has a resolvable ID. Track source internally; do NOT show source in the user-facing output.

   - Analyze which comments make sense to address. Check that they are really relevant. Sometimes reviewers completely miss something. **Before recommending (`R`) any comment, verify the claim by reading the actual code** — e.g., check references/callers for "dead code" claims, read the surrounding logic for "bug" claims, write the input into a RuleTester case for "the rule misses X" claims. Do not blindly trust reviewer assertions.
   - **Findings that need contrived input** (code nobody would write, a config nobody would ship): say how realistic the input is and put them under Not recommended. Don't fix them and don't post a won't-fix reply; the user resolves those threads.
   - For each comment, determine whether the issue is **new** (introduced by this PR) or **pre-existing** (already present before this PR). Use `git diff main...HEAD` and your understanding of the changes to make this determination.
   - Present the comments in **separate tables grouped by recommendation** (Recommended, Neutral, Not recommended). Omit a group if it has no items:
     ```
     ### Recommended

     | # | Pre | Description | Reviewer |
     |---|-----|-------------|----------|
     | 1 | No  | **Message doesn't say where the fix goes** [↗](src/rules/no-body-comments.js#L34) | @alice |
     | 2 | Yes | **Windows paths bypass the protect hook** [↗](src/hooks/protect.js#L20) | @alice |

     ### Neutral

     | # | Pre | Description | Reviewer |
     |---|-----|-------------|----------|
     | 3 | Yes | **Nit: rename variable for clarity** [↗](src/configs.js#L55) | @bob |

     ### Not recommended

     | # | Pre | Description | Reviewer |
     |---|-----|-------------|----------|
     | 4 | No  | **Rule misses a comment inside a template literal** — needs code nobody writes [↗](src/rules/no-body-comments.js#L12) | @bot |

     **Summary:** 4 comments (2 recommended, 1 neutral, 1 not recommended) · 2 pre-existing, 2 new
     **Reviewers:** @alice (2), @bob (1), @bot (1)
     ```
     - `#` — sequential number (continuous across groups) for selection
     - `Pre` — `Yes` if pre-existing, `No` if introduced by this PR
     - **Description** (bold) — concise summary, followed by a `[↗](file#Lline)` clickable link to the source location. For Neutral or Not recommended items, append the reason after the bold text
     - `Reviewer` — who left the comment
   - Use the `AskUserQuestion` tool (multiSelect) to let the user pick which comments to address. Include an "All recommended (R)" option that addresses all R-marked comments at once.
   - Make the requested code changes, then run `npm test` and `npm run lint`.
   - **Commit the fix**:
     - **If the fix is still within scope of the original commit/PR** (a correction, polish, or oversight on what that commit already introduced): `git commit --amend --no-edit` and force-push with `git push --force-with-lease`. This keeps PR history clean — no noisy "fix review comment" commits.
     - **If the fix adds new scope** (the reviewer asked for an additional feature, a separate concern, or touches files unrelated to the original commit): create a **new** commit. Push normally.
     - When unsure, ask the user.
   - Optionally update the PR description if the scope changed.
   - **Reply and resolve the threads you addressed or declined for a real reason** using the resolve script. Write a JSON actions file to `.skills-tmp/pr/resolve-actions.json` and run:
     ```bash
     node .claude/skills/pr/scripts/resolve-threads.mjs OWNER REPO PR_NUMBER .skills-tmp/pr/resolve-actions.json
     ```
     The JSON file is an array of actions:
     ```json
     [
       { "threadId": "PRRT_...", "reply": "Fixed — did X" },
       { "threadId": "PRRT_...", "reply": "Out of scope because Y" },
       { "commentId": 12345, "reply": "Summary of changes done" }
     ]
     ```
     - **Addressed thread items (Source A)** — `threadId` + reply describing what changed (auto-resolves)
     - **Declined thread items (Source A)** — `threadId` + reply with the reason (e.g., "Pre-existing, out of scope") (auto-resolves). Leave contrived-input findings out of the file entirely.
     - **General comment items (Source C)** — `commentId` + reply summarising what was done
     - **Review body items (Source B, no thread)** — the bot re-reviews on the next push; no explicit reply needed unless not addressing (then add a general comment explaining why)

## Rules

- Always target `main` as the base branch.
- Never force-push to `main`. Force-push on your own PR branch is allowed but **only with `--force-with-lease`** (never `--force`), and only when amending in-scope review fixes per step 3.
- Never pass `--no-verify`; the protect hook blocks it anyway.
- When showing review comments, always use the grouped table format described in step 3, with section headers per recommendation group.
- For a numbered list, use one number series — do not repeat numbers.
- When a reviewer flags dead code, verify it is actually unused (check references/callers). If confirmed dead, recommend removal (`R`) — don't keep dead code as "scaffolding for future use".
- A change to a rule, option, preset or hook that doesn't update the README is incomplete (see "Sync the docs" above).
