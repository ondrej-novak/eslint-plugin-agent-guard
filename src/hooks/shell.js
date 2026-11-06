const POSIX = { escape: '\\', runsBackticks: true };
const POWERSHELL = { escape: '`', runsBackticks: false };

/** A backslash escapes in Bash and separates paths in PowerShell, so the two cannot share one reading. */
export const DIALECTS = { Bash: POSIX, PowerShell: POWERSHELL };

const REDIRECT = /&>>?|<<<|<<-?|<>|<&|>>|>\||>&|<|>/y;
const OPERATOR = /\|\||\|&|\||&&|;;?|&/y;
const PIPE = /^\|&?$/;
const HERE_STRING_START = /@(['"])[ \t]*\n/y;
const FILE_DESCRIPTOR = /^[\d*]+$/;
const ESCAPED_IN_QUOTES = new Set(['"', '\\', '$', '`']);
const NESTED_SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'fish', 'eval', 'pwsh', 'powershell', 'cmd', 'iex', 'invoke-expression']);
const TEXT_COMMANDS = new Set(['echo', 'printf', 'grep', 'egrep', 'fgrep', 'rg', 'ag', 'ack', 'sls', 'select-string', 'findstr', 'write-output', 'write-host']);

const newPipeline = () => ({ commands: [[]], targets: [], inputs: [], bodies: [], heredocs: [] });

function matchAt(pattern, { text, at }) {
  pattern.lastIndex = at;
  return pattern.exec(text)?.[0];
}

function append(level, text) {
  level.word = (level.word ?? '') + text;
}

function endWord(level) {
  const { word, redirect, pipeline } = level;
  if (word === undefined) return;
  level.word = undefined;
  level.redirect = undefined;
  (redirect ? pipeline[redirect] : pipeline.commands.at(-1)).push(word);
}

function endPipeline(reader, level) {
  endWord(level);
  const { pipeline } = level;
  pipeline.commands = pipeline.commands.filter((words) => words.length > 0);
  if (pipeline.commands.length > 0 || pipeline.targets.length > 0) reader.pipelines.push(pipeline);
  level.pipeline = newPipeline();
}

function heredocBody(reader, delimiter) {
  const { text } = reader;
  const start = reader.at;
  while (reader.at < text.length) {
    const lineStart = reader.at;
    const newline = text.indexOf('\n', lineStart);
    const lineEnd = newline < 0 ? text.length : newline;
    reader.at = lineEnd + 1;
    if (text.slice(lineStart, lineEnd).trim() === delimiter) return text.slice(start, lineStart);
  }
  return text.slice(start);
}

function readNewline(reader, level) {
  if (reader.text[reader.at] !== '\n') return false;
  reader.at += 1;
  endWord(level);
  const { bodies, heredocs } = level.pipeline;
  heredocs.forEach((delimiter) => bodies.push(heredocBody(reader, delimiter)));
  endPipeline(reader, level);
  return true;
}

function readBlank(reader, level) {
  if (!' \t\r'.includes(reader.text[reader.at])) return false;
  reader.at += 1;
  endWord(level);
  return true;
}

/** Skipped rather than read, because an apostrophe in a comment would open a quote that swallows the next lines. */
function readComment(reader, level) {
  if (reader.text[reader.at] !== '#' || level.word !== undefined) return false;
  const newline = reader.text.indexOf('\n', reader.at);
  reader.at = newline < 0 ? reader.text.length : newline;
  return true;
}

/** A backslash before a letter stays, so a Windows path typed in Git Bash still reads as that path. */
function readEscape(reader, level) {
  const { text, at, dialect } = reader;
  if (text[at] !== dialect.escape) return false;
  const next = text[at + 1];
  reader.at += 2;
  if (next === undefined || next === '\n') return true;
  append(level, dialect === POSIX && /\w/.test(next) ? `${dialect.escape}${next}` : next);
  return true;
}

function readSingleQuoted(reader, level) {
  const { text, at } = reader;
  if (text[at] !== "'") return false;
  const close = text.indexOf("'", at + 1);
  append(level, text.slice(at + 1, close < 0 ? undefined : close));
  reader.at = close < 0 ? text.length : close + 1;
  return true;
}

function unescapedInQuotes(escape, next) {
  if (next === undefined || next === '\n') return '';
  return ESCAPED_IN_QUOTES.has(next) ? next : `${escape}${next}`;
}

function quotedPart(reader) {
  const { text, at, dialect } = reader;
  const char = text[at];
  if (char === dialect.escape) {
    reader.at += 2;
    return unescapedInQuotes(char, text[at + 1]);
  }
  if (char === '$' && text[at + 1] === '(') {
    reader.at += 1;
    return `$${nestedText(reader, ')')}`;
  }
  if (char === '`' && dialect.runsBackticks) return nestedText(reader, '`');
  reader.at += 1;
  return char;
}

