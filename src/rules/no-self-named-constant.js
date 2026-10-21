import { normaliseName, selfNames } from '../number-names.js';

export const ruleName = 'agent-guard/no-self-named-constant';

function numericValue(node) {
  if (node?.type === 'Literal' && typeof node.value === 'number') return node.value;
  if (node?.type === 'UnaryExpression' && node.operator === '-' && node.argument.type === 'Literal' && typeof node.argument.value === 'number') {
    return -node.argument.value;
  }
  return undefined;
}

function keyName(node) {
  if (node?.type === 'Identifier') return node.name;
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  return undefined;
}

/**
 * `no-magic-numbers` asks for a named constant, and the quickest way to satisfy it is a name that only
 * repeats the number: `const TEN_THOUSAND = 10000`. That passes the rule and tells the reader nothing.
 * This rule rejects constants, class fields and enum members whose name is just their value.
 */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow constants whose name only restates their numeric value',
      url: 'https://github.com/ondrej-novak/eslint-plugin-agent-guard#no-self-named-constant',
    },
    schema: [{ type: 'object', properties: { hint: { type: 'string' } }, additionalProperties: false }],
    messages: {
      selfNamed: '"{{name}}" only restates its value {{value}}. Name it after what the number means, for example REQUEST_TIMEOUT_MS or MAX_RETRY_ATTEMPTS.{{hint}}',
    },
  },
  create(context) {
    const hint = context.options[0]?.hint;
    const check = (keyNode, valueNode) => {
      const name = keyName(keyNode);
      const value = numericValue(valueNode);
      if (name === undefined || value === undefined) return;
      if (!selfNames(value).has(normaliseName(name))) return;
      context.report({ node: keyNode, messageId: 'selfNamed', data: { name, value: String(value), hint: hint ? ` ${hint}` : '' } });
    };
    return {
      VariableDeclarator: (node) => check(node.id, node.init),
      PropertyDefinition: (node) => check(node.key, node.value),
      TSEnumMember: (node) => check(node.id, node.initializer),
    };
  },
};
