/**
 * Mutation gate: would the tests notice if this code were wrong?
 * - `mise run ts:mutants` runs the full sweep (`--force` bypasses the cache).
 * - `mise run ts:mutants:diff` is the incremental inner loop.
 * - A surviving mutant is a review finding with exactly two exits: the suite
 *   gains a test that kills it, or the code loses the branch the suite cannot
 *   reach. `thresholds.break` is a ratchet pinned at the measured floor —
 *   raising it as mutants die is normal work; lowering it is a wall edit that
 *   requires human countersign.
 * - `src/main.ts` is the composition root: side-effectful wiring with no unit
 *   seam, verified by the type gate and the Effect diagnostics instead.
 * - `inPlace` mutates the working tree (and restores it) instead of a sandbox
 *   copy, because the suite reads contract files outside the project root. If
 *   a run is killed hard, `git status` shows any leftover mutation.
 * - Stryker's own CLI is not yet Bun-clean (Babel CJS interop), so the mutants
 *   scripts run it under the pinned Node while tests still run under Bun.
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
  thresholds: { high: 80, low: 70, break: 65 },
  bun: { timeout: 10000 },
};
