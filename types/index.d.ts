import type { ESLint, Linter, Rule } from 'eslint';

/** Flat config presets. Each is an array: pass it to `extends`, or spread it into your config. */
export type AgentGuardConfigs = {
  recommended: Linter.Config[];
  react: Linter.Config[];
  angular: Linter.Config[];
};

declare const plugin: Omit<ESLint.Plugin, 'configs'> & { configs: AgentGuardConfigs };
export default plugin;

/**
 * Wraps an existing ESLint rule so its options accept a `hint`, which is appended to every message.
 * Takes any rule shape, because core rules and typescript-eslint rules are typed differently, and returns
 * an ESLint rule, so the result fits a plugin in `defineConfig`.
 */
export declare function withHint(rule: { meta?: object; create(context: never): unknown }): Rule.RuleModule;
