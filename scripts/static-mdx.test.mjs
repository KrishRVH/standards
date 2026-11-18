import { copyFileSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, test } from 'bun:test';

const root = path.resolve(import.meta.dirname, '..');

test('lints MDX source without importing components or evaluating expressions', () => {
  const project = mkdtempSync(path.join(tmpdir(), 'static-mdx-'));
  try {
    copyFileSync(path.join(root, '.markdownlint-cli2.jsonc'), path.join(project, '.markdownlint-cli2.jsonc'));
    for (const directory of ['scripts', 'node_modules']) {
      symlinkSync(path.join(root, directory), path.join(project, directory), 'junction');
    }
    const readable = [
      "import Note from './component-that-does-not-exist.js'",
      '',
      '{/* Publication notes. */} {/* Still outside the article. */}',
      '',
      '# Installation',
      '',
      '<Note kind="tip" count={3} expanded>',
      '',
      'Read the **setup guide**. {/* Source comment. */}',
      '',
      '<Note kind="nested">Use `{name}` for a placeholder.</Note>',
      '',
      '</Note>',
      '',
      '```jsx',
      '<Widget {...options}>{calculate()}</Widget>',
      '```',
      '',
    ].join('\n');
    writeFileSync(path.join(project, 'readable.mdx'), readable);
    writeFileSync(path.join(project, 'ordinary.md'), '# Template\n\nReplace {name} with your name.\n');
    const invalid = {
      'expression.mdx': '{getTitle()}',
      'attribute.mdx': '<Guide title={title}>Read the instructions.</Guide>',
      'spread.mdx': '<Guide {...options}>Read the instructions.</Guide>',
      'empty.mdx': '<Guide title="Hidden instructions" />',
      'nested.mdx': '<Guide>Visible text with <Contents /> inside.</Guide>',
      'comments.mdx': '<Guide>{/* no readable content */}</Guide>',
      'export.mdx': "export const title = 'Hidden instructions'",
      'malformed.mdx': '<Guide>Unclosed',
    };
    for (const [name, body] of Object.entries(invalid)) {
      writeFileSync(path.join(project, name), `---\ntitle: Example\n---\n\n# Guide\n\n${body}\n`);
    }

    writeFileSync(path.join(project, 'missing-title.mdx'), "import Note from './ui.js'\n\nPlain opening.\n\n# Too late\n");
    writeFileSync(path.join(project, 'duplicate.mdx'), "import Note from './ui.js'\n\n# Guide\n\n# Extra\n");
    const { exitCode, stderr } = Bun.spawnSync([process.execPath, path.join(root, 'node_modules/.bin/markdownlint-cli2')], {
      cwd: project,
      stderr: 'pipe',
    });
    const diagnostics = stderr.toString().trim().split('\n');
    expect(exitCode).toBe(1);
    expect(diagnostics).toContainEqual(expect.stringContaining('missing-title.mdx:3 error static-mdx'));
    expect(diagnostics).toContainEqual(expect.stringContaining('duplicate.mdx:5 error static-mdx'));
    expect(diagnostics).toHaveLength(Object.keys(invalid).length + 2);
    for (const name of Object.keys(invalid)) {
      expect(diagnostics).toContainEqual(expect.stringContaining(`${name}:7 error static-mdx`));
    }
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});
