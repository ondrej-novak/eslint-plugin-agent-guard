const SHELL_SEPARATORS = /[\n;|&]+/;
const WORD = /(?:"[^"]*"|'[^']*'|[^\s"'])+/g;
const GIT_COMMIT = /\bgit(?:\s+(?:-[cC]\s+\S+|-\S+))*\s+commit\b(.*)/;

/** git commit's short options that take a value: attached in `-mfix`, or the next word after a bare `-m`. */
const VALUE_OPTIONS = new Set(['m', 'F', 'C', 'c', 't']);

/** Options whose value can only be attached, as in `-uno` or `-Skeyid`. */
const ATTACHED_VALUE_OPTIONS = new Set(['u', 'S']);

/** Setting, unsetting or overriding core.hooksPath turns hooks off; reading it does not. */
const HOOKS_PATH_CHANGE =
  /\bcore\.hooksPath\s*=|\bconfig\b[^|;&\n]*\bcore\.hooksPath\s+[^\s|;&-]|\bconfig\b[^|;&\n]*(?:--unset(?:-all)?|\b(?:set|unset)\b)[^|;&\n]*\bcore\.hooksPath\b/i;

function readCluster(cluster) {
  for (const [index, letter] of [...cluster.slice(1)].entries()) {
    if (letter === 'n') return { noVerify: true };
    if (VALUE_OPTIONS.has(letter)) return { takesNext: index === cluster.length - 2 };
    if (ATTACHED_VALUE_OPTIONS.has(letter)) return {};
  }
  return {};
}

function commitArgumentsSkipHooks(args) {
  const words = args.match(WORD) ?? [];
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    if (word === '--' || /^[<>]/.test(word)) return false;
    if (!/^-[^-]/.test(word)) continue;
    const { noVerify, takesNext } = readCluster(word);
    if (noVerify) return true;
    if (takesNext) index += 1;
  }
  return false;
}

/**
 * Whether a shell command skips git hooks through `git commit -n` (short for --no-verify) or core.hooksPath.
 * Options are read word by word, so `-minitial`, `-uno`, `git log -n 1` and `-n` inside a message pass.
 */
export function skipsGitHooks(command) {
  if (HOOKS_PATH_CHANGE.test(command)) return true;
  return command.split(SHELL_SEPARATORS).some((segment) => {
    const args = GIT_COMMIT.exec(segment)?.[1];
    return args !== undefined && commitArgumentsSkipHooks(args);
  });
}
