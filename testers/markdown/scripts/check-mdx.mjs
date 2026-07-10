import { compile } from '@mdx-js/mdx';
import rehypeShiki from '@shikijs/rehype';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';

const SKIP_DIRECTORIES = new Set([
  '.git',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.turbo',
  '.vite',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'sbom',
]);

const findMdxFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (!SKIP_DIRECTORIES.has(entry.name)) {
        files.push(...(await findMdxFiles(entryPath)));
      }
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.mdx')) {
      files.push(entryPath);
    }
  }

  return files;
};

const compileMdxFile = async (file) => {
  const source = await readFile(file, 'utf8');

  await compile(source, {
    remarkPlugins: [remarkFrontmatter, remarkGfm],
    rehypePlugins: [[rehypeShiki, { theme: 'github-dark' }]],
  });
};

const main = async () => {
  const files = (await findMdxFiles(process.cwd())).sort();

  if (files.length === 0) {
    console.log('No MDX files found.');
    return;
  }

  const failures = [];

  for (const file of files) {
    try {
      await compileMdxFile(file);
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

  console.log(`Checked ${files.length} MDX file${files.length === 1 ? '' : 's'}.`);
};

await main();
