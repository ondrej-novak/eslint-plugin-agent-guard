import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ESLint } from 'eslint';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { lintFeedbackHook } from '../src/hooks/lint-feedback.js';
import { protectReason } from '../src/hooks/protect.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const cwd = path.join(here, 'fixtures/project');
const bin = path.join(here, '../bin/agent-guard.mjs');

/** On Windows npx is a .cmd script, which Node only starts through a shell. */
const NPX_NEEDS_SHELL = process.platform === 'win32';

/** The first import of stylelint can take over 10 s on a cold Windows machine. */
const FIRST_IMPORT_TIMEOUT_MS = 30_000;

const edit = (filePath, input = {}) => ({ cwd, tool_name: 'Edit', tool_input: { file_path: filePath, old_string: 'a', new_string: 'b', ...input } });
const bash = (command) => ({ cwd, tool_name: 'Bash', tool_input: { command } });

describe('protect', () => {
  it.each(['eslint.config.js', 'eslint.config.mjs', '.eslintrc.json', 'stylelint.config.js', '.stylelintrc.json', 'eslint-suppressions.json', '.agent-guard.json', '.claude/settings.json', '.claude/settings.local.json'])(
    'blocks edits to %s',
    (file) => expect(protectReason(edit(path.join(cwd, file)))).toMatch(/not allowed/),
  );

  it.each(['ESLint.config.js', '.ESLINTRC.json', 'Eslint-Suppressions.json', '.Claude/Settings.json'])(
    'blocks edits to %s, because file names ignore case on Windows and macOS',
    (file) => expect(protectReason(edit(path.join(cwd, file)))).toMatch(/not allowed/),
  );

  it('allows edits to source files', () => {
    expect(protectReason(edit(path.join(cwd, 'src/service.ts')))).toBeUndefined();
    expect(protectReason({ ...edit('src/a.ts'), tool_name: 'Write', tool_input: { file_path: 'src/a.ts', content: '' } })).toBeUndefined();
  });

  it('blocks lint script changes in package.json but allows other changes', () => {
    expect(protectReason(edit('package.json', { old_string: '"lint": "eslint ."', new_string: '"lint": "echo ok"' }))).toMatch(/lint scripts/);
    expect(protectReason(edit('package.json', { old_string: '"build": "tsc"', new_string: '"build": "tsc -b"' }))).toBeUndefined();
    const write = (content, filePath = 'package.json') => protectReason({ cwd, tool_name: 'Write', tool_input: { file_path: filePath, content } });
    expect(write('{ "name": "fixture-project", "scripts": { "lint": "eslint .", "build": "vite build" } }')).toBeUndefined();
    expect(write('{ "name": "fixture-project", "scripts": { "build": "tsc" } }')).toMatch(/lint scripts/);
    expect(write('{ "scripts": { "lint": "echo ok" } }', 'PACKAGE.JSON')).toMatch(/lint scripts/);
  });

  it('judges a package.json edit by the lint setup it leaves behind, not by the word lint', () => {
    expect(protectReason(edit('package.json', { old_string: '"private": true', new_string: '"private": true, "devDependencies": { "eslint": "^10.0.0" }' }))).toBeUndefined();
    expect(protectReason(edit('package.json', { old_string: ' ."', new_string: ' . || true"' }))).toMatch(/lint scripts/);
    const edits = [{ old_string: '"build": "tsc"', new_string: '"build": "tsc -b"' }, { old_string: 'eslint .', new_string: 'eslint src' }];
    expect(protectReason({ cwd, tool_name: 'MultiEdit', tool_input: { file_path: 'package.json', edits } })).toMatch(/lint scripts/);
    const write = (content) => protectReason({ cwd, tool_name: 'Write', tool_input: { file_path: 'package.json', content } });
    expect(write('{ "name": "fixture-project", "scripts": { "lint": "eslint .", "build": "tsc", "test": "eslint . && vitest" } }')).toMatch(/lint scripts/);
  });

  it('honours extra patterns from .agent-guard.json', () => {
    writeFileSync(path.join(cwd, '.agent-guard.json'), JSON.stringify({ protect: ['^src/generated/'] }));
    try {
      expect(protectReason(edit('src/generated/api.ts'))).toMatch(/not allowed/);
      expect(protectReason(edit('SRC/Generated/api.ts'))).toMatch(/not allowed/);
    } finally {
      rmSync(path.join(cwd, '.agent-guard.json'));
    }
  });

  it.each([
    "sed -i 's/50/100/' eslint.config.js",
    'echo "{}" > .stylelintrc.json',
    'rm eslint.config.mjs',
    'rm ESLint.config.js',
    'git checkout -- eslint.config.js',
    'git commit -m wip --no-verify',
    'npx eslint --no-config-lookup src',
  ])('blocks the command %s', (command) => expect(protectReason(bash(command))).toMatch(/not allowed/));

  it.each(['cat eslint.config.js', 'cat eslint.config.js 2>/dev/null', 'npx eslint src', 'npm test > out.txt'])('allows the command %s', (command) =>
    expect(protectReason(bash(command))).toBeUndefined(),
  );

  describe('in PowerShell', () => {
    const powershell = (command) => ({ cwd, tool_name: 'PowerShell', tool_input: { command } });

    it.each([
      "Set-Content mobile/eslint.config.js 'export default []'",
      "'{}' | Out-File .stylelintrc.json",
      "Add-Content eslint.config.mjs 'export const x = 1;'",
      'Remove-Item eslint-suppressions.json',
      'Move-Item eslint.config.js eslint.config.bak',
      'Copy-Item other.js eslint.config.js',
      'New-Item -ItemType File -Force .agent-guard.json',
      'remove-item .eslintrc.json',
      'del eslint.config.js',
      "Set-Content ESLINT.CONFIG.JS ''",
      "[IO.File]::WriteAllText('eslint.config.js', '')",
      "'{}' > .stylelintrc.json",
      '$env:HUSKY = 0; git commit -m wip',
      'git commit -m wip --no-verify',
    ])('blocks the command %s', (command) => expect(protectReason(powershell(command))).toMatch(/not allowed/));

    it.each(['Get-Content eslint.config.js', 'npx eslint src', 'Set-Content src/app.ts $code', 'npm test 2>$null'])('allows the command %s', (command) =>
      expect(protectReason(powershell(command))).toBeUndefined(),
    );
  });

  describe('when it cannot check a tool call', () => {
    const settingsFile = path.join(cwd, '.agent-guard.json');
    const runCli = (hook, input) => JSON.parse(execFileSync('node', [bin, hook], { input, encoding: 'utf8' }));
    const withSettings = (text, check) => {
      writeFileSync(settingsFile, text);
      try {
        check();
      } finally {
        rmSync(settingsFile);
      }
    };

    it.each([
      ['"protect" is not a list', '{ "protect": "^src/generated/" }'],
      ['a pattern is not a valid regular expression', '{ "protect": ["["] }'],
      ['the file is not valid JSON', '{ "protect": ['],
    ])('denies edits and commands when %s in .agent-guard.json', (_, text) => withSettings(text, () => {
      for (const event of [edit('src/a.ts'), bash('npm test')]) {
        const { hookSpecificOutput } = runCli('protect', JSON.stringify(event));
        expect(hookSpecificOutput.permissionDecision).toBe('deny');
        expect(hookSpecificOutput.permissionDecisionReason).toMatch(/\.agent-guard\.json[\s\S]*tell the user/);
      }
    }));

    it('denies when the hook input is not valid JSON', () => {
      expect(runCli('protect', '{').hookSpecificOutput.permissionDecision).toBe('deny');
    });

    it('tells the user when the lint hook fails', () => {
      expect(runCli('lint', '{').systemMessage).toMatch(/lint hook failed/);
    });
  });

  it('answers through the CLI in the Claude Code hook format', () => {
    const output = execFileSync('node', [bin, 'protect'], { input: JSON.stringify(edit('eslint.config.js')), encoding: 'utf8' });
    expect(JSON.parse(output).hookSpecificOutput).toMatchObject({ hookEventName: 'PreToolUse', permissionDecision: 'deny' });
    expect(execFileSync('node', [bin, 'protect'], { input: JSON.stringify(edit('src/a.ts')), encoding: 'utf8' })).toBe('');
  });
});

