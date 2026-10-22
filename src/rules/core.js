import { builtinRules } from 'eslint/use-at-your-own-risk';
import { withHint } from '../with-hint.js';

function core(name) {
  const rule = builtinRules.get(name);
  if (!rule) throw new Error(`ESLint does not ship a "${name}" rule.`);
  return withHint(rule);
}

export const maxLines = core('max-lines');
export const maxLinesPerFunction = core('max-lines-per-function');
export const maxParams = core('max-params');
export const noMagicNumbers = core('no-magic-numbers');
