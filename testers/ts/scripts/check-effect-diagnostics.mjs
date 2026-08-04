import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { isAbsolute, relative, sep } from 'node:path';
import { execPath, stdout as standardOutput } from 'node:process';
import { URL, fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = fileURLToPath(new URL('../node_modules/@effect/language-service/cli.js', import.meta.url));
const project = fileURLToPath(new URL('../effect-diagnostics/tsconfig.json', import.meta.url));

const runDiagnostics = () =>
  new Promise((resolve, reject) => {
    const child = spawn(
      execPath,
      [cli, 'diagnostics', '--project', project, '--format', 'json', '--severity', 'error'],
      { cwd: root },
    );
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

const result = await runDiagnostics();

assert.notEqual(
  result.code,
  0,
  `Expected configured Effect diagnostics to fail, but the CLI exited successfully.\n${result.stderr}${result.stdout}`,
);

const report = JSON.parse(result.stdout);
assert.equal(report.summary.errors, report.diagnostics.length);
assert.equal(
  report.diagnostics.every(({ severity }) => severity === 'error'),
  true,
  'The blocking fixture project must emit only error-level diagnostics.',
);

const compareLocations = (left, right) =>
  left.file.localeCompare(right.file) ||
  left.line - right.line ||
  left.column - right.column ||
  left.name.localeCompare(right.name);

const actual = report.diagnostics
  .map((diagnostic) => {
    const file = isAbsolute(diagnostic.file) ? relative(root, diagnostic.file) : diagnostic.file;
    return {
      column: diagnostic.column,
      file: file.split(sep).join('/'),
      line: diagnostic.line,
      name: diagnostic.name,
    };
  })
  .sort(compareLocations);

const expected = [
  {
    column: 14,
    file: 'effect-diagnostics/fixtures/any-unknown-error-context.ts',
    line: 3,
    name: 'anyUnknownInErrorContext',
  },
  {
    column: 10,
    file: 'effect-diagnostics/fixtures/any-unknown-error-context.ts',
    line: 4,
    name: 'anyUnknownInErrorContext',
  },
  {
    column: 17,
    file: 'effect-diagnostics/fixtures/any-unknown-error-context.ts',
    line: 5,
    name: 'anyUnknownInErrorContext',
  },
  {
    column: 70,
    file: 'effect-diagnostics/fixtures/class-self-mismatch.ts',
    line: 7,
    name: 'classSelfMismatch',
  },
  {
    column: 46,
    file: 'effect-diagnostics/fixtures/effect-fn-implicit-any.ts',
    line: 3,
    name: 'effectFnImplicitAny',
  },
  {
    column: 46,
    file: 'effect-diagnostics/fixtures/effect-gen-adapter.ts',
    line: 3,
    name: 'effectGenUsesAdapter',
  },
  {
    column: 14,
    file: 'effect-diagnostics/fixtures/effect-in-failure.ts',
    line: 3,
    name: 'effectInFailure',
  },
  {
    column: 24,
    file: 'effect-diagnostics/fixtures/effect-in-failure.ts',
    line: 3,
    name: 'effectInFailure',
  },
  {
    column: 14,
    file: 'effect-diagnostics/fixtures/effect-in-void-success.ts',
    line: 3,
    name: 'effectInVoidSuccess',
  },
  {
    column: 1,
    file: 'effect-diagnostics/fixtures/floating-effect.ts',
    line: 3,
    name: 'floatingEffect',
  },
  {
    column: 14,
    file: 'effect-diagnostics/fixtures/generic-effect-service.ts',
    line: 3,
    name: 'genericEffectServices',
  },
  {
    column: 15,
    file: 'effect-diagnostics/fixtures/global-date-in-effect.ts',
    line: 4,
    name: 'globalDateInEffect',
  },
  {
    column: 17,
    file: 'effect-diagnostics/fixtures/global-random-in-effect.ts',
    line: 4,
    name: 'globalRandomInEffect',
  },
  {
    column: 3,
    file: 'effect-diagnostics/fixtures/global-timers-in-effect.ts',
    line: 4,
    name: 'globalTimersInEffect',
  },
  {
    column: 39,
    file: 'effect-diagnostics/fixtures/layer-merge-all-dependencies.ts',
    line: 13,
    name: 'layerMergeAllWithDependencies',
  },
  {
    column: 36,
    file: 'effect-diagnostics/fixtures/lazy-promise-in-sync.ts',
    line: 3,
    name: 'lazyPromiseInEffectSync',
  },
  {
    column: 14,
    file: 'effect-diagnostics/fixtures/missing-effect-context.ts',
    line: 6,
    name: 'missingEffectContext',
  },
  // @effect/language-service 0.87.1 reports missingEffectError with the
  // missingEffectContext name. Preserve the observed contract until upgrade.
  {
    column: 59,
    file: 'effect-diagnostics/fixtures/missing-effect-error.ts',
    line: 9,
    name: 'missingEffectContext',
  },
  {
    column: 14,
    file: 'effect-diagnostics/fixtures/missing-effect-service-dependency.ts',
    line: 5,
    name: 'missingEffectServiceDependency',
  },
  {
    column: 14,
    file: 'effect-diagnostics/fixtures/missing-layer-context.ts',
    line: 8,
    name: 'missingLayerContext',
  },
  {
    column: 3,
    file: 'effect-diagnostics/fixtures/missing-return-yield-star.ts',
    line: 5,
    name: 'missingReturnYieldStar',
  },
  {
    column: 14,
    file: 'effect-diagnostics/fixtures/missing-star-in-yield.ts',
    line: 3,
    name: 'anyUnknownInErrorContext',
  },
  {
    column: 24,
    file: 'effect-diagnostics/fixtures/missing-star-in-yield.ts',
    line: 3,
    name: 'anyUnknownInErrorContext',
  },
  {
    column: 35,
    file: 'effect-diagnostics/fixtures/missing-star-in-yield.ts',
    line: 3,
    name: 'missingStarInYieldEffectGen',
  },
  {
    column: 17,
    file: 'effect-diagnostics/fixtures/missing-star-in-yield.ts',
    line: 4,
    name: 'missingStarInYieldEffectGen',
  },
  {
    column: 41,
    file: 'effect-diagnostics/fixtures/multiple-effect-provide.ts',
    line: 10,
    name: 'multipleEffectProvide',
  },
  {
    column: 3,
    file: 'effect-diagnostics/fixtures/non-object-service.ts',
    line: 5,
    name: 'nonObjectEffectServiceType',
  },
  {
    column: 3,
    file: 'effect-diagnostics/fixtures/overridden-schema-constructor.ts',
    line: 4,
    name: 'overriddenSchemaConstructor',
  },
  {
    column: 10,
    file: 'effect-diagnostics/fixtures/process-env-in-effect.ts',
    line: 4,
    name: 'processEnvInEffect',
  },
  {
    column: 3,
    file: 'effect-diagnostics/fixtures/return-effect-in-gen.ts',
    line: 4,
    name: 'returnEffectInGen',
  },
  {
    column: 21,
    file: 'effect-diagnostics/fixtures/run-effect-inside-effect.ts',
    line: 4,
    name: 'runEffectInsideEffect',
  },
  {
    column: 10,
    file: 'effect-diagnostics/fixtures/schema-sync-inside.ts',
    line: 8,
    name: 'schemaSyncInEffect',
  },
  {
    column: 24,
    file: 'effect-diagnostics/fixtures/scope-in-layer-effect.ts',
    line: 7,
    name: 'scopeInLayerEffect',
  },
  {
    column: 14,
    file: 'effect-diagnostics/fixtures/unknown-in-effect-catch.ts',
    line: 3,
    name: 'anyUnknownInErrorContext',
  },
  {
    column: 24,
    file: 'effect-diagnostics/fixtures/unknown-in-effect-catch.ts',
    line: 3,
    name: 'anyUnknownInErrorContext',
  },
  {
    column: 24,
    file: 'effect-diagnostics/fixtures/unknown-in-effect-catch.ts',
    line: 3,
    name: 'unknownInEffectCatch',
  },
  {
    column: 24,
    file: 'effect-diagnostics/fixtures/unsafe-effect-type-assertion.ts',
    line: 5,
    name: 'unsafeEffectTypeAssertion',
  },
  {
    column: 1,
    file: 'effect-diagnostics/fixtures/unused-next-line-suppression.ts',
    line: 3,
    name: 'effect(-1)',
  },
];

assert.deepEqual(actual, expected);

const fixtureDirectory = new URL('../effect-diagnostics/fixtures/', import.meta.url);
const triggerFiles = (await readdir(fixtureDirectory))
  .filter((file) => file.endsWith('.ts') && file !== 'schema-sync-outside.ts')
  .map((file) => `effect-diagnostics/fixtures/${file}`)
  .sort();
const diagnosedFiles = [...new Set(actual.map(({ file }) => file))].sort();

assert.deepEqual(diagnosedFiles, triggerFiles, 'Every invalid fixture must produce a blocking diagnostic.');
assert.equal(
  actual.some(({ file }) => file.endsWith('schema-sync-outside.ts')),
  false,
  'Synchronous Schema execution outside an Effect workflow must remain outside schemaSyncInEffect scope.',
);

standardOutput.write(`Verified ${String(actual.length)} blocking Effect diagnostic location(s).\n`);
