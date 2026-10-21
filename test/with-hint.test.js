import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import plugin, { withHint } from '../src/index.js';
import { ruleTester } from './rule-tester.js';

const { rules } = plugin;

ruleTester.run('max-params with hint', rules['max-params'], {
  valid: [
    { code: 'function f(a, b) {}', options: [{ max: 2, hint: 'Use one object.' }] },
    { code: 'function f(a, b, c) {}', options: [3] },
  ],
  invalid: [
    {
      code: 'function f(a, b, c) {}',
      options: [{ max: 2, hint: 'Pass one typed object and destructure it.' }],
      errors: [{ message: "Function 'f' has too many parameters (3). Maximum allowed is 2. Pass one typed object and destructure it." }],
    },
    {
      code: 'function f(a, b, c) {}',
      options: [{ max: 2 }],
      errors: [{ message: "Function 'f' has too many parameters (3). Maximum allowed is 2." }],
    },
  ],
});

ruleTester.run('max-lines-per-function with hint', rules['max-lines-per-function'], {
  valid: [{ code: 'function f() {\n  return 1;\n}', options: [{ max: 3, hint: 'Extract.' }] }],
  invalid: [
    {
      code: 'function f() {\n  a();\n  b();\n}',
      options: [{ max: 3, hint: 'Extract.' }],
      errors: [{ message: "Function 'f' has too many lines (4). Maximum allowed is 3. Extract." }],
    },
  ],
});

ruleTester.run('no-magic-numbers with hint', rules['no-magic-numbers'], {
  valid: [
    { code: 'const TIMEOUT_MS = 10000;', options: [{ hint: 'Name it.' }] },
    { code: 'const view = <Grid columns={3} tabIndex={-1} />;', options: [{ hint: 'Name it.' }] },
  ],
  invalid: [
    {
      code: 'setTimeout(run, 10000);',
      options: [{ hint: 'Name it.' }],
      errors: [{ message: 'No magic number: 10000. Name it.' }],
    },
    {
      code: 'const view = <Grid>{items.slice(5)}</Grid>;',
      options: [{}],
      errors: [{ message: 'No magic number: 5.' }],
    },
  ],
});

describe('withHint schema', () => {
  const lintWith = (options) =>
    new Linter().verify('a();', [{ plugins: { 'agent-guard': plugin }, rules: { 'agent-guard/max-lines': ['error', options] } }]);

  it('accepts the wrapped rule options plus hint', () => {
    expect(lintWith({ max: 10, skipBlankLines: true, hint: 'Split it.' })).toEqual([]);
  });

  it('still rejects options the wrapped rule does not know', () => {
    expect(() => lintWith({ maxx: 10 })).toThrow(/maxx/);
  });
});

describe('withHint on a typescript-eslint rule', () => {
  it('appends the hint and keeps the rule options', async () => {
    const { default: tseslint } = await import('typescript-eslint');
    const local = { rules: { 'no-explicit-any': withHint(tseslint.plugin.rules['no-explicit-any']) } };
    const messages = new Linter().verify(
      'export const parse = (text: any) => text;',
      [{ files: ['**/*.ts'], languageOptions: { parser: tseslint.parser }, plugins: { local }, rules: { 'local/no-explicit-any': ['error', { ignoreRestArgs: true, hint: 'Use unknown.' }] } }],
      { filename: 'a.ts' },
    );
    expect(messages.map(({ message }) => message)).toEqual(['Unexpected any. Specify a different type. Use unknown.']);
  });
});
