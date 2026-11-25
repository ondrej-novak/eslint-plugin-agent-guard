/** Codex marks its turn-scoped events with `turn_id`, a field Claude Code does not send. */
export const isCodex = (event) => Object.hasOwn(event, 'turn_id');

/** Cursor sends `cursor_version` with every event, also to the hooks it loads from `.claude/settings.json`. */
const isCursor = (event) => Object.hasOwn(event, 'cursor_version');

/** Cursor sends `session_id` only when a session starts or ends; every tool event carries `conversation_id`. */
export const sessionOf = (event) => event.session_id ?? event.conversation_id;

/**
 * Cursor shows a Claude Code deny reason only to the user and maps no PostToolUse block, so its own fields go alongside:
 * `agent_message` carries the reason to the agent, `additional_context` the lint errors.
 */
export function withCursorFields(event, output) {
  if (!output || !isCursor(event)) return output;
  const denied = output.hookSpecificOutput?.permissionDecisionReason;
  if (denied) return { ...output, permission: 'deny', user_message: denied, agent_message: denied };
  return output.reason ? { ...output, additional_context: output.reason } : output;
}
