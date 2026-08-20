interface WorkflowContract {
  readonly matches: (workflow: string) => boolean;
  readonly violation: string;
}

type YamlRecord = Record<string, unknown>;

interface WorkflowUse {
  readonly container: YamlRecord;
  readonly reference: unknown;
}

function isYamlRecord(value: unknown): value is YamlRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function collectStepUses(stepGroup: unknown, uses: WorkflowUse[]): boolean {
  const pendingGroups: unknown[] = [stepGroup];
  const visitedGroups = new WeakSet<object>();

  while (pendingGroups.length > 0) {
    const steps = pendingGroups.pop();
    if (!Array.isArray(steps)) {
      return false;
    }
    if (visitedGroups.has(steps)) {
      continue;
    }
    visitedGroups.add(steps);

    for (const step of steps) {
      if (!isYamlRecord(step)) {
        return false;
      }
      if (Object.hasOwn(step, 'uses')) {
        uses.push({ container: step, reference: step['uses'] });
      }
      if (Object.hasOwn(step, 'parallel')) {
        pendingGroups.push(step['parallel']);
      }
    }
  }

  return true;
}

function workflowUses(workflow: string): readonly WorkflowUse[] | undefined {
  let parsed: unknown;
  try {
    parsed = Bun.YAML.parse(workflow);
  } catch {
    return undefined;
  }

  if (!isYamlRecord(parsed) || !isYamlRecord(parsed['jobs'])) {
    return undefined;
  }

  const uses: WorkflowUse[] = [];
  for (const job of Object.values(parsed['jobs'])) {
    if (!isYamlRecord(job)) {
      return undefined;
    }
    if (Object.hasOwn(job, 'uses')) {
      uses.push({ container: job, reference: job['uses'] });
    }

    const steps = job['steps'];
    if (steps === undefined) {
      continue;
    }
    if (!collectStepUses(steps, uses)) {
      return undefined;
    }
  }

  return uses;
}

function checkoutStepsDisableCredentials(workflow: string): boolean {
  const uses = workflowUses(workflow);
  if (uses === undefined) {
    return false;
  }

  const checkoutSteps = uses.filter(
    ({ reference }) => typeof reference === 'string' && /^actions\/checkout@/iu.test(reference),
  );
  return (
    checkoutSteps.length > 0 &&
    checkoutSteps.every(({ container }) => {
      const inputs = container['with'];
      if (!isYamlRecord(inputs)) {
        return false;
      }
      const persistCredentials = inputs['persist-credentials'];
      return persistCredentials === false || persistCredentials === 'false';
    })
  );
}

function isNormalizedLocalReference(reference: string): boolean {
  const prefix = reference.startsWith('$/') ? '$/' : reference.startsWith('./') ? './' : undefined;
  if (prefix === undefined) {
    return false;
  }

  const repositoryPath = reference.slice(prefix.length);
  return (
    repositoryPath !== '' &&
    !/[@\\\s]/u.test(repositoryPath) &&
    repositoryPath.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
  );
}

function isNormalizedDockerImage(image: string): boolean {
  const segments = image.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return false;
  }

  const lastIndex = segments.length - 1;
  const lastSegment = segments[lastIndex];
  if (lastSegment === undefined) {
    return false;
  }
  const tagSeparator = lastSegment.indexOf(':');
  if (tagSeparator !== -1) {
    if (tagSeparator !== lastSegment.lastIndexOf(':')) {
      return false;
    }
    const tag = lastSegment.slice(tagSeparator + 1);
    if (!/^\w[\w.-]{0,127}$/u.test(tag)) {
      return false;
    }
    segments[lastIndex] = lastSegment.slice(0, tagSeparator);
  }

  let firstSegment = segments[0];
  if (firstSegment === undefined) {
    return false;
  }
  if (firstSegment.includes(':')) {
    if (segments.length === 1 || firstSegment.indexOf(':') !== firstSegment.lastIndexOf(':')) {
      return false;
    }
    const [registry, port] = firstSegment.split(':');
    if (registry === undefined || port === undefined || !/^\d+$/u.test(port)) {
      return false;
    }
    firstSegment = registry;
    segments[0] = registry;
  }

  const component = /^[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*$/u;
  return component.test(firstSegment) && segments.slice(1).every((segment) => component.test(segment));
}

function isImmutableDockerAction(reference: string): boolean {
  const match = /^docker:\/\/(.+)@sha256:[0-9a-f]{64}$/u.exec(reference);
  return match !== null && isNormalizedDockerImage(match[1] ?? '');
}

