import js from '@eslint/js';
import agentGuard from './src/index.js';

export default [
  { ignores: ['test/fixtures/**', 'examples/**', 'coverage/**'] },
  js.configs.recommended,
  {
    languageOptions: { globals: { process: 'readonly', Buffer: 'readonly' } },
  },
  ...agentGuard.configs.recommended,
];
