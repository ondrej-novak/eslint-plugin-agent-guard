import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import agentGuard from 'eslint-plugin-agent-guard';

export default defineConfig(
  { ignores: ['dist/**'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  { files: ['**/*.{js,jsx,ts,tsx}'], extends: [agentGuard.configs.react] },
);
