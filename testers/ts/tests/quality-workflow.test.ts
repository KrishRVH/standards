import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { URL, fileURLToPath } from 'node:url';

import { qualityWorkflowViolations, rootQualityWorkflowViolations } from './support/workflow-contract.js';

test('the generated quality workflow automatically runs the locked mandatory gate', async () => {
  const workflowPath = fileURLToPath(new URL('../.github/workflows/quality.yml', import.meta.url));
  const workflow = await readFile(workflowPath, 'utf8');

  expect(qualityWorkflowViolations(workflow)).toEqual([]);
});

test('the standards repository workflow is manual-dispatch-only with the same locked gate', async () => {
  const workflowPath = fileURLToPath(new URL('../../../.github/workflows/quality.yml', import.meta.url));
  const workflow = await readFile(workflowPath, 'utf8');

  expect(rootQualityWorkflowViolations(workflow)).toEqual([]);
});
