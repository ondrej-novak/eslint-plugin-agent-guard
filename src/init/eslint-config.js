import { readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const FLAT_CONFIG = /^eslint\.config\.[cm]?[jt]s$/i;
const LEGACY_CONFIG = /^\.eslintrc(\.\w+)?$/i;
const SCRIPT_FILES = '**/*.{js,jsx,mjs,cjs}';
const TYPED_FILES = '**/*.{ts,tsx,mts,cts}';
const ALL_FILES = '**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}';

function presetFor(has) {
  if (has('@angular/core')) return 'angular';
  return has('react') ? 'react' : 'recommended';
}

/** What the generated config depends on: the preset, whether TypeScript needs its parser, and the module format. */
export function describeProject(packageJson) {
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies, ...packageJson.peerDependencies };
  const has = (name) => Object.hasOwn(dependencies, name);
  return { preset: presetFor(has), typescript: has('typescript'), isModule: packageJson.type === 'module' };
}

export function existingConfig(dir) {
  return readdirSync(dir).find((name) => FLAT_CONFIG.test(name) || LEGACY_CONFIG.test(name));
}

function configSource({ preset, typescript }) {
  return [
    "import { defineConfig, globalIgnores } from 'eslint/config';",
    ...(typescript ? ["import tseslint from 'typescript-eslint';"] : []),
    "import agentGuard from 'eslint-plugin-agent-guard';",
    '',
    'export default defineConfig(',
    "  globalIgnores(['dist/', 'build/', 'coverage/']),",
    ...(typescript ? [`  { files: ['${TYPED_FILES}'], languageOptions: { parser: tseslint.parser } },`] : []),
    `  { files: ['${typescript ? ALL_FILES : SCRIPT_FILES}'], extends: [agentGuard.configs.${preset}] },`,
    ');',
    '',
  ].join('\n');
}

function keptMessage(name, preset) {
  const entry = `{ files: ['${ALL_FILES}'], extends: [agentGuard.configs.${preset}] }`;
  if (LEGACY_CONFIG.test(name)) return `${name} was left alone. ESLint 9 and later ignore it: move it to a flat eslint.config.js and add ${entry} there.`;
  return `${name} was left alone. Import agentGuard from 'eslint-plugin-agent-guard' and add ${entry} to it.`;
}

/** Writes a flat config only where there is none, because rewriting a project's config would undo its own choices. */
export function writeEslintConfig({ dir, project }) {
  const existing = existingConfig(dir);
  if (existing) return keptMessage(existing, project.preset);
  const name = project.isModule ? 'eslint.config.js' : 'eslint.config.mjs';
  writeFileSync(path.join(dir, name), configSource(project));
  return `created ${name} with the ${project.preset} preset`;
}
