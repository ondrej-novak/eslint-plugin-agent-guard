import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadSettings, readText, toProjectPath } from './settings.js';
import { REASON_SUFFIX } from './protect.js';

const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit']);
const SCRIPT_FILE = /\.(?:[cm]?[jt]sx?)$/;
const STYLE_FILE = /\.(?:css|scss|sass|less)$/;

function packageDirectory(directory) {
  if (existsSync(path.join(directory, 'package.json'))) return directory;
  const parent = path.dirname(directory);
  return parent === directory ? undefined : packageDirectory(parent);
}

async function importFrom(specifier, root) {
  try {
    const resolved = createRequire(path.join(root, 'package.json')).resolve(specifier);
    return { module: await import(pathToFileURL(resolved).href), root };
  } catch {
    return undefined;
  }
}

/**
 * Loads a linter from the project being edited, not from this package, so the project's version and config apply.
 * Claude's working directory comes first; the nearest package.json above the file covers an app in a subfolder.
 */
async function findLinter(specifier, { cwd, file }) {
  const fromCwd = await importFrom(specifier, cwd);
  if (fromCwd) return fromCwd;
  const own = packageDirectory(path.dirname(file));
  return own ? importFrom(specifier, own) : undefined;
}

/** Honours eslint-suppressions.json where the installed ESLint supports it, so legacy violations do not count. */
function createEslint(ESLint, cwd) {
  try {
    return new ESLint({ cwd, applySuppressions: true });
  } catch {
    return new ESLint({ cwd });
  }
}

async function runEslint(filePath, { module, root }) {
  if (!module.ESLint) return undefined;
  const eslint = createEslint(module.ESLint, root);
  if (await eslint.isPathIgnored(filePath)) return undefined;
  const errors = module.ESLint.getErrorResults(await eslint.lintFiles([filePath]));
  if (errors.length === 0) return undefined;
  const formatter = await eslint.loadFormatter('stylish');
  return formatter.format(errors);
}

async function runStylelint(filePath, { module, root }) {
  const stylelint = module.default ?? module;
  if (!stylelint.lint) return undefined;
  const outcome = await stylelint.lint({ files: [filePath], cwd: root, allowEmptyInput: true, formatter: 'string' });
  if (!outcome.errored) return undefined;
  return outcome.report ?? outcome.output;
}

const LINTERS = [
  { files: SCRIPT_FILE, specifier: 'eslint', run: runEslint },
  { files: STYLE_FILE, specifier: 'stylelint', run: runStylelint, optional: true },
];

function sessionFile(sessionId, suffix) {
  const directory = path.join(os.tmpdir(), 'agent-guard');
  mkdirSync(directory, { recursive: true });
  return path.join(directory, `${String(sessionId ?? 'default').replace(/[^\w-]/g, '_')}${suffix}`);
}

/** Counts consecutive failures per file, so passing on one file does not reset another file's count. */
function recordAttempt({ sessionId, file, failed }) {
  const store = sessionFile(sessionId, '.json');
  const counts = readText(store, { parse: true }) ?? {};
  counts[file] = failed ? (counts[file] ?? 0) + 1 : 0;
  writeFileSync(store, JSON.stringify(counts));
  return counts[file];
}

/** Tells the user once per session, so a hook that cannot find ESLint does not stop guarding without anyone knowing. */
function missingEslintNotice({ sessionId, projectPath }) {
  const marker = sessionFile(sessionId, '.eslint-missing');
  if (existsSync(marker)) return undefined;
  writeFileSync(marker, '');
  return {
    systemMessage: `agent-guard: no ESLint found for ${projectPath}, so edits are not linted. Install eslint in the project root or in the nearest package.json folder above the file.`,
  };
}

function feedback({ projectPath, output, attempt, maxAttempts }) {
  if (attempt >= maxAttempts) {
    return `STOP. ${projectPath} has failed lint ${attempt} times in a row. Do not try again and do not weaken the lint setup. ${REASON_SUFFIX}\n${output}`;
  }
  return `Lint failed for ${projectPath} (attempt ${attempt} of ${maxAttempts}). Fix these errors without disable comments:\n${output}`;
}

/** A crash would only show as a hook error, so the user is told that the edit went unlinted. */
export function lintFailure(error) {
  return { systemMessage: `agent-guard: the lint hook failed (${error.message}), so this edit was not linted.` };
}

/** Lints the file a tool just wrote and hands any errors back to the agent. */
export async function lintFeedbackHook(tool) {
  if (!FILE_TOOLS.has(tool.tool_name)) return undefined;
  const filePath = tool.tool_input?.file_path;
  if (!filePath) return undefined;
  const cwd = tool.cwd ?? process.cwd();
  const absolute = path.resolve(cwd, filePath);
  const linter = LINTERS.find(({ files }) => files.test(absolute));
  if (!linter) return undefined;
  const projectPath = toProjectPath(absolute, cwd);
  const found = await findLinter(linter.specifier, { cwd, file: absolute });
  if (!found) return linter.optional ? undefined : missingEslintNotice({ sessionId: tool.session_id, projectPath });
  const output = await linter.run(absolute, found);
  const attempt = recordAttempt({ sessionId: tool.session_id, file: projectPath, failed: Boolean(output) });
  if (!output) return undefined;
  const { maxAttempts } = loadSettings(cwd);
  return { decision: 'block', reason: feedback({ projectPath, output, attempt, maxAttempts }) };
}
