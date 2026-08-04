const automaticQualityFragments: readonly {
  readonly matches: (workflow: string) => boolean;
  readonly violation: string;
}[] = [
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

const generatedProfileFragments: typeof automaticQualityFragments = [
  {
    matches: (workflow) => workflow.includes('run: mise run ts:install'),
    violation: 'locked dependency installation is not explicit',
  },
];

const violationsFor = (workflow: string, contracts: typeof automaticQualityFragments): readonly string[] =>
  contracts.flatMap(({ matches, violation }) => (matches(workflow) ? [] : [violation]));

export const qualityWorkflowViolations = (workflow: string): readonly string[] =>
  violationsFor(workflow, [...automaticQualityFragments, ...generatedProfileFragments]);

export const rootQualityWorkflowViolations = (workflow: string): readonly string[] =>
  violationsFor(workflow, automaticQualityFragments);
