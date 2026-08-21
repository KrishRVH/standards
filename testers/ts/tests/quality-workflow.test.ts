import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { sep } from 'node:path';
import { URL, fileURLToPath } from 'node:url';

import { qualityWorkflowViolations, rootQualityWorkflowViolations } from './support/workflow-contract.js';

const externalActionPinViolation = 'external actions must use immutable references';
const checkoutCredentialsViolation = 'checkout credentials remain available to later steps';
const pinnedCheckout = 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1';

function withActionStep(workflow: string, reference: string): string {
  return workflow.replace(
    '      - name: Install pinned tools\n',
    [
      '      - name: Run local contract action',
      `        uses: ${JSON.stringify(reference)}`,
      '      - name: Install pinned tools',
      '',
    ].join('\n'),
  );
}

function withReusableWorkflowJob(workflow: string, reference: string): string {
  return `${workflow.trimEnd()}\n  local-contract:\n    uses: ${JSON.stringify(reference)}\n`;
}

function withParallelGroup(workflow: string, group: string): string {
  return workflow.replace('      - name: Install pinned tools\n', `${group}\n      - name: Install pinned tools\n`);
}

function isMutationSandbox(): boolean {
  if (process.env['STANDARDS_STRYKER_SANDBOX'] !== '1') {
    return false;
  }

  const testerPath = fileURLToPath(new URL('..', import.meta.url));
  expect(testerPath).toContain(`${sep}.stryker-tmp${sep}`);
  return true;
}

test('the generated quality workflow automatically runs the locked mandatory gate', async () => {
  const workflowPath = fileURLToPath(new URL('../.github/workflows/quality.yml', import.meta.url));
  const workflow = await readFile(workflowPath, 'utf8');

  expect(qualityWorkflowViolations(workflow)).toEqual([]);
});

test('the generated quality workflow requires merge-queue validation', async () => {
  const workflowPath = fileURLToPath(new URL('../.github/workflows/quality.yml', import.meta.url));
  const workflow = await readFile(workflowPath, 'utf8');
  const withoutMergeGroup = workflow.replace('  merge_group:\n', '');

  expect(qualityWorkflowViolations(withoutMergeGroup)).toContain(
    'missing merge_group trigger for merge queue validation',
  );
});

test('the generated quality workflow rejects floating external action tags', async () => {
  const workflowPath = fileURLToPath(new URL('../.github/workflows/quality.yml', import.meta.url));
  const workflow = await readFile(workflowPath, 'utf8');
  const withFloatingCheckout = workflow.replace(/actions\/checkout@[0-9a-f]{40}/u, 'actions/checkout@v7');

  expect(qualityWorkflowViolations(withFloatingCheckout)).toContain(externalActionPinViolation);
});

test('external action paths reject traversal and non-portable separators', async () => {
  const workflowPath = fileURLToPath(new URL('../.github/workflows/quality.yml', import.meta.url));
  const workflow = await readFile(workflowPath, 'utf8');
  const commit = '0123456789abcdef0123456789abcdef01234567';

  for (const reference of [`owner/../action@${commit}`, `owner/./action@${commit}`, `owner\\action@${commit}`]) {
    expect(qualityWorkflowViolations(withActionStep(workflow, reference)), reference).toContain(
      externalActionPinViolation,
    );
  }
});

test('same-repository action and reusable-workflow references resolve at the running commit', async () => {
  const workflowPath = fileURLToPath(new URL('../.github/workflows/quality.yml', import.meta.url));
  const workflow = await readFile(workflowPath, 'utf8');
  const localReferences = [
    { reference: '$/.github/actions/contract', transform: withActionStep },
    { reference: './.github/actions/contract', transform: withActionStep },
    { reference: '$/.github/workflows/contract.yml', transform: withReusableWorkflowJob },
    { reference: './.github/workflows/contract.yml', transform: withReusableWorkflowJob },
  ] as const;

  for (const localReference of localReferences) {
    const violations = qualityWorkflowViolations(localReference.transform(workflow, localReference.reference));
    expect(violations, localReference.reference).not.toContain(externalActionPinViolation);
  }
});

