import { PROTECTED_IN_COMMAND } from './settings.js';
import { commandName, isTextCommand, parseShell } from './shell.js';

const FILE_WRITERS = new Set(['mv', 'cp', 'rm', 'tee', 'truncate', 'ln', 'set-content', 'add-content', 'clear-content', 'out-file', 'tee-object', 'new-item', 'copy-item', 'move-item', 'rename-item', 'remove-item', 'ni', 'cpi', 'copy', 'mi', 'move', 'rni', 'ren', 'ri', 'del', 'erase', 'rd', 'rmdir', 'ac', 'clc']);
const SCRIPTED_WRITE = /writeFile|\[(?:System\.)?IO\.File\]::(?:Write|Append|Create|Delete|Move|Copy|Replace)/i;
const IN_PLACE_EDITORS = new Set(['sed', 'perl']);
const IN_PLACE_FLAG = /^-[a-zA-Z]*i|^--in-place/;
const GIT_FILE_WRITES = new Set(['checkout', 'restore', 'apply', 'stash']);

/** These write to a target, so a protected file they only read from, or only hear about through a pipe, stays as it is. */
const TARGETED_WRITERS = new Set(['cp', 'tee']);

const TARGET_DIRECTORY_OPTION = /^-[a-zA-Z]*t|^--target-directory/;

/** `cp eslint.config.js mobile/` keeps the name, so a target without a file name of its own can overwrite the original. */
const DIRECTORY_LIKE = /(?:^|\/)(?:\.{1,2}|[^./]*)$/;

/** Output thrown away or sent to another stream: `2>/dev/null`, `2>$null`, `2>nul`, `2>&1`. */
const NOT_A_FILE = /^(?:\/dev\/null|\$null|nul|\d+)$/i;

/** An alias renames a writer, so the words of the later command no longer show that it writes. */
const MAKES_ALIAS = /\b(?:alias|sal|nal)\b/i;

/**
 * Variables, substitution, xargs, functions, a changed directory and a started shell can move a protected name from one
 * pipeline to a write in another, so reading pipeline by pipeline can't clear them. `$?` and `$null` carry no path.
 */
const CARRIES_PATH = /\$(?![?!#$]|null\b)|`|\b(?:xargs|function|cd|pushd|Set-Location|sl|sh|bash|zsh|dash|ksh|fish|pwsh|powershell|cmd)\b/i;

const namesProtected = (word) => PROTECTED_IN_COMMAND.test(word.replaceAll('\\', '/'));
const editsInPlace = (words) => IN_PLACE_EDITORS.has(commandName(words[0])) && words.some((word) => IN_PLACE_FLAG.test(word));
const gitChangesFiles = (words) => commandName(words[0]) === 'git' && words.some((word) => GIT_FILE_WRITES.has(word));

function hasWriter(words, isWriter) {
  if (isTextCommand(words)) return false;
  return editsInPlace(words) || words.some((word) => isWriter(commandName(word)) || SCRIPTED_WRITE.test(word));
}

/** Whether one command in a pipeline writes to any file, whichever it is. */
export const commandWrites = (words) => hasWriter(words, (name) => FILE_WRITERS.has(name));

function changesNamedFiles(words) {
  return gitChangesFiles(words) || hasWriter(words, (name) => FILE_WRITERS.has(name) && !TARGETED_WRITERS.has(name));
}

function argumentsOf(words, writer) {
  const at = words.findIndex((word) => commandName(word) === writer);
  return at < 0 ? [] : words.slice(at + 1);
}

function copyReachesProtected(words) {
  const args = argumentsOf(words, 'cp');
  if (!args.some(namesProtected)) return false;
  if (args.some((word) => TARGET_DIRECTORY_OPTION.test(word))) return true;
  const target = args.filter((word) => !word.startsWith('-')).at(-1) ?? '';
  return namesProtected(target) || DIRECTORY_LIKE.test(target.replaceAll('\\', '/'));
}

function targetedWriteReachesProtected(words) {
  return !isTextCommand(words) && (argumentsOf(words, 'tee').some(namesProtected) || copyReachesProtected(words));
}

/** `git apply` takes its paths from the pipe and PowerShell cmdlets take them from the pipeline, so the whole pipeline counts. */
function pipelineWritesProtected({ commands, targets }) {
  if (targets.some(namesProtected) || commands.some(targetedWriteReachesProtected)) return true;
  return commands.flat().some(namesProtected) && commands.some(changesNamedFiles);
}

function pipelineWritesAnything({ commands, targets }) {
  return targets.some((target) => !NOT_A_FILE.test(target)) || commands.some((words) => commandWrites(words) || gitChangesFiles(words));
}

/**
 * Whether a shell command writes to a protected file. Each pipeline is judged on its own, redirects, tee and cp by their
 * target, so reading a protected file next to an unrelated write passes. When the path could travel between pipelines,
 * any write in a command that names a protected file blocks it.
 */
export function writesProtectedFile(command, dialect) {
  if (!namesProtected(command)) return false;
  if (MAKES_ALIAS.test(command)) return true;
  const pipelines = parseShell(command, dialect);
  if (CARRIES_PATH.test(command) && pipelines.some(pipelineWritesAnything)) return true;
  return pipelines.some(pipelineWritesProtected);
}
