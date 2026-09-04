import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { compile } from '@mdx-js/mdx';
import rehypeShiki from '@shikijs/rehype';
import { load as parseYaml } from 'js-yaml';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';

const SKIP_DIRECTORIES = new Set([
  '.cache',
  '.git',
  '.godot',
  '.gradle',
  '.kotlin',
  '.lua_modules',
  '.next',
  '.nuxt',
  '.stack-work',
  '.svelte-kit',
  '.turbo',
  '.vite',
  '.zig-cache',
  '_build',
  'build',
  'coverage',
  'deps',
  'dist',
  'dist-newstyle',
  'node_modules',
  'out',
  'sbom',
  'target',
  'vendor',
  'zig-cache',
  'zig-out',
  'zig-pkg',
]);

const isMarkdownFile = (file) => file.endsWith('.md') || file.endsWith('.mdx');

const findMarkdownFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (!SKIP_DIRECTORIES.has(entry.name)) {
        files.push(...(await findMarkdownFiles(entryPath)));
      }
      continue;
    }

    if (entry.isFile() && isMarkdownFile(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
};

const findGitMarkdownFiles = (directory) => {
  const result = spawnSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', '*.md', '*.mdx'],
    { cwd: directory, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    return null;
  }

  return result.stdout
    .split('\0')
    .filter(Boolean)
    .filter((file) => !file.split(/[\\/]/).some((part) => SKIP_DIRECTORIES.has(part)))
    .map((file) => path.resolve(directory, file))
    .filter(existsSync);
};

const validateFrontmatter = (source) => {
  const lines = source.split(/\r\n|\r|\n/);
  if (lines[0]?.trim() !== '---') {
    return;
  }

  const closingFence = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (closingFence === -1) {
    throw new Error('YAML frontmatter is not closed.');
  }

  const metadata = parseYaml(lines.slice(1, closingFence).join('\n'));
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error('YAML frontmatter must be a mapping.');
  }
};

const checkMarkdownFile = async (file) => {
  const source = await readFile(file, 'utf8');
  validateFrontmatter(source);

  if (file.endsWith('.mdx')) {
    await compile(source, {
      remarkPlugins: [remarkFrontmatter, remarkGfm],
      // Load only encountered grammars; unknown fence labels remain plain text.
      rehypePlugins: [[rehypeShiki, { theme: 'github-dark', langs: [], lazy: true, fallbackLanguage: 'text' }]],
    });
  }
};

const main = async () => {
  const directory = process.cwd();
  const files = (findGitMarkdownFiles(directory) ?? (await findMarkdownFiles(directory))).sort();

  if (files.length === 0) {
    console.log('No Markdown or MDX files found.');
    return;
  }

  const failures = [];

  for (const file of files) {
    try {
      await checkMarkdownFile(file);
    } catch (error) {
      failures.push({ error, file });
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      const message = failure.error instanceof Error ? failure.error.message : String(failure.error);
      console.error(`${path.relative(process.cwd(), failure.file)}: ${message}`);
    }

    process.exitCode = 1;
    return;
  }

  console.log(`Checked ${files.length} Markdown/MDX file${files.length === 1 ? '' : 's'}.`);
};

await main();