test('malformed running-commit references cannot bypass external action pins', async () => {
  const workflowPath = fileURLToPath(new URL('../.github/workflows/quality.yml', import.meta.url));
  const workflow = await readFile(workflowPath, 'utf8');
  const commit = '0123456789abcdef0123456789abcdef01234567';
  const invalidReferences = [
    '$',
    `$actions/contract@${commit}`,
    `$$/actions/contract@${commit}`,
    '$/',
    '$//actions/contract',
    '$/actions//contract',
    '$/actions/../contract',
    '$/actions/./contract',
    '$/actions\\contract',
    '$/actions contract',
    '$/actions/contract/',
    '$/actions/contract@v1',
    `$/actions/contract@${commit}`,
    './',
    './/actions/contract',
    './../outside',
    './actions//contract',
    './actions/../contract',
    './actions/./contract',
    './actions\\contract',
    './actions contract',
    './actions/contract/',
    './actions/contract@v1',
    `./actions/contract@${commit}`,
  ] as const;
  const locations = [withActionStep, withReusableWorkflowJob] as const;

  for (const reference of invalidReferences) {
    for (const location of locations) {
      const violations = qualityWorkflowViolations(location(workflow, reference));
      expect(violations, reference).toContain(externalActionPinViolation);
    }
  }
});

test('Docker container actions accept an immutable image digest', async () => {
  const workflowPath = fileURLToPath(new URL('../.github/workflows/quality.yml', import.meta.url));
  const workflow = await readFile(workflowPath, 'utf8');
  const digest = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const references = [
    `docker://alpine@sha256:${digest}`,
    `docker://alpine:3.20@sha256:${digest}`,
    `docker://registry.example.com:5000/owner/image:stable@sha256:${digest}`,
  ] as const;

  for (const reference of references) {
    const violations = qualityWorkflowViolations(withActionStep(workflow, reference));
    expect(violations, reference).not.toContain(externalActionPinViolation);
  }
});

test('Docker container actions reject mutable and malformed image references', async () => {
  const workflowPath = fileURLToPath(new URL('../.github/workflows/quality.yml', import.meta.url));
  const workflow = await readFile(workflowPath, 'utf8');
  const digest = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const invalidReferences = [
    'docker://alpine',
    'docker://alpine:3.20',
    `docker://@sha256:${digest}`,
    'docker://alpine@sha256:',
    `docker://alpine@sha256:${digest.slice(1)}`,
    `docker://alpine@sha256:${digest}0`,
    `docker://alpine@sha256:${digest.toUpperCase()}`,
    `docker://alpine@SHA256:${digest}`,
    `docker://alpine@sha256:${digest}@extra`,
    `docker://alpine//child@sha256:${digest}`,
    `docker://alpine/../child@sha256:${digest}`,
    `docker://alpine\\child@sha256:${digest}`,
    `docker://alpine child@sha256:${digest}`,
    `docker://\${{github.repository}}@sha256:${digest}`,
  ] as const;

  for (const reference of invalidReferences) {
    const violations = qualityWorkflowViolations(withActionStep(workflow, reference));
    expect(violations, reference).toContain(externalActionPinViolation);
  }
});

const parallelLayouts = [
  {
    mutableAction: ['      - parallel:', '          - parallel:', '              - uses: example/action@v1'].join('\n'),
    name: 'nested block',
    unhardenedCheckout: ['      - parallel:', `          - uses: ${pinnedCheckout}`].join('\n'),
  },
  {
    mutableAction: '      - { parallel: [ { parallel: [ { uses: example/action@v1 } ] } ] }',
    name: 'nested flow',
    unhardenedCheckout: `      - { parallel: [ { uses: ${pinnedCheckout} } ] }`,
  },
] as const;

