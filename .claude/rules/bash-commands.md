# Bash commands

- Use the npm scripts (`npm test`, `npm run lint`) rather than calling `vitest` or `eslint` with your own flags. They
  run what CI runs.
- Never chain `cd` with `&&`, `|` or `;`. It forces a manual approval prompt. Use paths relative to the repo root, or a
  separate call for a directory change.
- Tests never run in the background. Run them synchronously and raise the Bash `timeout` if needed. Reading the
  output is covered in [testing.md](testing.md).
