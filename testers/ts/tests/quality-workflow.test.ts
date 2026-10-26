import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';

// scripts/check-profile-governance.mjs enforces the workflow contract every
// profile shares; these tests cover the steps the TypeScript gate adds.
const templateWorkflow = (): Promise<string> =>
  readFile(new URL('../.github/workflows/quality.yml', import.meta.url), 'utf8');

const strykerCacheInputs =
  "hashFiles('.config/mise/conf.d/20-ts.toml', '.config/mise/mise.lock', 'bun.lock', 'bunfig.toml', 'package.json', 'stryker.config.mjs', 'tsconfig.json')";

test('the template quality workflow installs locked dependencies explicitly', async () => {
  expect(await templateWorkflow()).toContain('run: mise run ts:install');
});

test('the template quality workflow restores and saves Stryker state through separately pinned actions', async () => {
  const workflow = await templateWorkflow();

  expect(workflow).toMatch(/^\s+uses: actions\/cache\/restore@[0-9a-f]{40}(?:\s+#.*)?$/mu);
  expect(workflow).toMatch(/^\s+uses: actions\/cache\/save@[0-9a-f]{40}(?:\s+#.*)?$/mu);
  expect(workflow).not.toContain('uses: actions/cache@');
});

test('the template quality workflow caches only the Stryker incremental report', async () => {
  const workflow = await templateWorkflow();

  expect(workflow.match(/^\s+path: .*$/gmu)).toEqual([
    '          path: reports/stryker-incremental.json',
    '          path: reports/stryker-incremental.json',
  ]);
});

test('the template quality workflow keys Stryker state by its dependency and configuration inputs', async () => {
  const keys = (await templateWorkflow()).split('\n').filter((line) => line.includes('stryker-incremental-v1-'));

  expect(keys.length).toBeGreaterThan(0);
  for (const key of keys) {
    expect(key).toContain(`stryker-incremental-v1-\${{ runner.os }}-\${{ ${strykerCacheInputs} }}-`);
  }
});

test('the template quality workflow saves Stryker state only after a non-cancelled run validates it', async () => {
  const workflow = await templateWorkflow();

  expect(workflow).toContain(`- name: Validate Stryker incremental state
        id: validate-stryker-cache
        if: \${{ !cancelled() && hashFiles('reports/stryker-incremental.json') != '' }}
        continue-on-error: true
        run: mise run ts:mutants:cache:check`);
  expect(workflow).toContain("if: ${{ !cancelled() && steps.validate-stryker-cache.outcome == 'success' }}");
});
