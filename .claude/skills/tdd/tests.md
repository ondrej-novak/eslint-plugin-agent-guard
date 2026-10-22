# Good and Bad Tests

## Good Tests

**Integration-style**: Test through real interfaces, not mocks of internal parts.

```javascript
// GOOD: Tests observable behavior
ruleTester.run('no-self-named-constant', rule, {
  valid: ['const REQUEST_TIMEOUT_MS = 10000;'],
  invalid: [{ code: 'const TEN_THOUSAND = 10000;', errors: [{ messageId: 'selfNamed' }] }],
});

it('blocks edits to eslint.config.js', () => {
  const reason = protectReason({ tool_name: 'Edit', tool_input: { file_path: 'eslint.config.js' } });
  expect(reason).toMatch(/not allowed/);
});
```

Characteristics:

- Tests behavior users/callers care about
- Uses public API only
- Survives internal refactors
- Describes WHAT, not HOW
- One logical assertion per test

## Bad Tests

**Implementation-detail tests**: Coupled to internal structure.

```javascript
// BAD: Tests implementation details
it('protect calls isProtectedPath', () => {
  const spy = vi.spyOn(paths, 'isProtectedPath');
  protectReason(tool);
  expect(spy).toHaveBeenCalledWith('eslint.config.js');
});
```

Red flags:

- Mocking internal collaborators
- Testing private functions
- Asserting on call counts/order
- Test breaks when refactoring without behavior change
- Test name describes HOW not WHAT
- Verifying through external means instead of interface

```javascript
// BAD: Bypasses interface to verify
it('lint hook records the attempt', async () => {
  await lintFeedbackHook(tool);
  const counts = JSON.parse(readFileSync(path.join(os.tmpdir(), 'agent-guard', 'default.json'), 'utf8'));
  expect(counts['src/a.js']).toBe(1);
});

// GOOD: Verifies through interface
it('tells the agent to stop after three failures in a row', async () => {
  await lintFeedbackHook(tool);
  await lintFeedbackHook(tool);
  expect((await lintFeedbackHook(tool)).reason).toMatch(/^STOP\./);
});
```
