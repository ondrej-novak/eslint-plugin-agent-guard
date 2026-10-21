import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Reads a file, or returns undefined when it is missing or, with `parse`, not valid JSON. */
export function readText(file, { parse = false } = {}) {
  try {
    const text = readFileSync(file, 'utf8');
    return parse ? JSON.parse(text) : text;
  } catch {
    return undefined;
  }
}

export const SETTINGS_FILE = '.agent-guard.json';

const DEFAULT_MAX_ATTEMPTS = 3;

const PROTECTED_NAMES = [
  /^eslint\.config\.[cm]?[jt]s$/,
  /^\.eslintrc(\.\w+)?$/,
  /^\.eslintignore$/,
  /^eslint-suppressions\.json$/,
  /^stylelint\.config\.[cm]?[jt]s$/,
  /^\.stylelintrc(\.\w+)?$/,
  /^\.stylelintignore$/,
  /^\.agent-guard\.json$/,
];

const PROTECTED_PATHS = [/(^|\/)\.claude\/settings(\.local)?\.json$/, /(^|\/)\.husky\//];

/**
 * Reads `.agent-guard.json` from the project root. `protect` adds regular expressions tested against
 * the file path relative to the project, `maxAttempts` sets how often one file may fail lint in a row.
 */
export function loadSettings(cwd) {
  const user = readText(path.join(cwd, SETTINGS_FILE), { parse: true }) ?? {};
  return {
    maxAttempts: Number.isInteger(user.maxAttempts) && user.maxAttempts > 0 ? user.maxAttempts : DEFAULT_MAX_ATTEMPTS,
    protectedPaths: [...PROTECTED_PATHS, ...(user.protect ?? []).map((pattern) => new RegExp(pattern, 'u'))],
  };
}

export function toProjectPath(filePath, cwd) {
  return path.relative(cwd, path.resolve(cwd, filePath)).split(path.sep).join('/');
}

export function isProtected(projectPath, settings) {
  const base = projectPath.split('/').at(-1);
  return PROTECTED_NAMES.some((pattern) => pattern.test(base)) || settings.protectedPaths.some((pattern) => pattern.test(projectPath));
}

/** The same names, as text to look for inside a shell command. */
export const PROTECTED_IN_COMMAND = /eslint\.config\.|\.eslintrc|\.eslintignore|eslint-suppressions\.json|stylelint\.config\.|\.stylelintrc|\.stylelintignore|\.agent-guard\.json|\.claude\/settings|\.husky\//;
