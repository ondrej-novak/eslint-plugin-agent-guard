#!/usr/bin/env node
/**
 * Prints a pull request's open review threads, and the review bodies and general comments posted since the
 * last push, in one go so triage starts from the full list. Full bodies go to .skills-tmp/pr/.
 * Usage: node .claude/skills/pr/scripts/fetch-reviews.mjs <owner> <repo> <pr-number>
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const PREVIEW_LENGTH = 300;
const MAX_OUTPUT_BYTES = 10_485_760;
const TMP_DIR = path.join('.skills-tmp', 'pr');
const CODERABBIT_SUMMARY = 'auto-generated comment: summarize by coderabbit.ai';
const THREADS_QUERY = `query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) { pullRequest(number: $number) { reviewThreads(first: 100) { nodes {
    id isResolved comments(first: 100) { nodes { author { login } path line originalLine bodyText } }
  } } } }
}`;

const [owner, repo, number] = process.argv.slice(2);
const print = (line) => process.stdout.write(`${line}\n`);

function run(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', maxBuffer: MAX_OUTPUT_BYTES });
}

const ghJson = (args) => JSON.parse(run('gh', args));

function lastPushDate() {
  const branch = run('git', ['branch', '--show-current']).trim();
  return new Date(run('git', ['log', `origin/${branch}`, '-1', '--format=%cI']).trim());
}

function preview(body) {
  const flat = body.replace(/\s+/g, ' ');
  return flat.length > PREVIEW_LENGTH ? `${flat.slice(0, PREVIEW_LENGTH)}...` : flat;
}

/** A thread's later replies can withdraw or settle the first comment, so triage reads all of them. */
function conversation(comments) {
  return comments.map((comment) => `@${comment.author?.login}:\n${comment.bodyText}`).join('\n\n');
}

function printEntry({ title, file, body, fields }) {
  const outFile = path.join(TMP_DIR, file);
  writeFileSync(outFile, body);
  print(`\n--- ${title} ---`);
  for (const [key, value] of Object.entries(fields)) print(`${key}: ${value}`);
  print(`Preview: ${preview(body)}`);
  print(`Full body: ${outFile}`);
}

function printThreads() {
  const query = ['-f', `query=${THREADS_QUERY}`, '-f', `owner=${owner}`, '-f', `repo=${repo}`, '-F', `number=${number}`];
  const threads = ghJson(['api', 'graphql', ...query]).data.repository.pullRequest.reviewThreads.nodes;
  const open = threads.filter((thread) => !thread.isResolved);
  print('=== Source A: Inline threads ===');
  print(`Total: ${threads.length}, Unresolved: ${open.length}`);
  open.forEach((thread, index) => {
    const [comment, ...replies] = thread.comments.nodes;
    const location = `${comment.path}:${comment.line ?? comment.originalLine}`;
    const fields = { ID: thread.id, Author: comment.author?.login, Path: location, Replies: replies.length };
    printEntry({ title: `Thread ${index + 1}`, file: `thread-${thread.id}.txt`, body: conversation(thread.comments.nodes), fields });
  });
}

function printReviews(since) {
  const reviews = ghJson(['api', `repos/${owner}/${repo}/pulls/${number}/reviews?per_page=100`]);
  const fresh = reviews.filter((review) => review.body?.trim() && new Date(review.submitted_at) >= since);
  print('\n=== Source B: Review bodies ===');
  print(`Total reviews: ${reviews.length}, Shown: ${fresh.length}`);
  fresh.forEach((review, index) => {
    const fields = { ID: review.id, Author: review.user?.login, Date: review.submitted_at };
    printEntry({ title: `Review ${index + 1}`, file: `review-${review.id}.txt`, body: review.body, fields });
  });
}

function printComments(since) {
  const comments = ghJson(['api', `repos/${owner}/${repo}/issues/${number}/comments?per_page=100`]);
  const fresh = comments.filter((comment) => !comment.body.includes(CODERABBIT_SUMMARY) && new Date(comment.created_at) >= since);
  print('\n=== Source C: General comments ===');
  print(`Total: ${comments.length}, Shown: ${fresh.length}`);
  fresh.forEach((comment, index) => {
    const fields = { ID: comment.id, Author: comment.user?.login };
    printEntry({ title: `Comment ${index + 1}`, file: `gc-${comment.id}.txt`, body: comment.body, fields });
  });
}

if (!number) {
  print('Usage: node .claude/skills/pr/scripts/fetch-reviews.mjs <owner> <repo> <pr-number>');
  process.exit(1);
}
mkdirSync(TMP_DIR, { recursive: true });
const since = lastPushDate();
printThreads();
printReviews(since);
printComments(since);
