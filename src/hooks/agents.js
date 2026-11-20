/** Codex marks its turn-scoped events with `turn_id`, a field Claude Code does not send. */
export const isCodex = (event) => Object.hasOwn(event, 'turn_id');
