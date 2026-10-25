import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');

/** On Windows npm is a .cmd script, which Node only starts through a shell. */
const NPM_NEEDS_SHELL = process.platform === 'win32';

/** npm 12 keys the `pack --json` result by package name; earlier versions return an array. */
function packedFiles() {
  const output = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: root, encoding: 'utf8', shell: NPM_NEEDS_SHELL });
  const packed = JSON.parse(output);
  const [result] = Array.isArray(packed) ? packed : Object.values(packed);
  return result.files.map(({ path: file }) => file).sort();
}

function sourceFiles() {
  return ['src', 'bin', 'types'].flatMap((dir) => readdirSync(path.join(root, dir), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)).replaceAll('\\', '/')));
}

describe('npm package', () => {
  it('ships the plugin, its types, the hooks CLI and nothing else', () => {
    expect(packedFiles()).toEqual(['LICENSE', 'README.md', 'package.json', ...sourceFiles()].sort());
  });

  it('loads through require() for CommonJS configs, with the plugin under .default', () => {
    const required = createRequire(import.meta.url)('eslint-plugin-agent-guard');
    expect(Object.keys(required.default.rules)).toContain('max-params');
    expect(required.withHint).toBeTypeOf('function');
  });
});
