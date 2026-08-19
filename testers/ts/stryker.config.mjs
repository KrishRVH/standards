/**
 * Mutation gate: would the tests notice if this code were wrong?
 * - `mise run ts:mutants` runs the full sweep (`--force` bypasses the cache).
 * - `mise run ts:mutants:diff` is the incremental inner loop.
 * - A surviving mutant is a review finding with exactly three exits: the
 *   suite gains a test that kills it, the code loses the branch the suite
 *   cannot reach, or a `// Stryker disable next-line all: <reason>` comment
 *   classifies it as unobservable — a wall edit requiring human countersign.
 * - `thresholds.break` is a coarse regression alarm pinned at the measured
 *   floor, not a per-mutant guarantee: an aggregate score proves no
 *   individual mutant dead. Raising it as mutants die is normal work;
 *   lowering it is a wall edit that requires human countersign. Survivors in
 *   changed code are dispositioned in review, not amortized into the score.
 * - `src/main.ts` is the composition root: side-effectful wiring with no unit
 *   seam, verified by the type gate and the Effect diagnostics instead.
 * - `inPlace` mutates the working tree (and restores it) instead of a sandbox
 *   copy, because the catalog tester's suite reads contract files outside the
 *   project root. A copied project whose tests stay inside the root may drop
 *   it. If a run is killed hard, `git status` shows any leftover mutation.
 * - `coverageAnalysis`, `incrementalFile`, and `thresholds.high`/`low` pin
 *   Stryker's current defaults so an upstream change cannot silently move
 *   the reporting surface; only `break` is load-bearing.
 * - Stryker's own CLI is not yet Bun-clean (Babel CJS interop), so the
 *   ts:mutants tasks run it under the pinned Node while tests still run
 *   under Bun.
 */
// eslint-disable-next-line no-restricted-exports -- Stryker loads its config through a default export by contract.
export default {
  testRunner: 'bun',
  plugins: ['@hughescr/stryker-bun-runner'],
  coverageAnalysis: 'perTest',
  inPlace: true,
  mutate: ['src/**/*.ts', '!src/main.ts'],
  incremental: true,
  incrementalFile: 'reports/stryker-incremental.json',
  reporters: ['clear-text', 'progress'],
  thresholds: { high: 80, low: 60, break: 66 },
  bun: { timeout: 10000 },
};
