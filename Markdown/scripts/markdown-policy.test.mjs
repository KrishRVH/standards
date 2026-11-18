import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, test } from 'bun:test';

const root = path.resolve(import.meta.dirname, '..');

function lint(files) {
  const project = mkdtempSync(path.join(tmpdir(), 'markdown-policy-'));
  try {
    expect(Bun.spawnSync(['git', 'init', '--quiet', project]).exitCode).toBe(0);
    copyFileSync(path.join(root, '.markdownlint-cli2.jsonc'), path.join(project, '.markdownlint-cli2.jsonc'));
    for (const directory of ['scripts', 'node_modules']) {
      symlinkSync(path.join(root, directory), path.join(project, directory), 'junction');
    }
    for (const [name, content] of Object.entries(files)) {
      const file = path.join(project, name);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, content);
    }
    const { exitCode, stderr } = Bun.spawnSync([process.execPath, 'run', '--bun', 'markdownlint-cli2'], {
      cwd: project,
      stderr: 'pipe',
    });
    return { exitCode, diagnostics: stderr.toString() };
  } finally {
    rmSync(project, { force: true, recursive: true });
  }
}

test('accepts structured documents and skips generated and Git-ignored content', () => {
  const { exitCode, diagnostics } = lint({
    'guide.md': `---
title: Guide
description: |
  ---
  Text in the same scalar.
---

# Guide

## Setup

### Details

## Usage

${'Long prose. '.repeat(16).trimEnd()}
`,
    'plain.md': '# Plain document\n',
    '.gitignore': 'drafts/\n',
    'drafts/invalid.md': 'No heading\n',
    'app/dist/invalid.md': 'No heading\n',
  });

  expect(diagnostics).toBe('');
  expect(exitCode).toBe(0);
});

test('reports structural and frontmatter failures at the source line', () => {
  const { exitCode, diagnostics } = lint({
    'missing-title.md': '---\ntitle: Metadata\n---\n\n## Section\n',
    'two-titles.md': '# First\n\n# Second\n',
    'depth.md': '# Title\n\n### Detail\n',
    'setext.md': 'Title\n=====\n',
    'fence.md': '# Example\n\n```\nexample\n```\n',
    'link.md': '# Example\n\n[Click here](./guide.md)\n',
    'duplicate.md': '---\ntitle: First\ntitle: Second\n---\n\n# Title\n',
    'syntax.md': '---\ntitle: [broken\n---\n\n# Title\n',
    'list.md': '---\n- item\n---\n\n# Title\n',
    'unclosed.md': '---\ntitle: Metadata\n\n# Title\n',
  });

  expect(exitCode).toBe(1);
  for (const [location, rule] of [
    ['missing-title.md:5', 'MD041'],
    ['two-titles.md:3', 'MD025'],
    ['depth.md:3', 'MD001'],
    ['setext.md:1', 'MD003'],
    ['fence.md:3', 'MD040'],
    ['link.md:3', 'MD059'],
    ['duplicate.md:3', 'yaml-frontmatter'],
    ['syntax.md:2', 'yaml-frontmatter'],
    ['list.md:2', 'yaml-frontmatter'],
    ['unclosed.md:1', 'yaml-frontmatter'],
  ]) {
    const findings = diagnostics.split('\n').filter((line) => line.startsWith(location));
    expect(findings.join('\n')).toContain(rule);
  }
});