function readDoubleQuoted(reader, level) {
  if (reader.text[reader.at] !== '"') return false;
  reader.at += 1;
  append(level, '');
  while (reader.at < reader.text.length && reader.text[reader.at] !== '"') append(level, quotedPart(reader));
  reader.at += 1;
  return true;
}

/** PowerShell's `@'...'@` holds apostrophes and newlines that would otherwise read as quotes and new commands. */
function readHereString(reader, level) {
  const opening = reader.dialect === POWERSHELL && matchAt(HERE_STRING_START, reader);
  if (!opening) return false;
  const close = `\n${opening[1]}@`;
  const bodyStart = reader.at + opening.length;
  const end = reader.text.indexOf(close, bodyStart - 1);
  append(level, reader.text.slice(bodyStart, end < 0 ? undefined : end));
  reader.at = end < 0 ? reader.text.length : end + close.length;
  return true;
}

/** Commands inside `$(...)`, `(...)` or backticks are read as commands too; the outer word keeps the raw text. */
function nestedText(reader, closer) {
  const start = reader.at;
  reader.at += 1;
  readLevel(reader, closer);
  return reader.text.slice(start, reader.at);
}

function readNested(reader, level) {
  const char = reader.text[reader.at];
  const opensBacktick = char === '`' && reader.dialect.runsBackticks;
  if (char !== '(' && !opensBacktick) return false;
  append(level, nestedText(reader, opensBacktick ? '`' : ')'));
  return true;
}

function redirectKind(symbol) {
  if (symbol === '<<<') return 'bodies';
  if (symbol.startsWith('<<')) return 'heredocs';
  return symbol.startsWith('<') ? 'inputs' : 'targets';
}

function readRedirect(reader, level) {
  const symbol = matchAt(REDIRECT, reader);
  if (!symbol) return false;
  if (FILE_DESCRIPTOR.test(level.word ?? '')) level.word = undefined;
  endWord(level);
  level.redirect = redirectKind(symbol);
  reader.at += symbol.length;
  return true;
}

function readOperator(reader, level) {
  const symbol = matchAt(OPERATOR, reader);
  if (!symbol) return false;
  reader.at += symbol.length;
  if (PIPE.test(symbol)) {
    endWord(level);
    level.pipeline.commands.push([]);
  } else {
    endPipeline(reader, level);
  }
  return true;
}

function readPlainCharacter(reader, level) {
  append(level, reader.text[reader.at]);
  reader.at += 1;
  return true;
}

const TOKEN_READERS = [readNewline, readBlank, readComment, readEscape, readSingleQuoted, readDoubleQuoted, readHereString, readNested, readRedirect, readOperator, readPlainCharacter];

function readLevel(reader, closer) {
  const level = { pipeline: newPipeline(), word: undefined, redirect: undefined };
  while (reader.at < reader.text.length) {
    if (reader.text[reader.at] === closer) {
      reader.at += 1;
      break;
    }
    TOKEN_READERS.some((read) => read(reader, level));
  }
  endPipeline(reader, level);
}

/** "/usr/bin/GIT.exe" is the same command as "git": executable names ignore case on Windows and in PowerShell. */
export function commandName(word) {
  return word.split(/[\\/]/).at(-1).toLowerCase().replace(/\.(?:exe|cmd)$/, '');
}

/** These only print, so a flag or a file name among their arguments is being searched for or shown, not used. */
export function isTextCommand(words) {
  return TEXT_COMMANDS.has(commandName(words[0]));
}

function insideNestedShell(pipeline, dialect) {
  const words = pipeline.commands.flat();
  if (!words.some((word) => NESTED_SHELLS.has(commandName(word)))) return [];
  return [...words, ...pipeline.bodies].filter((word) => /\s/.test(word)).flatMap((word) => parseShell(word, dialect));
}

/**
 * Reads a command the way the shell will, so checks see real words: a message in quotes is one word, a flag after a
 * redirect still belongs to its command, and a `>` inside a string is no redirect. Returns one entry per pipeline,
 * each with the words of its commands and its redirect targets. Not a full grammar: what it cannot follow stays text.
 */
export function parseShell(command, dialect = POSIX) {
  const reader = { text: command.replaceAll('\r\n', '\n'), at: 0, dialect, pipelines: [] };
  readLevel(reader);
  return reader.pipelines.flatMap((pipeline) => [pipeline, ...insideNestedShell(pipeline, dialect)]);
}
