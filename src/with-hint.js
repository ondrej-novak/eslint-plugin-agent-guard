const HINT_PROPERTY = { hint: { type: 'string' } };
const HINT_ONLY_OPTION = { type: 'object', properties: HINT_PROPERTY, additionalProperties: false };

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

function addHintToFirst([first, ...rest]) {
  return [addHint(first), ...rest];
}

/**
 * A `meta.schema` object describes the whole options array, so `hint` goes into the schema of its first item.
 * A list (`items: {…}`) becomes a tuple, so later items stay as strict as before.
 */
function addHintToOptionsArray(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema.oneOf)) return { ...schema, oneOf: schema.oneOf.map(addHintToOptionsArray) };
  if (Array.isArray(schema.anyOf)) return { ...schema, anyOf: schema.anyOf.map(addHintToOptionsArray) };
  const { items } = schema;
  if (Array.isArray(items)) return items.length === 0 ? schema : { ...schema, items: addHintToFirst(items) };
  if (items && typeof items === 'object') return { ...schema, items: [addHint(items)], additionalItems: items };
  return schema;
}

/** `schema: false` passes through: it switches validation off, and a hint-only schema would turn it back on. */
function extendSchema(schema) {
  if (schema === undefined || (Array.isArray(schema) && schema.length === 0)) return [HINT_ONLY_OPTION];
  return Array.isArray(schema) ? addHintToFirst(schema) : addHintToOptionsArray(schema);
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
