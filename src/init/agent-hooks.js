import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseJson } from '../hooks/settings.js';

const SCRIPT = 'eslint-plugin-agent-guard/bin/agent-guard.mjs';
const JSON_INDENT = 2;

/** Codex sets no project folder variable and can start in a subfolder, so its path starts at the git root. */
const AGENTS = {
  claude: {
    file: '.claude/settings.json',
    base: '$CLAUDE_PROJECT_DIR',
    hooks: [
      { event: 'PreToolUse', matcher: 'Edit|Write|MultiEdit|NotebookEdit|Bash|PowerShell|Shell|Delete', name: 'protect' },
      { event: 'PostToolUse', matcher: 'Edit|Write|MultiEdit', name: 'lint' },
    ],
  },
  codex: {
    file: '.codex/hooks.json',
    base: '$(git rev-parse --show-toplevel)',
    hooks: [
      { event: 'PreToolUse', matcher: 'Bash|apply_patch', name: 'protect' },
      { event: 'PostToolUse', matcher: 'apply_patch', name: 'lint' },
    ],
    note: 'Codex runs them once you trust them in /hooks.',
  },
};

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function readSettings({ file, label }) {
  if (!existsSync(file)) return {};
  let settings;
  try {
    settings = parseJson(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is not valid JSON (${error.message}). Fix it and run init again.`, { cause: error });
  }
  if (!isObject(settings) || (settings.hooks !== undefined && !isObject(settings.hooks))) {
    throw new Error(`${label} must be a JSON object whose "hooks" is an object. Fix it and run init again.`);
  }
  return settings;
}

function entriesOf(hooks, { event, label }) {
  const entries = hooks[event] ?? [];
  if (!Array.isArray(entries)) throw new Error(`${label}: "hooks.${event}" must be a list. Fix it and run init again.`);
  return entries;
}

const runsHook = (entries, name) => entries.some((entry) => (entry.hooks ?? []).some(({ command = '' }) => command.includes(SCRIPT) && command.trim().endsWith(` ${name}`)));

function hookEntry({ agent, appPath, hook }) {
  const folder = appPath ? `${appPath}/` : '';
  const command = `node "${agent.base}/${folder}node_modules/${SCRIPT}" ${hook.name}`;
  return { matcher: hook.matcher, hooks: [{ type: 'command', command }] };
}

/** Reads every settings file before init writes anything, so a broken one stops it with the project untouched. */
export function checkAgentSettings({ root, agentNames }) {
  agentNames.forEach((agentName) => {
    const agent = AGENTS[agentName];
    const settings = readSettings({ file: path.join(root, agent.file), label: agent.file });
    agent.hooks.forEach(({ event }) => entriesOf({ ...settings.hooks }, { event, label: agent.file }));
  });
}

/** Adds the protect and lint hooks an agent does not run yet. Entries already there, ours or not, stay as they are. */
export function addAgentHooks({ root, appPath, agentName }) {
  const agent = AGENTS[agentName];
  const file = path.join(root, agent.file);
  const settings = readSettings({ file, label: agent.file });
  const hooks = { ...settings.hooks };
  const missing = agent.hooks.filter((hook) => !runsHook(entriesOf(hooks, { event: hook.event, label: agent.file }), hook.name));
  if (missing.length === 0) return `${agent.file} already runs the hooks`;
  missing.forEach((hook) => {
    hooks[hook.event] = [...entriesOf(hooks, { event: hook.event, label: agent.file }), hookEntry({ agent, appPath, hook })];
  });
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ ...settings, hooks }, null, JSON_INDENT)}\n`);
  return [`added the ${missing.map(({ name }) => name).join(' and ')} hooks to ${agent.file}.`, agent.note].filter(Boolean).join(' ');
}
