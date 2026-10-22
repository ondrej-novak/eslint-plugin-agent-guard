import path from 'node:path';
import { isProtected, loadSettings, PROTECTED_IN_COMMAND, readText, toProjectPath } from './settings.js';

const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const WRITING_COMMAND = /(\bsed\b[^|;&]*\s-i|\bperl\b[^|;&]*\s-i|(?<![0-9&])>(?!&)|\btee\b|\bmv\b|\bcp\b|\brm\b|\btruncate\b|\bln\b|writeFile|\bgit\s+(checkout|restore|apply|stash))/;
const SKIPPED_CHECKS = /--no-verify\b|\bHUSKY=0\b|--no-config-lookup\b/;
const LINT_KEY = /lint/i;

export const REASON_SUFFIX =
  'If a lint rule makes the task impossible, stop and tell the user which rule blocks you and why. The user decides whether the rule changes.';

/** The lint-related parts of a package.json: scripts whose name mentions lint, and inline lint configs. */
function lintParts(text) {
  try {
    const json = JSON.parse(text);
    const scripts = Object.entries(json.scripts ?? {}).filter(([key]) => LINT_KEY.test(key));
    return JSON.stringify([scripts, json.eslintConfig, json.stylelint, json['lint-staged']]);
  } catch {
    return undefined;
  }
}

function touchesLintInPackageJson(tool, filePath) {
  const input = tool.tool_input ?? {};
  if (tool.tool_name === 'Write') {
    const before = readText(filePath) ?? '{}';
    return lintParts(before) !== lintParts(input.content ?? '');
  }
  const edits = input.edits ?? [input];
  return edits.some((edit) => LINT_KEY.test(`${edit.old_string ?? ''}\n${edit.new_string ?? ''}`));
}

function checkFileTool(tool, cwd) {
  const input = tool.tool_input ?? {};
  const filePath = input.file_path ?? input.notebook_path;
  if (!filePath) return undefined;
  const projectPath = toProjectPath(filePath, cwd);
  if (isProtected(projectPath, loadSettings(cwd))) return `Editing ${projectPath} is not allowed: it configures the lint guardrails.`;
  if (path.basename(projectPath) === 'package.json' && touchesLintInPackageJson(tool, path.resolve(cwd, filePath))) {
    return `Changing lint scripts or lint configuration in ${projectPath} is not allowed.`;
  }
  return undefined;
}

function checkCommand(command) {
  if (SKIPPED_CHECKS.test(command)) return 'Skipping hooks or lint configuration on the command line is not allowed.';
  if (PROTECTED_IN_COMMAND.test(command) && WRITING_COMMAND.test(command)) return 'This command would change a lint guardrail file, which is not allowed.';
  return undefined;
}

/** Returns why a tool call must not run, or undefined when it may. */
export function protectReason(tool) {
  const cwd = tool.cwd ?? process.cwd();
  if (FILE_TOOLS.has(tool.tool_name)) return checkFileTool(tool, cwd);
  if (tool.tool_name === 'Bash') return checkCommand(tool.tool_input?.command ?? '');
  return undefined;
}

export function protectHook(tool) {
  const reason = protectReason(tool);
  if (!reason) return undefined;
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `${reason} ${REASON_SUFFIX}`,
    },
  };
}
