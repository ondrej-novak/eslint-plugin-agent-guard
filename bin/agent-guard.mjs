#!/usr/bin/env node
import { lintFailure, lintFeedbackHook } from '../src/hooks/lint-feedback.js';
import { protectFailure, protectHook } from '../src/hooks/protect.js';

const HOOKS = {
  protect: { run: protectHook, fail: protectFailure },
  lint: { run: lintFeedbackHook, fail: lintFailure },
};
const USAGE = 'Usage: agent-guard <protect|lint>  (reads a Claude Code hook event as JSON on stdin)';

/** The one failure code Claude Code treats as a block; with any other, the tool call goes through. */
const BLOCKING_EXIT_CODE = 2;

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

/** Every failure, empty input included, becomes the hook's own answer: an exit code of 1 would let a protected edit through. */
async function answer(hook) {
  try {
    return await hook.run(JSON.parse(await readStdin()));
  } catch (error) {
    return hook.fail(error);
  }
}

async function main() {
  const name = process.argv[2];
  if (!Object.hasOwn(HOOKS, name)) {
    process.stderr.write(`${USAGE}\n`);
    process.exitCode = BLOCKING_EXIT_CODE;
    return;
  }
  const output = await answer(HOOKS[name]);
  if (output) process.stdout.write(JSON.stringify(output));
}

main().catch((error) => {
  process.stderr.write(`agent-guard: ${error.message}\n`);
  process.exitCode = BLOCKING_EXIT_CODE;
});
