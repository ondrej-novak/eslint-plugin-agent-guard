export const ruleName = 'agent-guard/no-body-comments';

const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

/** Comments that bundlers, coverage tools and formatters act on. Deleting one changes the output, so it is not narration. */
const TOOL_DIRECTIVES = [
  /^[#@]__(?:PURE|NO_SIDE_EFFECTS|INLINE|NOINLINE|KEY|MANGLE_PROP)__$/,
  /^webpack[A-Z]\w*\s*:/,
  /^@vite-ignore$/,
  /^(?:istanbul|c8|v8) ignore\b/,
  /^node:coverage (?:ignore|disable|enable)\b/,
  /^prettier-ignore$/,
];

function enclosingFunctionBody(sourceCode, comment) {
  let node = sourceCode.getNodeByRangeIndex(comment.range[0]);
  while (node) {
    if (FUNCTION_TYPES.has(node.type) && node.body.range[0] <= comment.range[0] && comment.range[1] <= node.body.range[1]) return node.body;
    node = node.parent;
  }
  return undefined;
}

/**
 * Agents narrate: `// download the file` above the line that downloads the file. Comments inside a
 * function body are where that happens, and where `eslint-disable-next-line` hides. JSDoc and other
 * comments outside function bodies stay allowed, because that is where the why belongs.
 */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow comments inside function bodies',
      url: 'https://github.com/ondrej-novak/eslint-plugin-agent-guard#no-body-comments',
    },
    schema: [
      {
        type: 'object',
        properties: { allow: { type: 'array', items: { type: 'string' } }, hint: { type: 'string' } },
        additionalProperties: false,
      },
    ],
    messages: {
      bodyComment: 'Comment inside a function body. Make the code say it instead: rename, or extract a well-named function. Put the why in JSDoc above the declaration.{{hint}}',
    },
  },
  create(context) {
    const { allow = [], hint } = context.options[0] ?? {};
    const allowed = [...TOOL_DIRECTIVES, ...allow.map((pattern) => new RegExp(pattern, 'u'))];
    const { sourceCode } = context;
    return {
      'Program:exit'() {
        for (const comment of sourceCode.getAllComments()) {
          if (comment.type === 'Shebang') continue;
          if (allowed.some((pattern) => pattern.test(comment.value.trim()))) continue;
          if (!enclosingFunctionBody(sourceCode, comment)) continue;
          context.report({ loc: comment.loc, messageId: 'bodyComment', data: { hint: hint ? ` ${hint}` : '' } });
        }
      },
    };
  },
};
