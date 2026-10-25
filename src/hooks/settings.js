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

/** Matched without case: on Windows and macOS, `ESLint.config.js` opens the same file as `eslint.config.js`. */
const PROTECTED_NAMES = [
  /^eslint\.config\.[cm]?[jt]s$/i,
  /^\.eslintrc(\.\w+)?$/i,
  /^\.eslintignore$/i,
  /^eslint-suppressions\.json$/i,
  /^stylelint\.config\.[cm]?[jt]s$/i,
  /^\.stylelintrc(\.\w+)?$/i,
  /^\.stylelintignore$/i,
  /^\.agent-guard\.json$/i,
];

const PROTECTED_PATHS = [/(^|\/)\.claude\/settings(\.local)?\.json$/i, /(^|\/)\.husky\//i];

/** Only a missing file means "no settings"; any other read error must reach the fail-closed handler. */
function settingsText(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw new Error(`${SETTINGS_FILE} could not be read: ${error.message}`, { cause: error });
  }
}

function readSettings(cwd) {
  const text = settingsText(path.join(cwd, SETTINGS_FILE));
  if (text === undefined) return {};
  try {
    return JSON.parse(text) ?? {};
  } catch (error) {
    throw new Error(`${SETTINGS_FILE} is not valid JSON: ${error.message}`, { cause: error });
  }
}

function toPattern(pattern) {
  try {
    return new RegExp(pattern, 'iu');
  } catch (error) {
    throw new Error(`${SETTINGS_FILE}: "${pattern}" in "protect" is not a valid regular expression`, { cause: error });
  }
}

function userPatterns(protect = []) {
  if (!Array.isArray(protect) || protect.some((pattern) => typeof pattern !== 'string')) {
    throw new Error(`${SETTINGS_FILE}: "protect" must be a list of regular expressions written as strings`);
  }
  return protect.map(toPattern);
}

/**
 * Reads `.agent-guard.json` from the project root. `protect` adds regular expressions tested against
 * the file path relative to the project, `maxAttempts` sets how often one file may fail lint in a row.
 * An invalid file throws, so the protect hook blocks instead of quietly dropping the user's patterns.
 */
export function loadSettings(cwd) {
  const user = readSettings(cwd);
  return {
    maxAttempts: Number.isInteger(user.maxAttempts) && user.maxAttempts > 0 ? user.maxAttempts : DEFAULT_MAX_ATTEMPTS,
    protectedPaths: [...PROTECTED_PATHS, ...userPatterns(user.protect)],
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
export const PROTECTED_IN_COMMAND = /eslint\.config\.|\.eslintrc|\.eslintignore|eslint-suppressions\.json|stylelint\.config\.|\.stylelintrc|\.stylelintignore|\.agent-guard\.json|\.claude\/settings|\.husky\//i;
