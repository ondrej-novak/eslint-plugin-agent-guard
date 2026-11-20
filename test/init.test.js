import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { afterEach, describe, expect, it } from 'vitest';
import { init } from '../src/init/index.js';
import { installPlan } from '../src/init/install.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, '..');
const bin = path.join(repo, 'bin/agent-guard.mjs');
const { version } = createRequire(import.meta.url)('../package.json');

/** A first import of ESLint and typescript-eslint can take over 10 s on a cold Windows machine. */
const FIRST_IMPORT_TIMEOUT_MS = 30_000;

const SKIP_INSTALL = ['--skip-install'];

const projects = [];

function project(packageJson = { type: 'module' }) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agent-guard-init-'));
  projects.push(dir);
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify(packageJson));
  return dir;
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const commands = (entries) => entries.flatMap((entry) => entry.hooks.map(({ command }) => command));

afterEach(() => projects.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe('init', () => {
  it('creates an ESLint config that lints JavaScript and TypeScript, through the CLI', { timeout: FIRST_IMPORT_TIMEOUT_MS }, async () => {
    const dir = project({ type: 'module', devDependencies: { typescript: '^5.0.0' } });
    const run = spawnSync('node', [bin, 'init', ...SKIP_INSTALL], { cwd: dir, encoding: 'utf8' });
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/created eslint\.config\.js with the recommended preset/);
    mkdirSync(path.join(dir, 'node_modules'));
    for (const [name, target] of [['eslint-plugin-agent-guard', repo], ['eslint', path.join(repo, 'node_modules/eslint')], ['typescript-eslint', path.join(repo, 'node_modules/typescript-eslint')]]) {
      symlinkSync(target, path.join(dir, 'node_modules', name), 'junction');
    }
    writeFileSync(path.join(dir, 'a.ts'), 'export function f(a: number, b: number, c: number): number { return a + b + c; }\n');
    writeFileSync(path.join(dir, 'b.js'), 'export const wait = (run) => setTimeout(run, 10000);\n');
    const results = await new ESLint({ cwd: dir }).lintFiles(['a.ts', 'b.js']);
    expect(results.map(({ messages }) => messages.map(({ ruleId }) => ruleId))).toEqual([['agent-guard/max-params'], ['agent-guard/no-magic-numbers']]);
  });

  it('writes eslint.config.mjs for a CommonJS package and picks the preset from the dependencies', () => {
    const dir = project({ dependencies: { react: '^19.0.0' } });
    init({ cwd: dir, args: SKIP_INSTALL });
    const config = readFileSync(path.join(dir, 'eslint.config.mjs'), 'utf8');
    expect(config).toMatch(/agentGuard\.configs\.react/);
    expect(config).not.toMatch(/typescript-eslint/);
  });

  it.each(['eslint.config.ts', '.eslintrc.json'])('leaves an existing %s alone and says what to add', (name) => {
    const dir = project();
    writeFileSync(path.join(dir, name), 'keep me');
    const report = init({ cwd: dir, args: SKIP_INSTALL });
    expect(readFileSync(path.join(dir, name), 'utf8')).toBe('keep me');
    expect(report.join('\n')).toMatch(new RegExp(`${name.replace('.', '\\.')}[\\s\\S]*agentGuard\\.configs\\.recommended`));
  });

  it('adds the hooks to .claude/settings.json, keeps what was there, and adds nothing on a second run', () => {
    const dir = project();
    const settingsFile = path.join(dir, '.claude/settings.json');
    mkdirSync(path.dirname(settingsFile));
    const own = { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo mine' }] };
    writeFileSync(settingsFile, JSON.stringify({ permissions: { allow: ['Bash(npm test)'] }, hooks: { PreToolUse: [own] } }));
    init({ cwd: dir, args: SKIP_INSTALL });
    const second = init({ cwd: dir, args: SKIP_INSTALL });
    const settings = readJson(settingsFile);
    expect(settings.permissions).toEqual({ allow: ['Bash(npm test)'] });
    expect(commands(settings.hooks.PreToolUse)).toEqual(['echo mine', 'node "$CLAUDE_PROJECT_DIR/node_modules/eslint-plugin-agent-guard/bin/agent-guard.mjs" protect']);
    expect(settings.hooks.PreToolUse[1].matcher).toBe('Edit|Write|MultiEdit|NotebookEdit|Bash|PowerShell|Shell|Delete');
    expect(commands(settings.hooks.PostToolUse)).toEqual(['node "$CLAUDE_PROJECT_DIR/node_modules/eslint-plugin-agent-guard/bin/agent-guard.mjs" lint']);
    expect(second.join('\n')).toMatch(/\.claude\/settings\.json already runs the hooks/);
  });

  it('points the hooks of every agent at the app from the git root, and puts the agent instruction there', () => {
    const root = project();
    execFileSync('git', ['init', '-q'], { cwd: root });
    const app = path.join(root, 'mobile');
    mkdirSync(app);
    writeFileSync(path.join(app, 'package.json'), '{}');
    const report = init({ cwd: app, args: ['--codex', ...SKIP_INSTALL] });
    const claude = readJson(path.join(root, '.claude/settings.json'));
    expect(commands(claude.hooks.PostToolUse)).toEqual(['node "$CLAUDE_PROJECT_DIR/mobile/node_modules/eslint-plugin-agent-guard/bin/agent-guard.mjs" lint']);
    const codex = readJson(path.join(root, '.codex/hooks.json'));
    expect(codex.hooks.PreToolUse).toEqual([
      { matcher: 'Bash|apply_patch', hooks: [{ type: 'command', command: 'node "$(git rev-parse --show-toplevel)/mobile/node_modules/eslint-plugin-agent-guard/bin/agent-guard.mjs" protect' }] },
    ]);
    expect(report.join('\n')).toMatch(/trust them in \/hooks/);
    expect(readFileSync(path.join(root, '.claude/rules/code-shape.md'), 'utf8')).toMatch(/^# Code shape/);
    expect(existsSync(path.join(app, 'eslint.config.mjs'))).toBe(true);
  });

  it('stops without writing anything when a settings file is not valid JSON', () => {
    const dir = project();
    mkdirSync(path.join(dir, '.claude'));
    writeFileSync(path.join(dir, '.claude/settings.json'), '{ "hooks": ');
    expect(() => init({ cwd: dir, args: SKIP_INSTALL })).toThrow(/settings\.json is not valid JSON/);
    expect(readFileSync(path.join(dir, '.claude/settings.json'), 'utf8')).toBe('{ "hooks": ');
    expect(existsSync(path.join(dir, 'eslint.config.js'))).toBe(false);
  });

  it('refuses to run outside a package, or with an option it does not know', () => {
    const dir = project();
    rmSync(path.join(dir, 'package.json'));
    expect(() => init({ cwd: dir, args: SKIP_INSTALL })).toThrow(/no readable package\.json/);
    const run = spawnSync('node', [bin, 'init', '--force'], { cwd: project(), encoding: 'utf8' });
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/unknown option --force[\s\S]*npx eslint-plugin-agent-guard init/);
  });
});

describe('the install step of init', () => {
  const wanted = [{ name: 'eslint', spec: 'eslint' }, { name: 'eslint-plugin-agent-guard', spec: `eslint-plugin-agent-guard@${version}` }];

  it('installs only what is missing, with the package manager whose lockfile it finds first above the app', () => {
    const root = project();
    const app = path.join(root, 'web');
    mkdirSync(app);
    writeFileSync(path.join(root, 'pnpm-lock.yaml'), '');
    const plan = installPlan({ dir: app, root, packageJson: { devDependencies: { eslint: '^10.0.0' } }, wanted });
    expect(plan).toEqual({ command: 'pnpm', args: ['add', '-D', `eslint-plugin-agent-guard@${version}`] });
    const loose = project();
    expect(installPlan({ dir: loose, root: loose, packageJson: {}, wanted })).toEqual({ command: 'npm', args: ['install', '--save-dev', 'eslint', `eslint-plugin-agent-guard@${version}`] });
    expect(installPlan({ dir: app, root, packageJson: { dependencies: { eslint: '*', 'eslint-plugin-agent-guard': '*' } }, wanted })).toBeUndefined();
  });
});
