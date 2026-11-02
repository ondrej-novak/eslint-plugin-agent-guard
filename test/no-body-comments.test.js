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
    'function f() { return /*#__PURE__*/ create(); }',
    'function f() { return /* @__PURE__ */ create(); }',
    'function setup() {\n  const make = /* #__NO_SIDE_EFFECTS__ */ () => build();\n  return make;\n}',
    "function load() { return import(/* webpackChunkName: \"chart\" */ './chart.js'); }",
    'function load(name) { return import(/* @vite-ignore */ name); }',
    'function f() {\n  /* istanbul ignore next */\n  if (debug) log();\n}',
    'function f() {\n  /* c8 ignore next */\n  if (debug) log();\n}',
    'function f() {\n  // prettier-ignore\n  const identity = [1,0, 0,1];\n  return identity;\n}',
  ],
  invalid: [
    { code: 'function f() {\n  // download the file\n  return fetch(url);\n}', errors: [{ message, line: 2 }] },
    { code: 'const f = () => {\n  /* eslint-disable-next-line */\n  run();\n};', errors: [{ message }] },
    { code: 'class A { run() { /* narrate */ } }', errors: [{ message }] },
    { code: 'function f() {}\nconst g = function () { /* a */ return 1; };', errors: [{ message, line: 2 }] },
    { code: 'function f() { /* a */ }', options: [{ hint: 'See CONTRIBUTING.md.' }], errors: [{ message: `${message} See CONTRIBUTING.md.` }] },
    { code: 'function f() {\n  // webpack inlines this\n  return load();\n}', errors: [{ message, line: 2 }] },
  ],
});
