const FILE_HEADER = /^\*\*\* (Add|Update|Delete) File: (.+)$/;
const MOVE_HEADER = /^\*\*\* Move to: (.+)$/;
const HUNK_HEADER = /^@@/;
const PATCH_END = '*** End Patch';

/** An empty line inside a hunk is an empty context line, so it belongs to both sides. */
const SIDES = { ' ': ['old', 'new'], '-': ['old'], '+': ['new'] };

function addLine(file, line) {
  if (line.startsWith('***')) return;
  const startsHunk = HUNK_HEADER.test(line);
  if (startsHunk || file.hunks.length === 0) file.hunks.push({ old: [], new: [] });
  if (startsHunk) return;
  const hunk = file.hunks.at(-1);
  (SIDES[line[0] ?? ' '] ?? []).forEach((side) => hunk[side].push(line.slice(1)));
}

function readLine(files, line) {
  const header = FILE_HEADER.exec(line);
  if (header) {
    files.push({ action: header[1].toLowerCase(), filePath: header[2].trim(), hunks: [] });
    return;
  }
  const file = files.at(-1);
  if (!file) return;
  const move = MOVE_HEADER.exec(line);
  if (move) file.moveTo = move[1].trim();
  else addLine(file, line);
}

/** Reads a Codex `apply_patch` body into one entry per file: add, update or delete, where it moves, and its hunks. */
export function parsePatch(text) {
  const lines = text.replaceAll('\r\n', '\n').split('\n');
  const end = lines.indexOf(PATCH_END);
  const files = [];
  lines.slice(0, end < 0 ? undefined : end).forEach((line) => readLine(files, line));
  return files;
}

const joinLines = (lines) => lines.join('\n');
const removal = (filePath) => ({ tool_name: 'Write', tool_input: { file_path: filePath, content: '' } });

function toToolCalls({ action, filePath, moveTo, hunks }) {
  if (action === 'delete') return [removal(filePath)];
  if (action === 'add') return [{ tool_name: 'Write', tool_input: { file_path: filePath, content: joinLines(hunks.flatMap((hunk) => hunk.new)) } }];
  const edits = hunks.map((hunk) => ({ old_string: joinLines(hunk.old), new_string: joinLines(hunk.new) }));
  const update = (target) => ({ tool_name: 'MultiEdit', tool_input: { file_path: target, edits } });
  return moveTo ? [removal(filePath), update(moveTo)] : [update(filePath)];
}

/**
 * The Claude Code tool calls a patch stands for, so each file in it is judged like a Write or MultiEdit would be.
 * A deleted file, or the old name of a moved one, is a Write that empties it.
 */
export function patchToolCalls(text) {
  return parsePatch(text).flatMap(toToolCalls);
}

/** The files a patch leaves behind: added, changed, or the new name of a moved one. */
export function patchedFiles(text) {
  return parsePatch(text)
    .filter(({ action }) => action !== 'delete')
    .map(({ filePath, moveTo }) => moveTo ?? filePath);
}
