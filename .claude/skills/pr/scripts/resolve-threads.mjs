#!/usr/bin/env node
/**
 * Answers review threads and general comments listed in a JSON file. A thread is resolved after the reply
 * unless its action says `"resolve": false`; a general comment gets a new PR comment, since GitHub has no
 * replies to those.
 * Usage: node .claude/skills/pr/scripts/resolve-threads.mjs <owner> <repo> <pr-number> <actions.json>
 * Actions: [{ "threadId": "PRRT_...", "reply": "Fixed: ...", "resolve": true }, { "commentId": 123, "reply": "..." }]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const REPLY = `mutation($thread: ID!, $body: String!) {
  addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $thread, body: $body }) { comment { id } }
}`;
const RESOLVE = `mutation($thread: ID!) { resolveReviewThread(input: { threadId: $thread }) { thread { isResolved } } }`;

const [owner, repo, number, actionsFile] = process.argv.slice(2);
const print = (line) => process.stdout.write(`${line}\n`);
const gh = (args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function answerThread({ threadId, reply, resolve = true }) {
  if (reply) gh(['api', 'graphql', '-f', `query=${REPLY}`, '-f', `thread=${threadId}`, '-f', `body=${reply}`]);
  if (resolve) gh(['api', 'graphql', '-f', `query=${RESOLVE}`, '-f', `thread=${threadId}`]);
  return resolve ? 'replied and resolved' : 'replied';
}

function answerComment({ reply }) {
  gh(['api', `repos/${owner}/${repo}/issues/${number}/comments`, '-f', `body=${reply}`]);
  return 'replied';
}

function apply(action) {
  if (action.threadId) return answerThread(action);
  if (action.commentId && action.reply) return answerComment(action);
  throw new Error('needs a threadId, or a commentId with a reply');
}

if (!actionsFile) {
  print('Usage: node .claude/skills/pr/scripts/resolve-threads.mjs <owner> <repo> <pr-number> <actions.json>');
  process.exit(1);
}
const actions = JSON.parse(readFileSync(actionsFile, 'utf8'));
let failed = 0;
for (const action of actions) {
  const label = action.threadId ?? `comment-${action.commentId}`;
  try {
    print(`OK   ${label} (${apply(action)})`);
  } catch (error) {
    failed += 1;
    print(`FAIL ${label}: ${error.stderr || error.message}`);
  }
}
print(`\nDone: ${actions.length - failed} succeeded, ${failed} failed`);
if (failed > 0) process.exit(1);
