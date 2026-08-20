import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { argv, stdout } from 'node:process';

import { validateStrykerReport } from './stryker-report-contract.mjs';

const mode = argv[2];
const reportPath = argv[3] ?? 'reports/mutation/mutation.json';

assert.ok(
  mode === 'full' || mode === 'incremental',
  'Usage: check-stryker-report.mjs <full|incremental> [report-path]',
);

const report = JSON.parse(await readFile(reportPath, 'utf8'));

const mutants = validateStrykerReport(report, 'Stryker report');
assert.equal(typeof report.config, 'object', 'Stryker report.config must be an object.');
assert.notEqual(report.config, null, 'Stryker report.config must be an object.');
assert.equal(Array.isArray(report.config), false, 'Stryker report.config must be an object.');
assert.equal(report.config?.inPlace, false, 'Stryker must execute in its isolated sandbox.');
assert.equal(
  report.config?.jsonReporter?.fileName,
  'reports/mutation/mutation.json',
  'Stryker used an unexpected machine-report path.',
);
assert.equal(report.config.concurrency, 2, 'Stryker must use exactly two mutation workers.');
assert.equal(report.config.timeoutMS, 30000, 'Stryker core must use 30 seconds of absolute timeout deviation.');
assert.equal(report.config?.bun?.timeout, 60000, 'The Bun test runner must use a 60-second hard child timeout.');
assert.ok(mutants.length > 0, 'Stryker report contains no mutants.');

const timeoutCount = mutants.filter((mutant) => mutant.status === 'Timeout').length;
const maximumTimeouts = Math.max(1, Math.floor(mutants.length / 100));
assert.ok(
  timeoutCount <= maximumTimeouts,
  `Stryker reported ${String(timeoutCount)} timed-out mutant(s); at most ${String(maximumTimeouts)} are allowed. Timeouts count as detected and can inflate the mutation score, so investigate runner load or the affected mutants.`,
);

if (mode === 'full') {
  assert.equal(report.config.force, true, 'The full mutation report must prove that Stryker ran with force=true.');
  const freshlyTested = mutants.filter(
    (mutant) =>
      ['Killed', 'Survived'].includes(mutant.status) &&
      Number.isInteger(mutant.testsCompleted) &&
      mutant.testsCompleted > 0,
  );

  assert.ok(
    freshlyTested.length > 0,
    'The full Stryker run produced no Killed or Survived mutant with positive testsCompleted evidence.',
  );
  stdout.write(`Validated ${String(freshlyTested.length)} freshly tested mutant(s) in ${reportPath}.\n`);
} else {
  assert.equal(
    report.config.force,
    false,
    'The incremental mutation report must prove that Stryker ran with force=false.',
  );
  assert.equal(
    report.config.incremental,
    true,
    'The incremental mutation report must prove that Stryker ran with incremental=true.',
  );
  const testedOrReused = mutants.filter((mutant) => ['Killed', 'Survived', 'Timeout'].includes(mutant.status));

  assert.ok(testedOrReused.length > 0, 'The incremental Stryker run produced no tested or compatibly reused outcome.');
  stdout.write(
    `Validated ${String(testedOrReused.length)} tested or compatibly reused mutant outcome(s) in ${reportPath}.\n`,
  );
}
