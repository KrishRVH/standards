const lockedGateFragments: readonly {
  readonly matches: (workflow: string) => boolean;
  readonly violation: string;
}[] = [
  {
    matches: (workflow) =>
      workflow.includes(`jobs:
  quality:
    name: quality`),
    violation: 'missing stable quality job name for branch protection',
  },
  {
    matches: (workflow) => /^\s+MISE_LOCKED:\s+['"]1['"]\s*$/mu.test(workflow),
    violation: 'mise locked mode is not enabled',
  },
  {
    matches: (workflow) => workflow.includes('run: mise run standards:check'),
    violation: 'mandatory standards gate is not invoked',
  },
];

const automaticTriggerFragments: typeof lockedGateFragments = [
  {
    matches: (workflow) =>
      workflow.includes(`on:
  pull_request:
  push:
    branches:
      - main
  workflow_dispatch:`),
    violation: 'missing pull_request, main push, or workflow_dispatch trigger',
  },
  {
    matches: (workflow) =>
      workflow.includes(`concurrency:
  group: quality-\${{ github.workflow }}-\${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: \${{ github.event_name == 'pull_request' }}`),
    violation: 'cancellation must be limited to superseded pull-request runs',
  },
];

// The catalog repository runs its gate locally before push and dispatches
// hosted runs on demand; automatic triggers are a deliberate downstream-only
// contract. Both absences are asserted so trigger drift fails in either
// direction.
const manualDispatchOnlyFragments: typeof lockedGateFragments = [
  {
    matches: (workflow) =>
      workflow.includes(`on:
  workflow_dispatch:`),
    violation: 'missing manual workflow_dispatch trigger',
  },
  {
    matches: (workflow) => !workflow.includes('pull_request'),
    violation: 'catalog workflow must not run automatically for pull requests',
  },
  {
    matches: (workflow) => !/^\s+push:\s*$/mu.test(workflow),
    violation: 'catalog workflow must not run automatically on push',
  },
];

const generatedProfileFragments: typeof lockedGateFragments = [
  {
    matches: (workflow) => workflow.includes('run: mise run ts:install'),
    violation: 'locked dependency installation is not explicit',
  },
];

const violationsFor = (workflow: string, contracts: typeof lockedGateFragments): readonly string[] =>
  contracts.flatMap(({ matches, violation }) => (matches(workflow) ? [] : [violation]));

export const qualityWorkflowViolations = (workflow: string): readonly string[] =>
  violationsFor(workflow, [...automaticTriggerFragments, ...lockedGateFragments, ...generatedProfileFragments]);

export const rootQualityWorkflowViolations = (workflow: string): readonly string[] =>
  violationsFor(workflow, [...manualDispatchOnlyFragments, ...lockedGateFragments]);