function externalActionsAreImmutable(workflow: string): boolean {
  const uses = workflowUses(workflow);
  if (uses === undefined) {
    return false;
  }

  return uses.every(({ reference }) => {
    if (typeof reference !== 'string') {
      return false;
    }
    if (reference.startsWith('./') || reference.startsWith('$')) {
      return isNormalizedLocalReference(reference);
    }
    if (reference.startsWith('docker://')) {
      return isImmutableDockerAction(reference);
    }

    const separator = reference.lastIndexOf('@');
    const actionPath = reference.slice(0, separator);
    const commit = reference.slice(separator + 1);
    const pathSegments = actionPath.split('/');
    return (
      separator > 0 &&
      pathSegments.length >= 2 &&
      pathSegments.every((segment) => segment !== '' && !segment.includes('@') && !/\s/u.test(segment)) &&
      /^[0-9a-f]{40}$/u.test(commit)
    );
  });
}

const topLevelOnKeys = (workflow: string): readonly string[] => {
  const lines = workflow.split(/\r?\n/u);
  const onIndex = lines.findIndex((line) => /^on:\s*(?:#.*)?$/u.test(line));
  if (onIndex === -1) {
    return [];
  }

  const keys: string[] = [];
  for (const line of lines.slice(onIndex + 1)) {
    if (line.trim() === '' || /^\s*#/u.test(line)) {
      continue;
    }
    if (/^\S/u.test(line)) {
      break;
    }

    const key = /^ {2}([^\s:#]+):/u.exec(line)?.[1];
    if (key !== undefined) {
      keys.push(key);
    }
  }

  return keys;
};

const lockedGateFragments: readonly WorkflowContract[] = [
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
  {
    matches: checkoutStepsDisableCredentials,
    violation: 'checkout credentials remain available to later steps',
  },
  {
    matches: externalActionsAreImmutable,
    violation: 'external actions must use immutable references',
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
    matches: (workflow) => topLevelOnKeys(workflow).includes('merge_group'),
    violation: 'missing merge_group trigger for merge queue validation',
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
    matches: (workflow) => {
      const keys = topLevelOnKeys(workflow);
      return keys.length === 1 && keys[0] === 'workflow_dispatch';
    },
    violation: 'catalog workflow must declare exactly the workflow_dispatch trigger',
  },
];

const generatedProfileFragments: typeof lockedGateFragments = [
  {
    matches: (workflow) => workflow.includes('run: mise run ts:install'),
    violation: 'locked dependency installation is not explicit',
  },
  {
    matches: (workflow) =>
      workflow.includes('uses: actions/cache/restore@0057852bfaa89a56745cba8c7296529d2fc39830') &&
      workflow.includes('uses: actions/cache/save@0057852bfaa89a56745cba8c7296529d2fc39830') &&
      !workflow.includes('uses: actions/cache@'),
    violation: 'Stryker cache must use separately pinned restore and save actions',
  },
  {
    matches: (workflow) => (workflow.match(/^\s+path: reports\/stryker-incremental\.json$/gmu) ?? []).length === 2,
    violation: 'only the Stryker incremental report may be cached',
  },
  {
    matches: (workflow) =>
      workflow.includes(
        "hashFiles('.config/mise/conf.d/20-ts.toml', '.config/mise/mise.lock', 'bun.lock', 'bunfig.toml', 'package.json', 'stryker.config.mjs', 'tsconfig.json')",
      ) && workflow.includes('stryker-incremental-v1-'),
    violation: 'Stryker cache key is not fingerprinted by its dependency and configuration inputs',
  },
  {
    matches: (workflow) =>
      workflow.includes(`- name: Validate Stryker incremental state
        id: validate-stryker-cache
        if: \${{ !cancelled() && hashFiles('reports/stryker-incremental.json') != '' }}
        continue-on-error: true
        run: mise run ts:mutants:cache:check`) &&
      workflow.includes("if: ${{ !cancelled() && steps.validate-stryker-cache.outcome == 'success' }}"),
    violation: 'Stryker cache save is not gated by non-cancelled, parseable incremental state',
  },
];

const violationsFor = (workflow: string, contracts: typeof lockedGateFragments): readonly string[] =>
  contracts.flatMap(({ matches, violation }) => (matches(workflow) ? [] : [violation]));

export const qualityWorkflowViolations = (workflow: string): readonly string[] =>
  violationsFor(workflow, [...automaticTriggerFragments, ...lockedGateFragments, ...generatedProfileFragments]);

export const rootQualityWorkflowViolations = (workflow: string): readonly string[] =>
  violationsFor(workflow, [...manualDispatchOnlyFragments, ...lockedGateFragments]);
