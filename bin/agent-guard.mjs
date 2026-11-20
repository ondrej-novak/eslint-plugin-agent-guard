#!/usr/bin/env node
import { lintFailure, lintFeedbackHook } from '../src/hooks/lint-feedback.js';
import { protectFailure, protectHook } from '../src/hooks/protect.js';
import { init, INIT_USAGE } from '../src/init/index.js';

const HOOKS = {
  protect: { run: protectHook, fail: protectFailure },
  lint: { run: lintFeedbackHook, fail: lintFailure },
};
const USAGE = `Usage: agent-guard <protect|lint>  (reads a hook event as JSON on stdin)\n       ${INIT_USAGE}`;

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

/** Run by a person, not by an agent, so a failure is an ordinary error exit rather than a block. */
function runInit(args) {
  try {
    const lines = init({ cwd: process.cwd(), args });
    process.stdout.write(`${lines.map((line) => `agent-guard: ${line}`).join('\n')}\n`);
  } catch (error) {
    process.stderr.write(`agent-guard init: ${error.message}\n`);
    process.exitCode = 1;
  }
}

async function main() {
  const [name, ...args] = process.argv.slice(2);
  if (name === 'init') {
    runInit(args);
    return;
  }
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
