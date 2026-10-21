import rule from '../src/rules/no-body-comments.js';
import { ruleTester } from './rule-tester.js';

const message =
  'Comment inside a function body. Make the code say it instead: rename, or extract a well-named function. Put the why in JSDoc above the declaration.';

ruleTester.run('no-body-comments', rule, {
  valid: [
    '/** Downloads the file, retrying once on a timeout. */\nfunction download() { return fetch(url); }',
    '// module notes\nconst a = 1;',
    'class A {\n  /** Why this exists. */\n  run() { return 1; }\n}',
    { code: 'function f() {\n  // @ts-expect-error upstream types are wrong\n  return g();\n}', options: [{ allow: ['^@ts-expect-error '] }] },
  ],
  invalid: [
    { code: 'function f() {\n  // download the file\n  return fetch(url);\n}', errors: [{ message, line: 2 }] },
    { code: 'const f = () => {\n  /* eslint-disable-next-line */\n  run();\n};', errors: [{ message }] },
    { code: 'class A { run() { /* narrate */ } }', errors: [{ message }] },
    { code: 'function f() {}\nconst g = function () { /* a */ return 1; };', errors: [{ message, line: 2 }] },
    { code: 'function f() { /* a */ }', options: [{ hint: 'See CONTRIBUTING.md.' }], errors: [{ message: `${message} See CONTRIBUTING.md.` }] },
  ],
});