describe('lint feedback', () => {
  const created = [];
  const sessionId = randomUUID();
  const write = (name, content) => {
    const file = path.join(cwd, 'src', name);
    writeFileSync(file, content);
    created.push(file);
    return { cwd, session_id: sessionId, tool_name: 'Write', tool_input: { file_path: file, content } };
  };

  afterEach(() => created.splice(0).forEach((file) => rmSync(file, { force: true })));

  it('returns nothing for clean files and files it does not lint', async () => {
    expect(await lintFeedbackHook(write('clean.js', 'export const add = (a, b) => a + b;\n'))).toBeUndefined();
    expect(await lintFeedbackHook(write('notes.md', '# notes'))).toBeUndefined();
  });

  it('feeds errors back and stops after three failures on the same file', async () => {
    const bad = 'export const wait = (run) => setTimeout(run, 10000);\n';
    const first = await lintFeedbackHook(write('bad.js', bad));
    expect(first.decision).toBe('block');
    expect(first.reason).toMatch(/attempt 1 of 3[\s\S]*No magic number: 10000/);
    expect((await lintFeedbackHook(write('other.js', 'export const ok = 1;\n')))).toBeUndefined();
    await lintFeedbackHook(write('bad.js', bad));
    const third = await lintFeedbackHook(write('bad.js', bad));
    expect(third.reason).toMatch(/^STOP\. src\/bad\.js has failed lint 3 times/);
  });

  it('resets the count once the file passes', async () => {
    await lintFeedbackHook(write('fixed.js', 'export const wait = (run) => setTimeout(run, 10000);\n'));
    expect(await lintFeedbackHook(write('fixed.js', 'const TIMEOUT_MS = 10000;\nexport const wait = (run) => setTimeout(run, TIMEOUT_MS);\n'))).toBeUndefined();
    const again = await lintFeedbackHook(write('fixed.js', 'export const wait = (run) => setTimeout(run, 20000);\n'));
    expect(again.reason).toMatch(/attempt 1 of 3/);
  });

  it('lints stylesheets with the project stylelint', { timeout: FIRST_IMPORT_TIMEOUT_MS }, async () => {
    const result = await lintFeedbackHook(write('a.css', '.a { color: #ggg; }\n'));
    expect(result.reason).toMatch(/color-no-invalid-hex/);
  });
});

