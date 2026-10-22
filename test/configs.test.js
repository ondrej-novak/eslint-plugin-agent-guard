import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import plugin from '../src/index.js';

function lint({ code, filename, preset = 'recommended', extra = [] }) {
  const config = [...extra, ...plugin.configs[preset]];
  return new Linter().verify(code, config, { filename }).map(({ ruleId, message, severity }) => ({ ruleId, message, severity }));
}

const longFunction = `export function f() {\n${'  run();\n'.repeat(60)}}\n`;

describe('recommended preset', () => {
  it('reports the five rules with hints', () => {
    const messages = lint({ code: 'export function f(a, b, c) { return setTimeout(a, 10000); }', filename: 'src/a.js' });
    expect(messages.map(({ ruleId }) => ruleId)).toEqual(['agent-guard/max-params', 'agent-guard/no-magic-numbers']);
    expect(messages[1].message).toMatch(/REQUEST_TIMEOUT_MS/);
  });

  it('makes disable comments inert', () => {
    const code = '/* eslint-disable */\nexport const wait = () => setTimeout(go, 10000);\n';
    const ruleIds = lint({ code, filename: 'src/a.js' }).map(({ ruleId }) => ruleId);
    expect(ruleIds).toContain('agent-guard/no-magic-numbers');
  });

  it('reports a long function', () => {
    const ruleIds = lint({ code: longFunction, filename: 'src/a.js' }).map(({ ruleId }) => ruleId);
    expect(ruleIds).toEqual(['agent-guard/max-lines-per-function']);
  });

  it('relaxes size and number rules in tests', () => {
    expect(lint({ code: `${longFunction}expect(sum(2, 3)).toBe(5);\n`, filename: 'src/a.spec.js' })).toEqual([]);
  });
});

describe('react preset', () => {
  it('parses JSX and leaves numbers in attributes alone', () => {
    const code = 'export const Grid = () => <Layout columns={3} tabIndex={-1} />;\n';
    expect(lint({ code, filename: 'src/Grid.jsx', preset: 'react' })).toEqual([]);
  });
});

describe('angular preset', () => {
  const ts = [{ files: ['**/*.ts'], languageOptions: { parser: tseslint.parser } }];

  it('ignores enums, literal types and readonly fields', () => {
    const code = 'export enum Retry { Max = 5 }\nexport type Size = 12;\nexport class Poller { private readonly intervalMs = 5000; }\n';
    expect(lint({ code, filename: 'src/app/poller.ts', preset: 'angular', extra: ts })).toEqual([]);
  });

  it('bans importing environment outside app.config.ts', () => {
    const code = "import { environment } from '../environments/environment';\nexport const api = environment.api;\n";
    expect(lint({ code, filename: 'src/app/api.service.ts', preset: 'angular', extra: ts }).map(({ ruleId }) => ruleId)).toEqual(['no-restricted-imports']);
    expect(lint({ code, filename: 'src/app/app.config.ts', preset: 'angular', extra: ts })).toEqual([]);
  });
});
