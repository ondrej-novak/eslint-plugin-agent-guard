import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Windows editors and PowerShell save UTF-8 with a BOM, which npm tolerates and JSON.parse does not. */
export function parseJson(text) {
  return JSON.parse(text.replace(/^\uFEFF/u, ''));
}

/** Reads a file, or returns undefined when it is missing or, with `parse`, not valid JSON. */
export function readText(file, { parse = false } = {}) {
  try {
    const text = readFileSync(file, 'utf8');
    return parse ? parseJson(text) : text;
  } catch {
    return undefined;
  }
}

export const SETTINGS_FILE = '.agent-guard.json';

export const DEFAULT_MAX_ATTEMPTS = 3;

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

function parseSettings(text) {
  try {
    return parseJson(text);
  } catch (error) {
    throw new Error(`${SETTINGS_FILE} is not valid JSON: ${error.message}`, { cause: error });
  }
}

function readSettings(root) {
  const text = settingsText(path.join(root, SETTINGS_FILE));
  if (text === undefined) return {};
  const user = parseSettings(text);
  if (user === null || typeof user !== 'object' || Array.isArray(user)) {
    throw new Error(`${SETTINGS_FILE} must be a JSON object, for example { "protect": ["^src/generated/"] }`);
  }
  return user;
}

/** Claude's working directory moves with every `cd`; the project root does not, so settings and patterns stay in force. */
export function projectRoot(tool) {
  return process.env.CLAUDE_PROJECT_DIR || tool.cwd || process.cwd();
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
export function loadSettings(root) {
  const user = readSettings(root);
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

/**
 * The same names, as text to look for in one word of a shell command, plus what removes them wholesale:
 * the `.husky` and `.claude` folders, and this package, without which the hooks stop running at all.
 */
export const PROTECTED_IN_COMMAND =
  /eslint\.config\.|\.eslintrc|\.eslintignore|eslint-suppressions\.json|stylelint\.config\.|\.stylelintrc|\.stylelintignore|\.agent-guard\.json|\.claude(?:\/settings|\/?(?![\w./-]))|\.husky(?![\w.-])|node_modules\/eslint-plugin-agent-guard(?![\w.-])/i;
