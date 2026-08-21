import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { argv, cwd, exit, stderr } from 'node:process';

import ts from 'typescript';

const sourceExtensions = new Set(['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx']);
const ignoredDirectories = new Set([
  '.git',
  '.stryker-tmp',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'reports',
]);

async function sourceFiles(target) {
  const entries = await readdir(target, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        files.push(...(await sourceFiles(entryPath)));
      }
    } else if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files;
}

function directiveViolation(comment) {
  const isLineComment = comment.startsWith('//');
  const body = (isLineComment ? comment.slice(2) : comment.slice(2, -2)).trim();
  const isEslintDirective = isLineComment
    ? /^eslint-disable-(?:line|next-line)(?=\s|$)/u.test(body)
    : /^(?:eslint-(?:disable(?:-line|-next-line)?|enable|env)|exported|globals?)(?=\s|$)/u.test(body) ||
      /^eslint\s+[^\s,:]+(?:\s*,\s*[^\s,:]+)*\s*:/u.test(body);

  if (isEslintDirective) {
    const match = isLineComment
      ? /^eslint-disable-next-line\s+([^\s,]+(?:\s*,\s*[^\s,]+)*)\s+--\s+(\S.*)$/u.exec(body)
      : null;
    if (match === null) {
      return 'use only // eslint-disable-next-line <rule>[, <rule>] -- <reason>';
    }

    const rules = match[1]?.split(',').map((rule) => rule.trim()) ?? [];
    if (rules.some((rule) => rule.startsWith('@eslint-community/eslint-comments/'))) {
      return 'the exception-protocol rules cannot suppress themselves';
    }

    return undefined;
  }

  if (body.startsWith('@ts-')) {
    return isLineComment && /^@ts-expect-error\s+--\s+\S.*$/u.test(body)
      ? undefined
      : 'use only // @ts-expect-error -- <reason>';
  }

  if (/^Stryker\s+(?:disable|restore)(?=\s|$)/u.test(body)) {
    return isLineComment && /^Stryker disable next-line all:\s+\S.*$/u.test(body)
      ? undefined
      : 'use only // Stryker disable next-line all: <reason>';
  }

  return undefined;
}

function violationsFor(source, fileName) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.JSX, source);
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
  const violations = [];

  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token !== ts.SyntaxKind.SingleLineCommentTrivia && token !== ts.SyntaxKind.MultiLineCommentTrivia) {
      continue;
    }

    const violation = directiveViolation(scanner.getTokenText());
    if (violation !== undefined) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(scanner.getTokenPos());
      violations.push(`${fileName}:${String(line + 1)}: ${violation}`);
    }
  }

  return violations;
}

const arguments_ = argv.slice(2);
const targets = arguments_.length === 0 ? [cwd()] : arguments_.map((target) => path.resolve(target));
const files = [];

for (const target of targets) {
  const stats = await stat(target);
  files.push(...(stats.isDirectory() ? await sourceFiles(target) : [target]));
}

const violations = [];
for (const file of files.sort()) {
  violations.push(...violationsFor(await readFile(file, 'utf8'), path.relative(cwd(), file) || file));
}

if (violations.length > 0) {
  stderr.write(`${violations.join('\n')}\n`);
  exit(1);
}
