import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { argv, stdout } from 'node:process';

import { validateStrykerReport } from './stryker-report-contract.mjs';

const cachePath = argv[2] ?? 'reports/stryker-incremental.json';
const cache = JSON.parse(await readFile(cachePath, 'utf8'));

validateStrykerReport(cache, 'Stryker incremental state');
assert.equal(cache.config?.inPlace, false, 'Cached Stryker state must come from an isolated mutation run.');
assert.equal(cache.config?.incremental, true, 'Cached Stryker state must come from an incremental-enabled run.');
stdout.write(`Validated usable Stryker incremental state in ${cachePath}.\n`);
