export const HINTS = {
  maxLines: 'Split the file by responsibility into separate modules.',
  maxLinesPerFunction: 'Extract the steps into small, well-named functions.',
  maxParams: 'Pass one typed object and destructure it.',
  noMagicNumbers: 'Move it to a named constant, for example REQUEST_TIMEOUT_MS, at the top of the module or in a *.constants file.',
};

const LIMITS = { fileLines: 250, functionLines: 50, params: 2 };

const TEST_FILES = ['**/*.{spec,test}.{js,jsx,mjs,cjs,ts,tsx,mts,cts}', '**/{test,tests,__tests__,e2e}/**'];

function coreRules() {
  return {
    'agent-guard/max-lines': ['error', { max: LIMITS.fileLines, skipBlankLines: true, skipComments: true, hint: HINTS.maxLines }],
    'agent-guard/max-lines-per-function': ['error', { max: LIMITS.functionLines, skipBlankLines: true, skipComments: true, hint: HINTS.maxLinesPerFunction }],
    'agent-guard/max-params': ['error', { max: LIMITS.params, hint: HINTS.maxParams }],
    'agent-guard/no-magic-numbers': [
      'error',
      {
        ignore: [-1, 0, 1, 2],
        ignoreArrayIndexes: true,
        ignoreDefaultValues: true,
        enforceConst: true,
        ignoreEnums: true,
        ignoreNumericLiteralTypes: true,
        ignoreReadonlyClassProperties: true,
        ignoreTypeIndexes: true,
        hint: HINTS.noMagicNumbers,
      },
    ],
    'agent-guard/no-self-named-constant': 'error',
    'agent-guard/no-body-comments': 'error',
  };
}

function testOverrides() {
  return {
    name: 'agent-guard/tests',
    files: TEST_FILES,
    rules: {
      'agent-guard/max-lines': 'off',
      'agent-guard/max-lines-per-function': 'off',
      'agent-guard/no-magic-numbers': 'off',
    },
  };
}

function base({ plugin, name }) {
  return {
    name,
    plugins: { 'agent-guard': plugin },
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' },
    rules: coreRules(),
  };
}

const JSX_PARSING = {
  name: 'agent-guard/react-jsx',
  files: ['**/*.{js,jsx,mjs,cjs}'],
  languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
};

const ANGULAR_ENVIRONMENT_BAN = {
  name: 'agent-guard/angular-environment',
  files: ['**/*.ts'],
  ignores: ['**/main.ts', '**/main.server.ts', '**/app.config*.ts', '**/environments/**'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['**/environments/environment*'],
            message: 'Read configuration through an InjectionToken provided in app.config.ts, not by importing environment directly.',
          },
        ],
      },
    ],
  },
};

/** Flat config presets. Each is an array, so spread it into your eslint.config.js. */
export function buildConfigs(plugin) {
  return {
    recommended: [base({ plugin, name: 'agent-guard/recommended' }), testOverrides()],
    react: [base({ plugin, name: 'agent-guard/react' }), JSX_PARSING, testOverrides()],
    angular: [base({ plugin, name: 'agent-guard/angular' }), testOverrides(), ANGULAR_ENVIRONMENT_BAN],
  };
}
