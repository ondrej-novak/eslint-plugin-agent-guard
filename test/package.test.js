import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');

function packedFiles() {
  const output = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: root, encoding: 'utf8' });
  return JSON.parse(output)[0].files.map(({ path: file }) => file).sort();
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
});
