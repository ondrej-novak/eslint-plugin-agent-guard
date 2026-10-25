import path from 'node:path';
import { skipsGitHooks } from './git-hooks.js';
import { isProtected, loadSettings, PROTECTED_IN_COMMAND, readText, toProjectPath } from './settings.js';

const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);
const WRITING_COMMAND = /(\bsed\b[^|;&]*\s-i|\bperl\b[^|;&]*\s-i|(?<![0-9&])>(?!&)|\btee\b|\bmv\b|\bcp\b|\brm\b|\btruncate\b|\bln\b|writeFile|\bgit\s+(checkout|restore|apply|stash))/;
/** PowerShell ignores case and writes files through its own cmdlets, their aliases and .NET's File class. */
const POWERSHELL_WRITING_COMMAND =
  /\b(?:Set-Content|Add-Content|Clear-Content|Out-File|Tee-Object|New-Item|Copy-Item|Move-Item|Rename-Item|Remove-Item|ni|cpi|copy|mi|move|rni|ren|ri|del|erase|rd|rmdir)\b|\[(?:System\.)?IO\.File\]::(?:Write|Append|Create|Delete|Move|Copy|Replace)/i;
const SKIPPED_CHECKS = /--no-verify\b|\bHUSKY=0\b|\$env:HUSKY\s*=\s*['"]?0\b|--no-config-lookup\b/i;
const LINT_KEY = /lint/i;

export const REASON_SUFFIX =
  'If a lint rule makes the task impossible, stop and tell the user which rule blocks you and why. The user decides whether the rule changes.';

/** The lint-related parts of a package.json: scripts whose name or command mentions lint, and inline lint configs. */
function lintParts(text) {
  try {
    const json = JSON.parse(text);
    const scripts = Object.entries(json.scripts ?? {}).filter((script) => script.some((part) => LINT_KEY.test(String(part))));
    return JSON.stringify([scripts, json.eslintConfig, json.stylelint, json['lint-staged']]);
  } catch {
    return undefined;
  }
}

/** Applies one Edit the way Claude Code does; an old_string that is not in the file leaves it unchanged, as the Edit would fail. */
function applyEdit(text, { old_string: oldText = '', new_string: newText = '', replace_all: all = false }) {
  if (!oldText || !text.includes(oldText)) return text;
  return all ? text.split(oldText).join(newText) : text.replace(oldText, () => newText);
}

/** Compares the lint setup before and after the tool call, so unrelated edits pass and disguised ones do not. */
function touchesLintInPackageJson(tool, filePath) {
  const input = tool.tool_input ?? {};
  const before = readText(filePath) ?? '{}';
  const after = tool.tool_name === 'Write' ? (input.content ?? '') : (input.edits ?? [input]).reduce(applyEdit, before);
  return lintParts(before) !== lintParts(after);
}

function checkFileTool(tool, { cwd, settings }) {
  const input = tool.tool_input ?? {};
  const filePath = input.file_path ?? input.notebook_path;
  if (!filePath) return undefined;
  const projectPath = toProjectPath(filePath, cwd);
  if (isProtected(projectPath, settings)) return `Editing ${projectPath} is not allowed: it configures the lint guardrails.`;
  if (path.basename(projectPath).toLowerCase() === 'package.json' && touchesLintInPackageJson(tool, path.resolve(cwd, filePath))) {
    return `Changing lint scripts or lint configuration in ${projectPath} is not allowed.`;
  }
  return undefined;
}

function checkCommand(command) {
  if (SKIPPED_CHECKS.test(command) || skipsGitHooks(command)) return 'Skipping hooks or lint configuration on the command line is not allowed.';
  const writes = WRITING_COMMAND.test(command) || POWERSHELL_WRITING_COMMAND.test(command);
  if (PROTECTED_IN_COMMAND.test(command.replaceAll('\\', '/')) && writes) return 'This command would change a lint guardrail file, which is not allowed.';
  return undefined;
}

/** Returns why a tool call must not run, or undefined when it may. */
export function protectReason(tool) {
  const cwd = tool.cwd ?? process.cwd();
  const settings = loadSettings(cwd);
  if (FILE_TOOLS.has(tool.tool_name)) return checkFileTool(tool, { cwd, settings });
  if (SHELL_TOOLS.has(tool.tool_name)) return checkCommand(tool.tool_input?.command ?? '');
  return undefined;
}

function deny(reason) {
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } };
}

export function protectHook(tool) {
  const reason = protectReason(tool);
  return reason ? deny(`${reason} ${REASON_SUFFIX}`) : undefined;
}

/** Claude Code lets a tool call through when its hook exits with an error, so a crash has to deny. */
export function protectFailure(error) {
  return deny(`agent-guard could not check this tool call, so it is blocked: ${error.message}. Stop and tell the user; only they can fix this.`);
}
