#!/usr/bin/env node
import { lintFeedbackHook } from '../src/hooks/lint-feedback.js';
import { protectHook } from '../src/hooks/protect.js';

const HOOKS = { protect: protectHook, lint: lintFeedbackHook };
const USAGE = 'Usage: agent-guard <protect|lint>  (reads a Claude Code hook event as JSON on stdin)';

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const hook = HOOKS[process.argv[2]];
  if (!hook) {
    process.stderr.write(`${USAGE}\n`);
    process.exitCode = 1;
    return;
  }
  const event = JSON.parse((await readStdin()) || '{}');
  const output = await hook(event);
  if (output) process.stdout.write(JSON.stringify(output));
}

main().catch((error) => {
  process.stderr.write(`agent-guard: ${error.message}\n`);
  process.exitCode = 1;
});
