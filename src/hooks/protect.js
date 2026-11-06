import path from 'node:path';
import { skipsChecks } from './git-hooks.js';
import { isProtected, loadSettings, parseJson, projectRoot, PROTECTED_IN_COMMAND, readText, toProjectPath } from './settings.js';
import { commandName, DIALECTS, isTextCommand, parseShell } from './shell.js';

const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);
const WRITING_COMMAND = /(\bsed\b[^|;&]*\s-i|\bperl\b[^|;&]*\s-i|(?<![0-9&])>(?!&)|\btee\b|\bmv\b|\bcp\b|\brm\b|\btruncate\b|\bln\b|writeFile|\bgit\s+(checkout|restore|apply|stash))/;
/** PowerShell ignores case and writes files through its own cmdlets, their aliases and .NET's File class. */
const POWERSHELL_WRITING_COMMAND =
  /\b(?:Set-Content|Add-Content|Clear-Content|Out-File|Tee-Object|New-Item|Copy-Item|Move-Item|Rename-Item|Remove-Item|ni|cpi|copy|mi|move|rni|ren|ri|del|erase|rd|rmdir)\b|\[(?:System\.)?IO\.File\]::(?:Write|Append|Create|Delete|Move|Copy|Replace)/i;
const LINT_KEY = /lint/i;

const FILE_WRITERS = new Set(['mv', 'cp', 'rm', 'tee', 'truncate', 'ln', 'set-content', 'add-content', 'clear-content', 'out-file', 'tee-object', 'new-item', 'copy-item', 'move-item', 'rename-item', 'remove-item', 'ni', 'cpi', 'copy', 'mi', 'move', 'rni', 'ren', 'ri', 'del', 'erase', 'rd', 'rmdir', 'ac', 'clc']);
const SCRIPTED_WRITE = /writeFile|\[(?:System\.)?IO\.File\]::(?:Write|Append|Create|Delete|Move|Copy|Replace)/i;
const IN_PLACE_EDITORS = new Set(['sed', 'perl']);
const IN_PLACE_FLAG = /^-[a-zA-Z]*i|^--in-place/;
const PACKAGE_JSON = /(?<![\w.-])package\.json(?![\w.-])/i;

/** Global options can stand before `pkg`, as in `npm --prefix mobile pkg set`, the usual form for an app in a subfolder. */
const NPM_PKG_LINT_CHANGE = /\b(?:npm|pnpm|yarn)(?:\s+-\S+(?:\s+[^-\s]\S*)?)*\s+pkg\s+(?:set|delete)\s.*lint/is;

export const REASON_SUFFIX =
  'If a lint rule makes the task impossible, stop and tell the user which rule blocks you and why. The user decides whether the rule changes.';

const foldLineEndings = (text) => text.replaceAll('\r\n', '\n');
const foldQuotes = (text) => text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');

/** Claude Code's Edit matches across line endings and curly quotes, so an edit has to be judged the same way. */
const foldForMatch = (text) => foldQuotes(foldLineEndings(text));

/** The lint-related parts of a package.json: scripts whose name or command mentions lint, and inline lint configs. */
function lintParts(text) {
  try {
    const json = parseJson(text);
    const scripts = Object.entries(json.scripts ?? {}).filter((script) => script.some((part) => LINT_KEY.test(String(part))));
    return JSON.stringify([scripts, json.eslintConfig, json.stylelint, json['lint-staged']]);
  } catch {
    return undefined;
  }
}

/** Finds the text with quotes folded but splices the original, because folding a curly quote in a value would break the JSON. */
function applyEdit(text, { old_string: oldText = '', new_string: newText = '', replace_all: all = false }) {
  const from = foldForMatch(oldText);
  const folded = foldQuotes(text);
  let at = from ? folded.indexOf(from) : -1;
  let result = '';
  let copied = 0;
  while (at >= 0) {
    result += text.slice(copied, at) + newText;
    copied = at + from.length;
    at = all ? folded.indexOf(from, copied) : -1;
  }
  return result + text.slice(copied);
}

const mentionsLint = ({ old_string: oldText = '', new_string: newText = '', content = '' }) => LINT_KEY.test(`${oldText}${newText}${content}`);

/** Compares the lint setup before and after the tool call. Where that comparison can't be made, the word lint decides. */
function touchesLintInPackageJson(tool, filePath) {
  const input = tool.tool_input ?? {};
  const before = foldLineEndings(readText(filePath) ?? '{}');
  const edits = input.edits ?? [input];
  const isUnmatched = ({ old_string: oldText = '' }) => !foldQuotes(before).includes(foldForMatch(oldText));
  if (edits.some((edit) => isUnmatched(edit) && mentionsLint(edit))) return true;
  const after = tool.tool_name === 'Write' ? (input.content ?? '') : edits.reduce(applyEdit, before);
  const [was, now] = [lintParts(before), lintParts(after)];
  return was === undefined && now === undefined ? edits.some(mentionsLint) : was !== now;
}

function checkFileTool(tool, { cwd, root, settings }) {
  const input = tool.tool_input ?? {};
  const filePath = input.file_path ?? input.notebook_path;
  if (!filePath) return undefined;
  const absolute = path.resolve(cwd, filePath);
  const projectPath = toProjectPath(absolute, root);
  if (isProtected(projectPath, settings)) return `Editing ${projectPath} is not allowed: it configures the lint guardrails.`;
  if (path.basename(projectPath).toLowerCase() === 'package.json' && touchesLintInPackageJson(tool, absolute)) {
    return `Changing lint scripts or lint configuration in ${projectPath} is not allowed.`;
  }
  return undefined;
}

function commandWrites(words) {
  if (isTextCommand(words)) return false;
  if (IN_PLACE_EDITORS.has(commandName(words[0])) && words.some((word) => IN_PLACE_FLAG.test(word))) return true;
  return words.some((word) => FILE_WRITERS.has(commandName(word)) || SCRIPTED_WRITE.test(word));
}

function writesPackageJson({ commands, targets }) {
  const namesPackageJson = (word) => PACKAGE_JSON.test(word);
  return targets.some(namesPackageJson) || (commands.flat().some(namesPackageJson) && commands.some(commandWrites));
}

function checkCommand({ tool_name: toolName, tool_input: input }) {
  const command = input?.command ?? '';
  const pipelines = parseShell(command, DIALECTS[toolName]);
  const commands = pipelines.flatMap((pipeline) => pipeline.commands);
  if (commands.some(skipsChecks)) return 'Skipping hooks or lint configuration on the command line is not allowed.';
  const writes = WRITING_COMMAND.test(command) || POWERSHELL_WRITING_COMMAND.test(command);
  if (PROTECTED_IN_COMMAND.test(command.replaceAll('\\', '/')) && writes) return 'This command would change a lint guardrail file, which is not allowed.';
  if (commands.some((words) => !isTextCommand(words) && NPM_PKG_LINT_CHANGE.test(words.join(' ')))) return 'Changing lint scripts or lint configuration in package.json is not allowed.';
  if (pipelines.some(writesPackageJson)) {
    return 'Changing package.json from the shell is not allowed, because the result cannot be checked for lint changes. Use the Edit tool: edits that leave the lint setup alone go through.';
  }
  return undefined;
}

/** Returns why a tool call must not run, or undefined when it may. */
export function protectReason(tool) {
  const cwd = tool.cwd ?? process.cwd();
  const root = projectRoot(tool);
  const settings = loadSettings(root);
  if (FILE_TOOLS.has(tool.tool_name)) return checkFileTool(tool, { cwd, root, settings });
  if (SHELL_TOOLS.has(tool.tool_name)) return checkCommand(tool);
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