for (const layout of parallelLayouts) {
  test(`the generated workflow rejects a mutable external action in a ${layout.name} parallel group`, async () => {
    const workflowPath = fileURLToPath(new URL('../.github/workflows/quality.yml', import.meta.url));
    const workflow = await readFile(workflowPath, 'utf8');
    const violations = qualityWorkflowViolations(withParallelGroup(workflow, layout.mutableAction));

    expect(violations).toContain(externalActionPinViolation);
    expect(violations).not.toContain(checkoutCredentialsViolation);
  });

  test(`the generated workflow rejects an unhardened checkout in a ${layout.name} parallel group`, async () => {
    const workflowPath = fileURLToPath(new URL('../.github/workflows/quality.yml', import.meta.url));
    const workflow = await readFile(workflowPath, 'utf8');
    const violations = qualityWorkflowViolations(withParallelGroup(workflow, layout.unhardenedCheckout));

    expect(violations).not.toContain(externalActionPinViolation);
    expect(violations).toContain(checkoutCredentialsViolation);
  });
}

test('cyclic parallel aliases fail closed', async () => {
  const workflowPath = fileURLToPath(new URL('../.github/workflows/quality.yml', import.meta.url));
  const workflow = await readFile(workflowPath, 'utf8');
  const cyclicParallelGroup = ['      - parallel: &parallel-steps', '          - parallel: *parallel-steps'].join('\n');
  const violations = qualityWorkflowViolations(withParallelGroup(workflow, cyclicParallelGroup));

  expect(violations).toContain(externalActionPinViolation);
  expect(violations).toContain(checkoutCredentialsViolation);
});

test('reused parallel aliases retain their pinned and hardened action contract', async () => {
  const workflowPath = fileURLToPath(new URL('../.github/workflows/quality.yml', import.meta.url));
  const workflow = await readFile(workflowPath, 'utf8');
  const sharedParallelGroup = [
    '      - parallel: &shared-steps',
    `          - uses: ${pinnedCheckout}`,
    '            with:',
    '              persist-credentials: false',
    '      - parallel: *shared-steps',
  ].join('\n');
  const violations = qualityWorkflowViolations(withParallelGroup(workflow, sharedParallelGroup));

  expect(violations).not.toContain(externalActionPinViolation);
  expect(violations).not.toContain(checkoutCredentialsViolation);
});

const hiddenCheckoutSpellings = [
  {
    hardenedStep: [
      '      - name: Hidden quoted checkout',
      `        "uses" : ${pinnedCheckout}`,
      '        "with" : { "persist-credentials" : false }',
    ].join('\n'),
    mutableStep: ['      - name: Hidden quoted checkout', '        "uses" : actions/checkout@v7'].join('\n'),
    name: 'quoted and spaced key',
  },
  {
    hardenedStep: `      - { name: Hidden flow checkout, 'uses': ${pinnedCheckout}, with: { 'persist-credentials': false } }`,
    mutableStep: "      - { name: Hidden flow checkout, 'uses': actions/checkout@v7 }",
    name: 'flow mapping key',
  },
  {
    hardenedStep: [
      '      - name: Hidden escaped checkout',
      `        "u\\u0073es": ${pinnedCheckout}`,
      '        with: { persist-credentials: false }',
    ].join('\n'),
    mutableStep: ['      - name: Hidden escaped checkout', '        "u\\u0073es": actions/checkout@v7'].join('\n'),
    name: 'Unicode-escaped scalar key',
  },
] as const;

