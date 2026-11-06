import { describe, expect, it } from 'vitest';
import { DIALECTS } from '../src/hooks/shell.js';
import { writesProtectedFile } from '../src/hooks/shell-writes.js';

describe('writesProtectedFile', () => {
  describe('blocks a write to a protected file', () => {
    it.each([
      'echo x > eslint.config.js',
      'echo x>eslint.config.js',
      'echo x >> eslint.config.js',
      'echo x >| eslint.config.js',
      'echo x 1> eslint.config.js',
      'echo x 2> eslint.config.js',
      'echo x &> eslint.config.js',
      'echo x > "eslint.config.js"',
      "echo x > 'my dir/eslint.config.js'",
      'echo x > mobile\\eslint.config.js',
      'echo x > .husky/pre-commit',
      '(echo x > eslint.config.js)',
      "cat > eslint.config.js <<'EOF'\nexport default [];\nEOF",
      "cat <<'EOF' > eslint.config.js\nexport default [];\nEOF",
    ])('through a redirect: %s', (command) => expect(writesProtectedFile(command)).toBe(true));

    it.each([
      'cp other.js eslint.config.js',
      'cp -f other.js eslint.config.js',
      'cp other.js .claude\\settings.json',
      'cp other.js eslint.config.js > /tmp/copy.log',
      'echo x > /tmp/a && cp /tmp/a eslint.config.js',
      'cp /tmp/eslint.config.js .',
      'cp /tmp/eslint.config.js ..',
      'cp /tmp/eslint.config.js mobile/',
      'cp /tmp/eslint.config.js mobile',
      'cp -t mobile /tmp/eslint.config.js',
      'cp -ft mobile /tmp/eslint.config.js',
      'cp --target-directory=mobile /tmp/eslint.config.js',
    ])('through a copy: %s', (command) => expect(writesProtectedFile(command)).toBe(true));

    it.each([
      'echo x | tee eslint.config.js',
      'echo x | tee -a eslint.config.js | wc -l',
      'mv eslint.config.js /tmp/old.js',
      'rm other.js eslint.config.js',
      'cat eslint.config.js && rm eslint.config.js',
      'truncate -s 0 eslint.config.js',
      'ln -sf /tmp/empty.js eslint.config.js',
      'git restore eslint.config.js',
      'git -C mobile checkout -- eslint.config.js',
      'git diff eslint.config.js | git apply -R',
      "sed -i 's/a/b/' eslint.config.js",
      "sed 's/a/b/' -i eslint.config.js",
      "sed --in-place 's/a/b/' eslint.config.js",
      "perl -i -pe 's/a/b/' eslint.config.js",
      "node -e \"require('fs').writeFileSync('eslint.config.js', '')\"",
    ])('through a command that changes the files it names: %s', (command) => expect(writesProtectedFile(command)).toBe(true));
  });

  describe('keeps quoted separators inside their command', () => {
    it.each([
      "sed -i 's/a;b/c/' eslint.config.js",
      "sed 's/a;b/c/' -i eslint.config.js",
      'sed -i "s/a;b/c/" eslint.config.js',
      'sed -i "s/\\"/;/" eslint.config.js',
      "sed -i 's/a|b/c/' eslint.config.js",
      "sed -i 's/a&&b/c/' eslint.config.js",
      "sed -i 's/a\nb/c/' eslint.config.js",
      'rm \\\neslint.config.js',
      "cat <<'EOF'\ndon't\nEOF\nsed -i 's/a;b/c/' eslint.config.js",
    ])('%s', (command) => expect(writesProtectedFile(command)).toBe(true));
  });

  describe('blocks a write when another part of the command can carry the path to it', () => {
    it.each([
      'f=eslint.config.js; echo x > $f',
      'f=eslint.config.js; rm "$f"',
      'f=eslint.config.js; rm ${f}',
      'f=eslint.config.js; git checkout -- $f',
      'echo x > $(echo eslint.config.js)',
      'echo x > `echo eslint.config.js`',
      'echo eslint.config.js | xargs rm',
      'for f in eslint.config.js; do rm "$f"; done',
      'echo eslint.config.js | while read -r f; do rm "$f"; done',
      'alias d=rm; d eslint.config.js',
      'd() { rm "$1"; }; d eslint.config.js',
      'cd .husky/; rm pre-commit',
      'cd .husky && echo x > pre-commit',
      'pushd .husky/; rm pre-commit',
    ])('%s', (command) => expect(writesProtectedFile(command)).toBe(true));
  });

  describe('blocks a command that runs another command', () => {
    it.each([
      'bash -c "echo x > eslint.config.js"',
      "bash -c 'rm eslint.config.js'",
      'eval "rm eslint.config.js"',
      "echo 'rm eslint.config.js' | sh",
      "echo 'rm eslint.config.js' > /tmp/a.sh; bash /tmp/a.sh",
      "bash <<'EOF'\nrm eslint.config.js\nEOF",
      'echo "$(rm eslint.config.js)"',
      'find . -name eslint.config.js -exec rm {} \\;',
    ])('%s', (command) => expect(writesProtectedFile(command)).toBe(true));
  });

  describe('in PowerShell', () => {
    it.each([
      'copy other.js eslint.config.js',
      'Microsoft.PowerShell.Management\\Remove-Item eslint.config.js',
      "$p = 'eslint.config.js'; Set-Content $p ''",
      "$p = 'eslint.config.js'; '{}' > $p",
      "'eslint.config.js' | Remove-Item",
      'Get-Item eslint.config.js | Remove-Item',
      'Get-ChildItem -Filter eslint.config.js | ForEach-Object { Remove-Item $_ }',
      'Set-Alias d Remove-Item; d eslint.config.js',
      'function d { Remove-Item @args }; d eslint.config.js',
      'Set-Location .husky/; Remove-Item pre-commit',
    ])('blocks %s', (command) => expect(writesProtectedFile(command, DIALECTS.PowerShell)).toBe(true));

    it.each([
      'Remove-Item src/a.ts; Get-Content eslint.config.js',
      'Get-Content eslint.config.js > out.txt',
      'Get-Content eslint.config.js 2>$null',
      'Get-Content eslint.config.js > $null',
      'Remove-Item src/a.ts; Get-Content eslint.config.js 2>$null',
    ])('allows %s', (command) => expect(writesProtectedFile(command, DIALECTS.PowerShell)).toBe(false));
  });

  describe('allows a command that only reads a protected file', () => {
    it.each([
      'rm src/a.ts; cat eslint.config.js',
      'rm src/a.ts && sha256sum eslint.config.js',
      'mv src/a.ts src/b.ts; cat eslint.config.js',
      'sed -i s/a/b/ src/a.ts; cat eslint.config.js',
      'rm src/a.ts; cat eslint.config.js; echo "exit $?"',
      'git stash; cat eslint.config.js',
      'rm src/a.ts # not eslint.config.js',
    ])('next to a write elsewhere: %s', (command) => expect(writesProtectedFile(command)).toBe(false));

    it.each([
      'cat eslint.config.js > /tmp/copy.js',
      'cat eslint.config.js >> /tmp/copy.js',
      'cat eslint.config.js &> /tmp/out.txt',
      'git show HEAD:eslint.config.js > /tmp/old.js',
      'grep -c x eslint.config.js > /tmp/count.txt',
      'cat eslint.config.js | tee /tmp/copy.js',
      'cp eslint.config.js /tmp/backup.js',
      'cp -p eslint.config.js "/tmp/my backup.js"',
    ])('and sends the text elsewhere: %s', (command) => expect(writesProtectedFile(command)).toBe(false));

    it.each([
      'cat eslint.config.js',
      'cat eslint.config.js 2>&1',
      'cat eslint.config.js 2>/dev/null',
      'cat eslint.config.js >/dev/null 2>&1',
      'cat eslint.config.js 2>nul',
      'f=eslint.config.js; cat "$f" 2>/dev/null',
      'f=eslint.config.js; cat "$f" 2>&1',
      'grep ">" eslint.config.js',
      'grep rm eslint.config.js',
      'echo rm eslint.config.js',
      'git diff -- eslint.config.js | head -20',
      'echo "a;b" > /tmp/x; cat eslint.config.js',
    ])('on its own: %s', (command) => expect(writesProtectedFile(command)).toBe(false));

    it.each([
      "cat > /tmp/notes.md <<'EOF'\nSee eslint.config.js\nEOF",
      "cat > /tmp/notes.md <<'EOF'\nDon't change eslint.config.js\nEOF",
    ])('as text in a heredoc for another file: %s', (command) => expect(writesProtectedFile(command)).toBe(false));
  });

  it.each(['rm src/a.ts', 'echo x > src/a.ts', 'f=src/a.ts; rm "$f"', 'cp a.js b.js', 'npm test > out.txt'])(
    'leaves a command that names no protected file alone: %s',
    (command) => expect(writesProtectedFile(command)).toBe(false),
  );
});
