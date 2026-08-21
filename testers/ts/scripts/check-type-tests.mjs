import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { execPath } from 'node:process';
import { URL, fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const compiler = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url));
const project = fileURLToPath(new URL('../type-tests/tsconfig.json', import.meta.url));

const result = await new Promise((resolve, reject) => {
  const child = spawn(execPath, [compiler, '-p', project, '--pretty', 'false'], {
    cwd: root,
  });
  let stderr = '';
  let stdout = '';

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.once('error', reject);
  child.once('close', (code) => {
    resolve({ code, stderr, stdout });
  });
});

const output = `${result.stdout}${result.stderr}`;

assert.notEqual(result.code, 0, 'The negative type fixtures unexpectedly compiled.');

const diagnostics = Array.from(
  output.matchAll(/^(type-tests\/[^\n(]+)\((\d+),(\d+)\): error TS(\d+):/gm),
  ([, file, line, column, code]) => ({
    code: Number(code),
    column: Number(column),
    file,
    line: Number(line),
  }),
);

assert.deepEqual(diagnostics, [
  {
    code: 1360,
    column: 15,
    file: 'type-tests/nonexhaustive-variant.ts',
    line: 14,
  },
  {
    code: 2379,
    column: 25,
    file: 'type-tests/protected-route-unprojected.ts',
    line: 17,
  },
]);
assert.match(output, /does not satisfy the expected type 'never'\./);
assert.match(output, /Type 'RateLimited' is not assignable to type 'never'\./);
