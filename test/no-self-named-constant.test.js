import tseslint from 'typescript-eslint';
import { RuleTester } from 'eslint';
import rule from '../src/rules/no-self-named-constant.js';
import { ruleTester } from './rule-tester.js';

const message = (name, value) =>
  `"${name}" only restates its value ${value}. Name it after what the number means, for example REQUEST_TIMEOUT_MS or MAX_RETRY_ATTEMPTS.`;

ruleTester.run('no-self-named-constant', rule, {
  valid: [
    'const REQUEST_TIMEOUT_MS = 10000;',
    'const MAX_RETRY_ATTEMPTS = 3;',
    'const TEN_THOUSAND_LABEL = "10k";',
    'const PAGE_SIZE_TEN = 10;',
    'class Poller { static INTERVAL_MS = 5000; }',
    'let count = 0;',
  ],
  invalid: [
    { code: 'const TEN_THOUSAND = 10000;', errors: [{ message: message('TEN_THOUSAND', 10000) }] },
    { code: 'const tenThousand = 10_000;', errors: [{ message: message('tenThousand', 10000) }] },
    { code: 'const THREE = 3;', errors: [{ message: message('THREE', 3) }] },
    { code: 'const N_5 = 5;', errors: [{ message: message('N_5', 5) }] },
    { code: 'const NUMBER_100 = 100;', errors: [{ message: message('NUMBER_100', 100) }] },
    { code: 'const HUNDRED = 100;', errors: [{ message: message('HUNDRED', 100) }] },
    { code: 'const ONE_HUNDRED_AND_FIVE = 105;', errors: [{ message: message('ONE_HUNDRED_AND_FIVE', 105) }] },
    { code: 'const TWENTY_FIVE = 25;', errors: [{ message: message('TWENTY_FIVE', 25) }] },
    { code: 'const MINUS_ONE = -1;', errors: [{ message: message('MINUS_ONE', -1) }] },
    { code: 'const HALF = 0.5, ZERO_POINT_FIVE = 0.5;', errors: [{ message: message('ZERO_POINT_FIVE', 0.5) }] },
    { code: 'class Poller { static FIVE_THOUSAND = 5000; }', errors: [{ message: message('FIVE_THOUSAND', 5000) }] },
    {
      code: 'const SIXTY = 60;',
      options: [{ hint: 'See docs/constants.md.' }],
      errors: [{ message: `${message('SIXTY', 60).slice(0, -1)}. See docs/constants.md.` }],
    },
  ],
});

new RuleTester({ languageOptions: { parser: tseslint.parser } }).run('no-self-named-constant (TypeScript)', rule, {
  valid: ['enum Timeout { Request = 10000 }'],
  invalid: [{ code: 'enum Size { Ten = 10 }', errors: [{ message: message('Ten', 10) }] }],
});
