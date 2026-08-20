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
 * - `src/main.*` is the composition root under every supported source suffix:
 *   side-effectful wiring with no unit seam, verified by the preflight gates.
 * - Mutation runs use Stryker's isolated sandbox. The tester skips its one
 *   catalog-root workflow assertion only inside that sandbox; the mandatory
 *   preflight proves the assertion before any source is mutated.
 * - `coverageAnalysis`, `incrementalFile`, and `thresholds.high`/`low` pin
 *   Stryker's current defaults so an upstream change cannot silently move
 *   the reporting surface; only `break` is load-bearing.
 * - Stryker 9.6.1 still fails under Bun 1.4.0 at Babel generator interop, so
 *   the ts:mutants tasks run its CLI under pinned Node while tests run under
 *   Bun.
 * - Stryker core gets 30 seconds of absolute timeout deviation in addition to
 *   its measured-run factor, under the Bun runner's 60-second hard ceiling.
 *   Ordinary host load must not turn survivors into score-inflating timeouts.
 * - Two mutation workers leave capacity for Bun's child processes and for a
 *   second fixture gate in the repository aggregate; CPU-count concurrency
 *   oversubscribes the host and makes timeout outcomes load-dependent.
 */
// eslint-disable-next-line no-restricted-exports -- Stryker loads its config through a default export by contract.
export default {
  testRunner: 'bun',
  plugins: ['@hughescr/stryker-bun-runner'],
  coverageAnalysis: 'perTest',
  inPlace: false,
  mutate: ['src/**/*.{cts,mts,ts,tsx}', '!src/main.{cts,mts,ts,tsx}'],
  incremental: true,
  incrementalFile: 'reports/stryker-incremental.json',
  concurrency: 2,
  reporters: ['clear-text', 'progress', 'json'],
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  thresholds: { high: 80, low: 60, break: 66 },
  timeoutMS: 30000,
  bun: { env: { STANDARDS_STRYKER_SANDBOX: '1' }, timeout: 60000 },
};
