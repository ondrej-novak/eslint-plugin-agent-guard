# Code shape

ESLint holds every file to a few limits. Write code that fits them from the start, so lint passes on the first run.

## Small functions, small files

A function has at most 50 lines and a file at most 250 (`agent-guard/max-lines-per-function`, `agent-guard/max-lines`). When a function grows, extract the steps into functions named after what they do. When a file grows, split it by responsibility. Tests are exempt.

## Two parameters at most

Pass one typed object and destructure it (`agent-guard/max-params`):

```ts
export const fetchAttachment = async ({ url, timeoutMs, maxSizeBytes }: FetchParameters) => { … };
```

## Named numbers

Any number other than -1, 0, 1 and 2 goes into a constant named after what it means (`agent-guard/no-magic-numbers`). `REQUEST_TIMEOUT_MS = 10_000` is right. `TEN_THOUSAND = 10_000` is rejected (`agent-guard/no-self-named-constant`), because it says nothing the number did not.

## No comments inside functions

Do not narrate code (`agent-guard/no-body-comments`). If a line needs explaining, rename or extract until it does not. Put the reason a function exists in JSDoc above it.

## When lint fails

The message says what to change. Fix the code. Disable comments have no effect here, and the lint configuration and these hooks cannot be edited. If a rule makes the task impossible, stop and tell me which rule and why. I decide whether the rule changes.
