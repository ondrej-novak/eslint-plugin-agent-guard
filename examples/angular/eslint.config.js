import { defineConfig } from 'eslint/config';
import angular from 'angular-eslint';
import tseslint from 'typescript-eslint';
import agentGuard from 'eslint-plugin-agent-guard';

export default defineConfig(
  { ignores: ['dist/**', '.angular/**'] },
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.recommended, angular.configs.tsRecommended, agentGuard.configs.angular],
    processor: angular.processInlineTemplates,
  },
  { files: ['**/*.html'], extends: [angular.configs.templateRecommended] },
);