for (const spelling of hiddenCheckoutSpellings) {
  test(`the generated workflow recognizes and rejects a mutable checkout hidden behind a ${spelling.name}`, async () => {
    const workflowPath = fileURLToPath(new URL('../.github/workflows/quality.yml', import.meta.url));
    const workflow = await readFile(workflowPath, 'utf8');
    const withHardenedCheckout = workflow.replace(
      '      - name: Install pinned tools\n',
      `${spelling.hardenedStep}\n      - name: Install pinned tools\n`,
    );
    const withHiddenCheckout = workflow.replace(
      '      - name: Install pinned tools\n',
      `${spelling.mutableStep}\n      - name: Install pinned tools\n`,
    );
    const hardenedViolations = qualityWorkflowViolations(withHardenedCheckout);
    const violations = qualityWorkflowViolations(withHiddenCheckout);

    expect(hardenedViolations).not.toContain(externalActionPinViolation);
    expect(hardenedViolations).not.toContain('checkout credentials remain available to later steps');
    expect(violations).toContain(externalActionPinViolation);
    expect(violations).toContain('checkout credentials remain available to later steps');
  });
}

test('the standards repository workflow is manual-dispatch-only with the same locked gate', async () => {
  if (isMutationSandbox()) {
    return;
  }

  const workflowPath = fileURLToPath(new URL('../../../.github/workflows/quality.yml', import.meta.url));
  const workflow = await readFile(workflowPath, 'utf8');

  expect(rootQualityWorkflowViolations(workflow)).toEqual([]);
});

const forbiddenCatalogTriggers = [
  { name: 'merge group', yaml: '  merge_group:' },
  { name: 'schedule', yaml: "  schedule:\n    - cron: '0 0 * * *'" },
] as const;

for (const trigger of forbiddenCatalogTriggers) {
  test(`the standards repository workflow rejects a top-level ${trigger.name} trigger`, async () => {
    if (isMutationSandbox()) {
      return;
    }

    const workflowPath = fileURLToPath(new URL('../../../.github/workflows/quality.yml', import.meta.url));
    const workflow = await readFile(workflowPath, 'utf8');
    const withForbiddenTrigger = workflow.replace(
      'on:\n  workflow_dispatch:\n',
      `on:\n  workflow_dispatch:\n${trigger.yaml}\n`,
    );

    expect(rootQualityWorkflowViolations(withForbiddenTrigger)).toContain(
      'catalog workflow must declare exactly the workflow_dispatch trigger',
    );
  });
}

test('every catalog checkout step disables persisted credentials', async () => {
  if (isMutationSandbox()) {
    return;
  }

  const workflowPath = fileURLToPath(new URL('../../../.github/workflows/quality.yml', import.meta.url));
  const workflow = await readFile(workflowPath, 'utf8');
  const withUnhardenedCheckout = workflow.replace(
    '      - name: Install pinned tools\n',
    [
      '      - name: Unhardened duplicate checkout',
      '        uses: actions/checkout@deadbeef',
      '      - name: Install pinned tools',
      '',
    ].join('\n'),
  );

  expect(rootQualityWorkflowViolations(withUnhardenedCheckout)).toContain(
    'checkout credentials remain available to later steps',
  );
});

test('a block-scalar checkout input cannot impersonate credential hardening', async () => {
  if (isMutationSandbox()) {
    return;
  }

  const workflowPath = fileURLToPath(new URL('../../../.github/workflows/quality.yml', import.meta.url));
  const workflow = await readFile(workflowPath, 'utf8');
  const withBlockScalarDecoy = workflow.replace(
    '          persist-credentials: false\n',
    '          fetch-depth: |\n            persist-credentials: false\n',
  );

  expect(rootQualityWorkflowViolations(withBlockScalarDecoy)).toContain(
    'checkout credentials remain available to later steps',
  );
});

test('the catalog workflow rejects floating external action tags', async () => {
  if (isMutationSandbox()) {
    return;
  }

  const workflowPath = fileURLToPath(new URL('../../../.github/workflows/quality.yml', import.meta.url));
  const workflow = await readFile(workflowPath, 'utf8');
  const withFloatingMiseAction = workflow.replace(/jdx\/mise-action@[0-9a-f]{40}/u, 'jdx/mise-action@v4');

  expect(rootQualityWorkflowViolations(withFloatingMiseAction)).toContain(externalActionPinViolation);
});
