import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { readText } from '../hooks/settings.js';
import { addAgentHooks, checkAgentSettings } from './agent-hooks.js';
import { describeProject, existingConfig, writeEslintConfig } from './eslint-config.js';
import { installPlan, runInstall } from './install.js';

const { name: PACKAGE_NAME, version } = createRequire(import.meta.url)('../../package.json');
const RULES_TEMPLATE = path.join(import.meta.dirname, 'code-shape.md');
const RULES_FILE = '.claude/rules/code-shape.md';
const OPTIONS = new Set(['--codex', '--skip-install']);

/** `npx agent-guard` would fetch an unrelated npm package until this one is installed, so usage names the package. */
export const INIT_USAGE = `npx ${PACKAGE_NAME} init [--codex] [--skip-install]`;

function readOptions(args) {
  const unknown = args.find((arg) => !OPTIONS.has(arg));
  if (unknown) throw new Error(`unknown option ${unknown}. Usage: ${INIT_USAGE}`);
  return { codex: args.includes('--codex'), install: !args.includes('--skip-install') };
}

/** Claude Code and Codex read their hooks from the repository root, which is above the app in a monorepo. */
function gitRoot(dir) {
  try {
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return realpathSync.native(top.trim());
  } catch {
    return undefined;
  }
}

function wantedPackages(project) {
  const typescriptParser = project.typescript && !project.hasConfig ? [{ name: 'typescript-eslint', spec: 'typescript-eslint' }] : [];
  return [{ name: 'eslint', spec: 'eslint' }, { name: PACKAGE_NAME, spec: `${PACKAGE_NAME}@${version}` }, ...typescriptParser];
}

function copyRules(root) {
  const target = path.join(root, RULES_FILE);
  if (existsSync(target)) return `${RULES_FILE} was left alone`;
  mkdirSync(path.dirname(target), { recursive: true });
  copyFileSync(RULES_TEMPLATE, target);
  return `copied the instruction for the agent to ${RULES_FILE}`;
}

function readProject(cwd) {
  const dir = realpathSync.native(cwd);
  const packageJson = readText(path.join(dir, 'package.json'), { parse: true });
  if (!packageJson) throw new Error(`no readable package.json in ${dir}. Run init in the folder of the app to guard.`);
  const root = gitRoot(dir) ?? dir;
  const appPath = path.relative(root, dir).split(path.sep).join('/');
  return { dir, root, appPath, packageJson, project: { ...describeProject(packageJson), hasConfig: Boolean(existingConfig(dir)) } };
}

/**
 * Installs what is missing, then adds the ESLint config, the agent hooks and the agent instruction. It adds to files that
 * exist and never overwrites one, so a second run changes nothing. Returns one line per step for the person running it.
 */
export function init({ cwd, args }) {
  const options = readOptions(args);
  const { dir, root, appPath, packageJson, project } = readProject(cwd);
  const agentNames = options.codex || existsSync(path.join(root, '.codex')) ? ['claude', 'codex'] : ['claude'];
  checkAgentSettings({ root, agentNames });
  const plan = options.install ? installPlan({ dir, root, packageJson, wanted: wantedPackages(project) }) : undefined;
  return [
    ...(plan ? [runInstall({ dir, plan })] : []),
    writeEslintConfig({ dir, project }),
    ...agentNames.map((agentName) => addAgentHooks({ root, appPath, agentName })),
    copyRules(root),
  ];
}
