import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const LOCKFILES = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
];

const ADD_DEV_DEPENDENCY = { npm: ['install', '--save-dev'], pnpm: ['add', '-D'], yarn: ['add', '-D'], bun: ['add', '--dev'] };

/** Package managers are .cmd scripts on Windows, which Node only starts through a shell. */
const NEEDS_SHELL = process.platform === 'win32';

/** A workspace keeps one lockfile at its root, so the search goes up from the app as far as the repository root. */
function lockfileManager(folder, root) {
  const found = LOCKFILES.find(([file]) => existsSync(path.join(folder, file)));
  if (found) return found[1];
  const parent = path.dirname(folder);
  return folder === root || parent === folder ? 'npm' : lockfileManager(parent, root);
}

/** The install command for the wanted packages the app does not depend on yet, or undefined when it has them all. */
export function installPlan({ dir, root, packageJson, wanted }) {
  const present = { ...packageJson.dependencies, ...packageJson.devDependencies };
  const missing = wanted.filter(({ name }) => !Object.hasOwn(present, name)).map(({ spec }) => spec);
  if (missing.length === 0) return undefined;
  const manager = lockfileManager(dir, root);
  return { command: manager, args: [...ADD_DEV_DEPENDENCY[manager], ...missing] };
}

/** The packages and flags are fixed strings, so joining them for the Windows shell cannot inject anything. */
export function runInstall({ dir, plan }) {
  const line = [plan.command, ...plan.args].join(' ');
  const options = { cwd: dir, stdio: 'inherit' };
  const run = NEEDS_SHELL ? spawnSync(line, { ...options, shell: true }) : spawnSync(plan.command, plan.args, options);
  if (run.status !== 0) {
    throw new Error(`${line} failed, so nothing was set up. Install the packages yourself, then run init again with --skip-install.`);
  }
  return `ran ${line}`;
}
