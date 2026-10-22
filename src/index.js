import { createRequire } from 'node:module';
import { buildConfigs } from './configs.js';
import { maxLines, maxLinesPerFunction, maxParams, noMagicNumbers } from './rules/core.js';
import noBodyComments from './rules/no-body-comments.js';
import noSelfNamedConstant from './rules/no-self-named-constant.js';

const { name, version } = createRequire(import.meta.url)('../package.json');

const plugin = {
  meta: { name, version, namespace: 'agent-guard' },
  rules: {
    'max-lines': maxLines,
    'max-lines-per-function': maxLinesPerFunction,
    'max-params': maxParams,
    'no-magic-numbers': noMagicNumbers,
    'no-self-named-constant': noSelfNamedConstant,
    'no-body-comments': noBodyComments,
  },
};

plugin.configs = buildConfigs(plugin);

export { withHint } from './with-hint.js';
export default plugin;
