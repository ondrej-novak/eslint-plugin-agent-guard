import { defineConfig } from 'eslint/config';
import { builtinRules } from 'eslint/use-at-your-own-risk';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import agentGuard, { withHint } from 'eslint-plugin-agent-guard';

const local = { rules: { 'no-explicit-any': withHint(tsPlugin.rules['no-explicit-any']) } };

const maxParams = builtinRules.get('max-params');
export const wrappedCoreRule = maxParams && withHint(maxParams);

export default defineConfig(
  { files: ['**/*.{js,jsx,ts,tsx}'], extends: [agentGuard.configs.recommended] },
  { files: ['**/*.tsx'], extends: [agentGuard.configs.react] },
  { plugins: { local } },
  { rules: { 'agent-guard/max-params': ['error', { max: 3, hint: 'Pass one object.' }] } },
);

// @ts-expect-error the presets are recommended, react and angular
export const unknownPreset = agentGuard.configs.strict;
