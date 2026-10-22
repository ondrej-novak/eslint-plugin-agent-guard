const HINT_PROPERTY = { hint: { type: 'string' } };

/**
 * Adds `hint` to every object form a rule's first option accepts, so `['error', { max: 50, hint: '…' }]`
 * validates for a rule that knows nothing about hints.
 */
function addHint(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema.oneOf)) return { ...schema, oneOf: schema.oneOf.map(addHint) };
  if (Array.isArray(schema.anyOf)) return { ...schema, anyOf: schema.anyOf.map(addHint) };
  if (schema.type !== 'object') return schema;
  return { ...schema, properties: { ...schema.properties, ...HINT_PROPERTY } };
}

function extendSchema(schema) {
  if (!Array.isArray(schema) || schema.length === 0) return [{ type: 'object', properties: HINT_PROPERTY, additionalProperties: false }];
  const [first, ...rest] = schema;
  return [addHint(first), ...rest];
}

/** Takes `hint` out of the first option, so the wrapped rule sees exactly the options it defines. */
function splitOptions(options) {
  const [first, ...rest] = options;
  if (!first || typeof first !== 'object' || !('hint' in first)) return { forwarded: options, hint: undefined };
  const { hint, ...kept } = first;
  const keptEmpty = Object.keys(kept).length === 0;
  return { forwarded: keptEmpty && rest.length === 0 ? [] : [kept, ...rest], hint };
}

function withHintText(descriptor, { messages, hint }) {
  if (!hint) return descriptor;
  const template = descriptor.message ?? messages?.[descriptor.messageId];
  if (template === undefined) return descriptor;
  const withMessage = { ...descriptor, message: `${template} ${hint}` };
  delete withMessage.messageId;
  return withMessage;
}

/**
 * Wraps an existing ESLint rule so its options accept a `hint`, which is appended to every message.
 * The hint is the part an agent acts on: "Maximum allowed is 50" says what is wrong, the hint says
 * where the fix goes. Works for core rules and for plugin rules such as `@typescript-eslint/max-params`.
 */
export function withHint(rule) {
  return {
    ...rule,
    meta: { ...rule.meta, schema: extendSchema(rule.meta.schema) },
    create(context) {
      const { forwarded, hint } = splitOptions(context.options);
      const messages = rule.meta.messages;
      const proxy = Object.create(context, {
        options: { value: forwarded },
        report: { value: (descriptor) => context.report(withHintText(descriptor, { messages, hint })) },
      });
      return rule.create(proxy);
    },
  };
}