describe('lint feedback for an app in a subfolder', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'agent-guard-'));
  const app = path.join(root, 'mobile');
  const linkedEslint = path.join(app, 'node_modules/eslint');
  const event = (filePath) => ({ cwd: root, session_id: randomUUID(), tool_name: 'Write', tool_input: { file_path: filePath } });

  beforeAll(() => {
    mkdirSync(path.join(app, 'src'), { recursive: true });
    mkdirSync(path.dirname(linkedEslint));
    symlinkSync(path.join(here, '../node_modules/eslint'), linkedEslint, 'junction');
    writeFileSync(path.join(app, 'package.json'), '{ "type": "module" }');
    const plugin = pathToFileURL(path.join(here, '../src/index.js')).href;
    writeFileSync(path.join(app, 'eslint.config.js'), `import agentGuard from '${plugin}';\nexport default [...agentGuard.configs.recommended];\n`);
  });

  afterAll(() => {
    unlinkSync(linkedEslint);
    rmSync(root, { recursive: true, force: true });
  });

  it('lints with the ESLint and config of the package around the file when the project root has neither', async () => {
    writeFileSync(path.join(app, 'src/bad.js'), 'export const wait = (run) => setTimeout(run, 10000);\n');
    const result = await lintFeedbackHook(event('mobile/src/bad.js'));
    expect(result.reason).toMatch(/mobile\/src\/bad\.js \(attempt 1 of 3\)[\s\S]*No magic number: 10000/);
  });

  it('tells the user once per session when it finds no ESLint at all', async () => {
    writeFileSync(path.join(root, 'loose.js'), 'export const a = 1;\n');
    const loose = event('loose.js');
    expect((await lintFeedbackHook(loose)).systemMessage).toMatch(/no ESLint found for loose\.js/);
    expect(await lintFeedbackHook(loose)).toBeUndefined();
  });
});

function apiAppliesSuppressions() {
  try {
    new ESLint({ applySuppressions: true });
    return true;
  } catch {
    return false;
  }
}

describe.runIf(apiAppliesSuppressions())('lint feedback with bulk suppressions', () => {
  const file = path.join(cwd, 'src/legacy.js');
  const suppressions = path.join(cwd, 'eslint-suppressions.json');

  afterEach(() => [file, suppressions].forEach((target) => rmSync(target, { force: true })));

  it('does not report violations recorded in eslint-suppressions.json', async () => {
    writeFileSync(file, 'export const wait = (run) => setTimeout(run, 10000);\n');
    execFileSync('npx', ['eslint', '--suppress-all', 'src/legacy.js'], { cwd, stdio: 'ignore', shell: NPX_NEEDS_SHELL });
    const event = { cwd, session_id: randomUUID(), tool_name: 'Edit', tool_input: { file_path: file } };
    expect(await lintFeedbackHook(event)).toBeUndefined();
    writeFileSync(file, 'export const wait = (run) => setTimeout(run, 10000);\nexport const later = (run) => setTimeout(run, 20000);\n');
    expect((await lintFeedbackHook(event)).reason).toMatch(/20000/);
  });
});
