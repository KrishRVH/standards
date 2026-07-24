import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'bun:test';

const CHECKER = fileURLToPath(new URL('check-mdx.mjs', import.meta.url));
const decoder = new TextDecoder();

const runChecker = (files, { git = false } = {}) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'markdown-check-'));

  try {
    if (git) {
      const result = Bun.spawnSync(['git', 'init', '--quiet'], { cwd: directory });
      expect(result.exitCode).toBe(0);
    }

    for (const [file, content] of Object.entries(files)) {
      const destination = path.join(directory, file);
      mkdirSync(path.dirname(destination), { recursive: true });
      writeFileSync(destination, content);
    }

    const result = Bun.spawnSync([process.execPath, CHECKER], {
      cwd: directory,
      stderr: 'pipe',
      stdout: 'pipe',
    });

    return {
      exitCode: result.exitCode,
      stderr: decoder.decode(result.stderr),
    };
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
};

test('accepts valid Markdown and MDX', () => {
  const result = runChecker({
    'content/example.mdx': '---\ntitle: Example\n---\n\n# Hello\n',
    'docs/example.md': '---\ntitle: Example\n---\n\n# Hello\n',
  });

  expect(result.exitCode).toBe(0);
});

test('rejects malformed MDX', () => {
  const result = runChecker({ 'invalid.mdx': '# Hello\n\n<Component\n' });

  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain('invalid.mdx');
});

test('rejects malformed and duplicate frontmatter', () => {
  const malformed = runChecker({ 'malformed.md': '---\ntitle: [broken\n---\n\n# Hello\n' });
  const nonMapping = runChecker({ 'non-mapping.md': '---\n- invalid\n---\n\n# Hello\n' });
  const duplicate = runChecker({ 'duplicate.mdx': '---\ntitle: One\ntitle: Two\n---\n\n# Hello\n' });

  expect(malformed.exitCode).not.toBe(0);
  expect(malformed.stderr).toContain('malformed.md');
  expect(nonMapping.exitCode).not.toBe(0);
  expect(nonMapping.stderr).toContain('non-mapping.md');
  expect(duplicate.exitCode).not.toBe(0);
  expect(duplicate.stderr).toContain('duplicate.mdx');
});

test('checks untracked files in Git repositories', () => {
  const result = runChecker({ 'untracked.mdx': '# Hello\n\n<Component\n' }, { git: true });

  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain('untracked.mdx');
});

test('ignores generated directories in Git repositories', () => {
  const result = runChecker(
    {
      'docs/example.md': '# Hello\n',
      'node_modules/invalid.mdx': '# Hello\n\n<Component\n',
    },
    { git: true },
  );

  expect(result.exitCode).toBe(0);
});
