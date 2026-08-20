import assert from 'node:assert/strict';

export const terminalMutantStatuses = new Set([
  'CompileError',
  'Ignored',
  'Killed',
  'NoCoverage',
  'RuntimeError',
  'Survived',
  'Timeout',
]);

function assertRecord(value, message) {
  assert.equal(typeof value, 'object', message);
  assert.notEqual(value, null, message);
  assert.equal(Array.isArray(value), false, message);
}

function assertPosition(position, description) {
  assertRecord(position, `${description} must be an object.`);
  assert.ok(Number.isInteger(position.line) && position.line >= 1, `${description}.line must be an integer >= 1.`);
  assert.ok(
    Number.isInteger(position.column) && position.column >= 1,
    `${description}.column must be an integer >= 1.`,
  );
}

function assertMutant(mutant, description) {
  assertRecord(mutant, `${description} must be an object.`);
  assert.equal(typeof mutant.id, 'string', `${description}.id must be a string.`);
  assert.equal(typeof mutant.mutatorName, 'string', `${description}.mutatorName must be a string.`);
  assertRecord(mutant.location, `${description}.location must be an object.`);
  assertPosition(mutant.location.start, `${description}.location.start`);
  assertPosition(mutant.location.end, `${description}.location.end`);
  assert.ok(
    terminalMutantStatuses.has(mutant.status),
    `${description}.status must be a terminal Stryker 9.6.1 status; received ${String(mutant.status)}.`,
  );

  if (mutant.testsCompleted !== undefined) {
    assert.equal(
      typeof mutant.testsCompleted,
      'number',
      `${description}.testsCompleted must be a number when present.`,
    );
  }
}

/**
 * Validate the required mutation-testing-report-schema fields emitted by
 * Stryker 9.6.1. Optional presentation metadata stays Stryker-owned.
 */
export function validateStrykerReport(report, description) {
  assertRecord(report, `${description} must be a JSON object.`);
  assert.match(
    report.schemaVersion,
    /^([12])(\.(([1-9]\d*)|0)){0,2}$/u,
    `${description}.schemaVersion is not compatible with the Stryker 9.6.1 report schema.`,
  );
  assertRecord(report.thresholds, `${description}.thresholds must be an object.`);

  for (const threshold of ['high', 'low']) {
    const value = report.thresholds[threshold];
    assert.ok(
      Number.isInteger(value) && value >= 0 && value <= 100,
      `${description}.thresholds.${threshold} must be an integer from 0 through 100.`,
    );
  }

  assertRecord(report.files, `${description}.files must be an object.`);

  const mutants = [];
  for (const [fileName, file] of Object.entries(report.files)) {
    const fileDescription = `${description}.files[${JSON.stringify(fileName)}]`;
    assertRecord(file, `${fileDescription} must be an object.`);
    assert.equal(typeof file.language, 'string', `${fileDescription}.language must be a string.`);
    assert.equal(typeof file.source, 'string', `${fileDescription}.source must be a string.`);
    assert.ok(Array.isArray(file.mutants), `${fileDescription}.mutants must be an array.`);

    for (const [index, mutant] of file.mutants.entries()) {
      assertMutant(mutant, `${fileDescription}.mutants[${String(index)}]`);
      mutants.push(mutant);
    }
  }

  return mutants;
}
