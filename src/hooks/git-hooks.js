import { commandName, isTextCommand } from './shell.js';

/** git commit's short options that take a value: attached in `-mfix`, or the next word after a bare `-m`. */
const VALUE_OPTIONS = new Set(['m', 'F', 'C', 'c', 't']);

/** Options whose value can only be attached, as in `-uno` or `-Skeyid`. */
const ATTACHED_VALUE_OPTIONS = new Set(['u', 'S']);

/** With these the next word is a value, so `--message -n` is a message and not a flag. */
const LONG_VALUE_OPTIONS = new Set(['--message', '--file', '--author', '--date', '--reuse-message', '--reedit-message', '--fixup', '--squash', '--template', '--cleanup', '--trailer', '--pathspec-from-file']);

/** git's own options before the subcommand whose value is the next word, as in `git -C app commit`. */
const GLOBAL_VALUE_OPTIONS = new Set(['-c', '-C', '--git-dir', '--work-tree', '--namespace', '--config-env', '--super-prefix']);

/** git accepts any unambiguous prefix of a long option, and `--no-veri` is the shortest for --no-verify. */
const NO_VERIFY = /^--no-veri(?:fy?)?$/;

const SKIPPING_WORD = /^(?:--no-veri(?:fy?)?|--no-config-lookup|HUSKY=0|core\.hooksPath=.*)$/is;

/** A flag kept in a variable reaches the command that expands it, so the assignment counts as using it. */
const SKIPPING_ASSIGNMENT = /^\$?\w+=.*(?:--no-verify|--no-config-lookup)/is;

const POWERSHELL_HUSKY = /\$env:HUSKY\s*=\s*0(?:\s|$)/i;

const CONFIG_READS = new Set(['--get', '--get-all', '--get-regexp', '--get-urlmatch', 'get', '--list', '-l', 'list']);
const CONFIG_UNSETS = new Set(['--unset', '--unset-all', 'unset']);

function gitSubcommand(words) {
  const git = words.findIndex((word) => commandName(word) === 'git');
  if (git < 0) return undefined;
  let index = git + 1;
  while (words[index]?.startsWith('-')) index += GLOBAL_VALUE_OPTIONS.has(words[index]) ? 2 : 1;
  if (index >= words.length) return undefined;
  return { name: words[index], before: words.slice(0, index), args: words.slice(index + 1) };
}

function readCluster(cluster) {
  for (const [index, letter] of [...cluster.slice(1)].entries()) {
    if (letter === 'n') return { noVerify: true };
    if (VALUE_OPTIONS.has(letter)) return { takesNext: index === cluster.length - 2 };
    if (ATTACHED_VALUE_OPTIONS.has(letter)) return {};
  }
  return {};
}

function commitArgumentsSkipHooks(args) {
  for (let index = 0; index < args.length; index += 1) {
    const word = args[index];
    if (word === '--') return false;
    if (NO_VERIFY.test(word)) return true;
    if (LONG_VALUE_OPTIONS.has(word)) index += 1;
    else if (/^-[^-]/.test(word)) {
      const { noVerify, takesNext } = readCluster(word);
      if (noVerify) return true;
      if (takesNext) index += 1;
    }
  }
  return false;
}

/** Setting, unsetting or overriding core.hooksPath turns hooks off; reading it does not. */
function configChangesHooksPath(args) {
  const key = args.findIndex((word) => word.toLowerCase() === 'core.hookspath');
  if (key < 0 || args.some((word) => CONFIG_READS.has(word))) return false;
  const value = args[key + 1];
  return args.some((word) => CONFIG_UNSETS.has(word)) || (value !== undefined && !value.startsWith('-'));
}

function namesSkippingFlag(words) {
  return words.some((word) => SKIPPING_WORD.test(word) || SKIPPING_ASSIGNMENT.test(word)) || POWERSHELL_HUSKY.test(words.join(' '));
}

/**
 * Whether one command skips git hooks or the lint config. Options of `git commit` are read one by one, so `-minitial`,
 * `-uno` and a message that mentions a flag pass, and `git log -n 1` is not a commit.
 */
export function skipsChecks(words) {
  if (isTextCommand(words)) return false;
  const git = gitSubcommand(words);
  if (git?.name === 'commit') return namesSkippingFlag(git.before) || commitArgumentsSkipHooks(git.args);
  if (git?.name === 'config' && configChangesHooksPath(git.args)) return true;
  return namesSkippingFlag(words);
}
