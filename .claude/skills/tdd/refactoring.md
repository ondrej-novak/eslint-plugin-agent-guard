# Refactor Candidates

After TDD cycle, look for:

- **Duplication** → Extract function
- **Long functions** → Break into small named functions (keep tests on the public interface; the presets cap functions at 50 lines)
- **Shallow modules** → Combine or deepen
- **Feature envy** → Move logic to where data lives
- **Primitive obsession** → Introduce a small object with a name
- **Long parameter lists** → One object, destructured
- **Existing code** the new code reveals as problematic
