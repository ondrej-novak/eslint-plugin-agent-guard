#!/usr/bin/env node
import { lintFailure, lintFeedbackHook } from '../src/hooks/lint-feedback.js';
import { protectFailure, protectHook } from '../src/hooks/protect.js';

const HOOKS = {
  protect: { run: protectHook, fail: protectFailure },
  lint: { run: lintFeedbackHook, fail: lintFailure },
};
const USAGE = 'Usage: agent-guard <protect|lint>  (reads a Claude Code hook event as JSON on stdin)';

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

/** Every failure becomes the hook's own answer: an exit code of 1 would let a protected edit through. */
async function answer(hook) {
  try {
    const event = JSON.parse((await readStdin()) || '{}');
    return await hook.run(event);
  } catch (error) {
    return hook.fail(error);
  }
}

async function main() {
  const hook = HOOKS[process.argv[2]];
  if (!hook) {
    process.stderr.write(`${USAGE}\n`);
    process.exitCode = 1;
    return;
  }
  const output = await answer(hook);
  if (output) process.stdout.write(JSON.stringify(output));
}

main().catch((error) => {
  process.stderr.write(`agent-guard: ${error.message}\n`);
  process.exitCode = 1;
});
