import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadSettings, readText, toProjectPath } from './settings.js';
import { REASON_SUFFIX } from './protect.js';

const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit']);
const SCRIPT_FILE = /\.(?:[cm]?[jt]sx?)$/;
const STYLE_FILE = /\.(?:css|scss|sass|less)$/;

/** Loads a linter from the project being edited, not from this package, so the project's version and config apply. */
async function importFromProject(specifier, cwd) {
  try {
    const resolved = createRequire(path.join(cwd, 'package.json')).resolve(specifier);
    return await import(pathToFileURL(resolved).href);
  } catch {
    return undefined;
  }
}

/** Honours eslint-suppressions.json where the installed ESLint supports it, so legacy violations do not count. */
function createEslint(ESLint, cwd) {
  try {
    return new ESLint({ cwd, applySuppressions: true });
  } catch {
    return new ESLint({ cwd });
  }
}

async function runEslint(filePath, cwd) {
  const module = await importFromProject('eslint', cwd);
  if (!module?.ESLint) return undefined;
  const eslint = createEslint(module.ESLint, cwd);
  if (await eslint.isPathIgnored(filePath)) return undefined;
  const errors = module.ESLint.getErrorResults(await eslint.lintFiles([filePath]));
  if (errors.length === 0) return undefined;
  const formatter = await eslint.loadFormatter('stylish');
  return formatter.format(errors);
}

async function runStylelint(filePath, cwd) {
  const module = await importFromProject('stylelint', cwd);
  const stylelint = module?.default ?? module;
  if (!stylelint?.lint) return undefined;
  const outcome = await stylelint.lint({ files: [filePath], cwd, allowEmptyInput: true, formatter: 'string' });
  if (!outcome.errored) return undefined;
  return outcome.report ?? outcome.output;
}

function attemptsFile(sessionId) {
  const directory = path.join(os.tmpdir(), 'agent-guard');
  mkdirSync(directory, { recursive: true });
  return path.join(directory, `${String(sessionId ?? 'default').replace(/[^\w-]/g, '_')}.json`);
}

/** Counts consecutive failures per file, so passing on one file does not reset another file's count. */
function recordAttempt({ sessionId, file, failed }) {
  const store = attemptsFile(sessionId);
  const counts = readText(store, { parse: true }) ?? {};
  counts[file] = failed ? (counts[file] ?? 0) + 1 : 0;
  writeFileSync(store, JSON.stringify(counts));
  return counts[file];
}

function feedback({ projectPath, output, attempt, maxAttempts }) {
  if (attempt >= maxAttempts) {
    return `STOP. ${projectPath} has failed lint ${attempt} times in a row. Do not try again and do not weaken the lint setup. ${REASON_SUFFIX}\n${output}`;
  }
  return `Lint failed for ${projectPath} (attempt ${attempt} of ${maxAttempts}). Fix these errors without disable comments:\n${output}`;
}

/** Lints the file a tool just wrote and hands any errors back to the agent. */
export async function lintFeedbackHook(tool) {
  if (!FILE_TOOLS.has(tool.tool_name)) return undefined;
  const filePath = tool.tool_input?.file_path;
  if (!filePath) return undefined;
  const cwd = tool.cwd ?? process.cwd();
  const absolute = path.resolve(cwd, filePath);
  const run = SCRIPT_FILE.test(absolute) ? runEslint : STYLE_FILE.test(absolute) ? runStylelint : undefined;
  if (!run) return undefined;
  const output = await run(absolute, cwd);
  const projectPath = toProjectPath(absolute, cwd);
  const attempt = recordAttempt({ sessionId: tool.session_id, file: projectPath, failed: Boolean(output) });
  if (!output) return undefined;
  const { maxAttempts } = loadSettings(cwd);
  return { decision: 'block', reason: feedback({ projectPath, output, attempt, maxAttempts }) };
}
