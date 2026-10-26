#!/usr/bin/env bun
/** Check that the catalog ships no workflow and the governance contracts its automatic profiles ship. */

import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { devNull, tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MUTATION_PROFILE_PATHS = {
  csharp: [
    '.github/CODEOWNERS',
    'src/Project/Service.cs',
    'tests/Project.Tests/ServiceTests.cs',
  ],
  python: [
    '.github/CODEOWNERS',
    'src/project_name/service.py',
    'tests/test_service.py',
  ],
  rust: [
    '.github/CODEOWNERS',
    'crates/member/src/lib.rs',
    'src/lib.rs',
    'tests/service.rs',
  ],
  ts: [
    '.github/CODEOWNERS',
    'packages/app/src/index.ts',
    'src/index.ts',
    'tests/service.test.ts',
  ],
};
const AUTOMATIC_PROFILE_PATHS = {
  ...MUTATION_PROFILE_PATHS,
  swift: [
    '.github/CODEOWNERS',
    'src/Project/Port.swift',
    'tests/ProjectTests/PortTests.swift',
  ],
};
const FULL_COMMIT_SHA = /^[0-9a-f]{40}$/u;
const IMMUTABLE_DOCKER_ACTION = /^docker:\/\/(.+)@sha256:[0-9a-f]{64}$/u;
const DOCKER_NAME_COMPONENT = /^[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*$/u;
const DOCKER_TAG = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/u;
const AUTOMATIC_TRIGGERS = ['pull_request', 'push', 'workflow_dispatch', 'merge_group'];
const CONCURRENCY_GROUP =
  'quality-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}';
const CANCEL_PULL_REQUEST_RUNS = "${{ github.event_name == 'pull_request' }}";

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function displayPath(path) {
  return relative(ROOT, path).replaceAll('\\', '/');
}

function jactionlintErrors(document, description) {
  const result = Bun.spawnSync({
    cmd: ['jactionlint', '--profile', 'default', '--no-ignores', '--strict-exit', '-'],
    stdin: new TextEncoder().encode(document),
    stderr: 'pipe',
    stdout: 'pipe',
  });
  if (result.exitCode === 0) {
    return [];
  }

  const diagnostic = result.stdout.toString().trim() || result.stderr.toString().trim();
  return [
    diagnostic === ''
      ? `${description} failed jactionlint with exit code ${result.exitCode}`
      : `${description} failed jactionlint:\n${diagnostic}`,
  ];
}

function parseWorkflow(document, description) {
  try {
    const workflow = Bun.YAML.parse(document);
    if (!isRecord(workflow)) {
      return { errors: [`${description} must contain a YAML mapping`], workflow: undefined };
    }
    return { errors: [], workflow };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { errors: [`${description} contains invalid YAML: ${reason}`], workflow: undefined };
  }
}

function collectSteps(steps, location, errors) {
  const collected = [];
  // A YAML alias can reuse a parallel group or nest one inside itself, so each
  // group is walked once; jactionlint rejects nested and recursive groups.
  const walked = new WeakSet();
  const groups = [steps];
  while (groups.length > 0) {
    const group = groups.pop();
    if (!Array.isArray(group)) {
      errors.push(`${location} steps must be a sequence`);
    } else if (!walked.has(group)) {
      walked.add(group);
      for (const step of group) {
        if (!isRecord(step)) {
          errors.push(`${location} steps must be mappings`);
        } else {
          collected.push(step);
          if (Object.hasOwn(step, 'parallel')) {
            groups.push(step.parallel);
          }
        }
      }
    }
  }
  return collected;
}

function workflowJobs(workflow, description) {
  if (!isRecord(workflow.jobs)) {
    return { errors: [`${description} must contain a jobs mapping`], jobs: [] };
  }

  const errors = [];
  const jobs = [];
  for (const [name, job] of Object.entries(workflow.jobs)) {
    const location = `${description} job ${JSON.stringify(name)}`;
    if (!isRecord(job)) {
      errors.push(`${location} must be a mapping`);
    } else {
      const steps = job.steps === undefined ? [] : collectSteps(job.steps, location, errors);
      jobs.push({ job, name, steps });
    }
  }
  return { errors, jobs };
}

function isNormalizedLocalReference(target) {
  const prefix = target.startsWith('$/') ? '$/' : target.startsWith('./') ? './' : undefined;
  if (prefix === undefined) {
    return false;
  }
  const repositoryPath = target.slice(prefix.length);
  return (
    repositoryPath !== '' &&
    !/[@\\\s]/u.test(repositoryPath) &&
    repositoryPath
      .split('/')
      .every((segment) => segment !== '' && segment !== '.' && segment !== '..')
  );
}

function isNormalizedDockerImage(image) {
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
    if (!DOCKER_TAG.test(tag)) {
      return false;
    }
    segments[lastIndex] = lastSegment.slice(0, tagSeparator);
  }

  const firstSegment = segments[0];
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
    segments[0] = registry;
  }
  return segments.every((segment) => DOCKER_NAME_COMPONENT.test(segment));
}

function isImmutableActionReference(target) {
  if (target.startsWith('./') || target.startsWith('$')) {
    return isNormalizedLocalReference(target);
  }
  if (target.startsWith('docker://')) {
    const match = IMMUTABLE_DOCKER_ACTION.exec(target);
    return match !== null && isNormalizedDockerImage(match[1] ?? '');
  }

  const separator = target.lastIndexOf('@');
  const actionPath = target.slice(0, separator);
  const commit = target.slice(separator + 1);
  const pathSegments = actionPath.split('/');
  return (
    separator > 0 &&
    pathSegments.length >= 2 &&
    pathSegments.every(
      (segment) =>
        segment !== '' &&
        segment !== '.' &&
        segment !== '..' &&
        !segment.includes('@') &&
        !/[\\\s]/u.test(segment),
    ) &&
    FULL_COMMIT_SHA.test(commit)
  );
}

// Automatic templates validate every pull request, merge-queue entry, and push
// to main, and cancel only a pull request's superseded runs.
function automaticRunErrors(workflow, description) {
  const errors = [];
  const triggers = workflow.on;
  if (!isRecord(triggers)) {
    errors.push(`${description} must contain one top-level on mapping`);
  } else {
    for (const trigger of AUTOMATIC_TRIGGERS) {
      if (!Object.hasOwn(triggers, trigger)) {
        errors.push(`${description} missing ${trigger} trigger`);
      }
    }
    if (Object.hasOwn(triggers, 'pull_request_target')) {
      errors.push(`${description} must not use pull_request_target`);
    }
    if (Object.hasOwn(triggers, 'pull_request') && triggers.pull_request !== null) {
      errors.push(`${description} must not filter pull_request events`);
    }
    if (
      Object.hasOwn(triggers, 'push') &&
      JSON.stringify(triggers.push) !== JSON.stringify({ branches: ['main'] })
    ) {
      errors.push(`${description} push trigger must select only the main branch`);
    }
  }

  const concurrency = workflow.concurrency;
  if (
    !isRecord(concurrency) ||
    concurrency.group !== CONCURRENCY_GROUP ||
    concurrency['cancel-in-progress'] !== CANCEL_PULL_REQUEST_RUNS
  ) {
    errors.push(`${description} must cancel only superseded pull-request runs`);
  }
  return errors;
}

// Every workflow runs the locked gate from one stable quality check, with
// hardened checkout and immutable action references.
function gateContractErrors(workflow, description) {
  const { errors, jobs } = workflowJobs(workflow, description);
  const quality =
    isRecord(workflow.jobs) && Object.keys(workflow.jobs).length === 1
      ? jobs.find(({ name }) => name === 'quality')
      : undefined;
  if (quality === undefined) {
    errors.push(`${description} must contain exactly one quality job`);
  } else {
    if (quality.job.name !== 'quality') {
      errors.push(`${description} quality job must keep the check name quality for branch protection`);
    }
    if (!isRecord(quality.job.env) || quality.job.env.MISE_LOCKED !== '1') {
      errors.push(`${description} quality job must set MISE_LOCKED to '1'`);
    }
    if (
      !quality.steps.some(
        ({ run }) => typeof run === 'string' && run.trim() === 'mise run standards:check',
      )
    ) {
      errors.push(`${description} quality job must run mise run standards:check`);
    }
  }

  const actionUsers = jobs
    .flatMap(({ job, steps }) => [job, ...steps])
    .filter((container) => Object.hasOwn(container, 'uses'));
  const checkouts = actionUsers.filter(
    ({ uses }) => typeof uses === 'string' && /^actions\/checkout@/iu.test(uses),
  );
  if (
    checkouts.length === 0 ||
    checkouts.some(
      (step) =>
        !isRecord(step.with) ||
        (step.with['persist-credentials'] !== false && step.with['persist-credentials'] !== 'false'),
    )
  ) {
    errors.push(`every checkout in ${description} must set persist-credentials: false`);
  }

  for (const { uses } of actionUsers) {
    if (typeof uses !== 'string' || !isImmutableActionReference(uses)) {
      errors.push(`every external action in ${description} must use an immutable reference`);
    }
  }
  return errors;
}

function workflowStructureErrors(document, description) {
  const parsed = parseWorkflow(document, description);
  if (parsed.workflow === undefined) {
    return parsed.errors;
  }
  return [
    ...automaticRunErrors(parsed.workflow, description),
    ...gateContractErrors(parsed.workflow, description),
  ];
}

function workflowContractErrors(document, description) {
  // The contract checks run even when jactionlint fails, so its findings never
  // hide theirs.
  return [
    ...jactionlintErrors(document, description),
    ...workflowStructureErrors(document, description),
  ];
}

function parseCodeownerRules(document) {
  return document
    .split(/\r?\n/u)
    .map((line) => line.split('#', 1)[0]?.trim() ?? '')
    .filter((line) => line !== '')
    .map((line) => {
      const [pattern, ...owners] = line.split(/\s+/u);
      return { owners, pattern: pattern ?? '' };
    });
}

async function effectiveCodeowners(rules, candidates) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'standards-codeowners-'));
  try {
    const environment = { ...process.env, GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_NOSYSTEM: '1' };
    const initialization = Bun.spawnSync({
      cmd: ['git', 'init', '--quiet', temporaryRoot],
      env: environment,
      stderr: 'pipe',
      stdout: 'pipe',
    });
    if (initialization.exitCode !== 0) {
      return { error: initialization.stderr.toString().trim(), ownersByPath: new Map() };
    }

    await writeFile(join(temporaryRoot, '.gitignore'), `${rules.map(({ pattern }) => pattern).join('\n')}\n`);
    const result = Bun.spawnSync({
      cmd: ['git', 'check-ignore', '--no-index', '--verbose', '--stdin'],
      cwd: temporaryRoot,
      env: environment,
      stdin: new TextEncoder().encode(`${candidates.join('\n')}\n`),
      stderr: 'pipe',
      stdout: 'pipe',
    });
    if (result.exitCode !== 0 && result.exitCode !== 1) {
      return { error: result.stderr.toString().trim(), ownersByPath: new Map() };
    }

    const ownersByPath = new Map();
    for (const line of result.stdout.toString().trim().split('\n')) {
      if (line === '') {
        continue;
      }
      const [metadata, candidate] = line.split('\t');
      const lineNumber = Number.parseInt(metadata?.split(':', 3)[1] ?? '', 10);
      const rule = rules[lineNumber - 1];
      if (candidate !== undefined && rule !== undefined) {
        ownersByPath.set(candidate, rule.owners);
      }
    }
    return { error: undefined, ownersByPath };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), ownersByPath: new Map() };
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

async function codeownerContractErrors(document, candidates, description) {
  const errors = [];
  const rules = parseCodeownerRules(document);
  if (!rules.some(({ owners, pattern }) => pattern === '*' && owners.includes('@OWNER'))) {
    errors.push(`${description} must contain the catch-all '* @OWNER' rule`);
  }
  for (const { owners, pattern } of rules) {
    if (!owners.includes('@OWNER')) {
      errors.push(
        `${description} rule ${JSON.stringify(pattern)} overrides the catch-all without retaining @OWNER`,
      );
    }
  }

  const effective = await effectiveCodeowners(rules, candidates);
  if (effective.error !== undefined) {
    errors.push(`could not exercise ${description}: ${effective.error}`);
  } else {
    for (const candidate of candidates) {
      if (!effective.ownersByPath.get(candidate)?.includes('@OWNER')) {
        errors.push(`${description} does not effectively assign ${candidate} to @OWNER`);
      }
    }
  }
  return errors;
}

async function checkParserContracts() {
  const errors = [];
  const commit = '0123456789abcdef0123456789abcdef01234567';
  const digest = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const checkout = `actions/checkout@${commit}`;
  const automaticTriggers =
    'on:\n  pull_request:\n  push:\n    branches: [main]\n  workflow_dispatch:\n  merge_group:\n';
  const secureWorkflow = `${automaticTriggers}permissions:
  contents: read
concurrency:
  group: ${CONCURRENCY_GROUP}
  cancel-in-progress: ${CANCEL_PULL_REQUEST_RUNS}
jobs:
  quality:
    name: quality
    runs-on: ubuntu-26.04
    timeout-minutes: 10
    env:
      MISE_LOCKED: '1'
    steps:
      - uses: ${checkout}
        with:
          persist-credentials: false
      - run: mise run standards:check
`;
  const withStep = (workflow, step) => workflow.replace('    steps:\n', `    steps:\n${step}\n`);
  const withAction = (workflow, reference) =>
    withStep(workflow, `      - uses: ${JSON.stringify(reference)}`);
  const withReusableWorkflow = (workflow, reference) =>
    `${workflow}  contract:\n    uses: ${JSON.stringify(reference)}\n`;
  const immutable = 'immutable reference';
  const credentials = 'persist-credentials: false';

  const reports = (fixture, fragment) =>
    workflowStructureErrors(fixture, 'contract fixture').some((error) =>
      error.includes(fragment),
    );
  const rejects = (label, fixture, fragment) => {
    if (!reports(fixture, fragment)) {
      errors.push(`governance parser accepted ${label}`);
    }
  };
  const accepts = (label, fixture, fragment) => {
    if (reports(fixture, fragment)) {
      errors.push(`governance parser rejected ${label}`);
    }
  };

  const secureErrors = workflowContractErrors(secureWorkflow, 'secure fixture');
  if (secureErrors.length !== 0) {
    errors.push(`governance parser rejected a secure workflow:\n${secureErrors.join('\n')}`);
  }

  // The policy rules come only from jactionlint's default profile, and the
  // checker applies no ignore comment.
  const withoutTimeout = secureWorkflow.replace('    timeout-minutes: 10\n', '');
  for (const [rule, fixture, failure] of [
    [
      '[missing-permissions]',
      secureWorkflow.replace('permissions:\n  contents: read\n', ''),
      "does not enforce jactionlint's [missing-permissions] rule",
    ],
    ['[missing-timeout]', withoutTimeout, "does not enforce jactionlint's [missing-timeout] rule"],
    [
      '[missing-timeout]',
      withoutTimeout.replace('  quality:\n', '  quality: # jactionlint ignore=missing-timeout\n'),
      'honored a jactionlint ignore comment',
    ],
    // Bun.YAML keeps the last duplicate, so only jactionlint's rule catches it.
    [
      '[duplicate-key]',
      secureWorkflow.replace('  push:\n', '  push:\n  push:\n'),
      'accepted a duplicate trigger key',
    ],
    [
      '[duplicate-key]',
      secureWorkflow.replace('  quality:\n', '  quality:\n  quality:\n'),
      'accepted a duplicate job key',
    ],
    [
      '[recursive-alias]',
      withStep(secureWorkflow, '      - parallel: &steps\n          - parallel: *steps'),
      'accepted a recursive parallel group',
    ],
  ]) {
    if (
      !workflowContractErrors(fixture, 'policy fixture').some((error) =>
        error.includes(rule),
      )
    ) {
      errors.push(`governance parser ${failure}`);
    }
  }

  for (const [label, fixture, fragment] of [
    [
      'an on sequence',
      secureWorkflow.replace(
        automaticTriggers,
        'on: [pull_request, push, workflow_dispatch, merge_group]\n',
      ),
      'one top-level on mapping',
    ],
    ['a missing merge_group trigger', secureWorkflow.replace('  merge_group:\n', ''), 'merge_group'],
    [
      'pull_request_target',
      secureWorkflow.replace('  merge_group:\n', '  merge_group:\n  pull_request_target:\n'),
      'pull_request_target',
    ],
    [
      'a filtered pull_request trigger',
      secureWorkflow.replace('  pull_request:\n', '  pull_request:\n    branches: [main]\n'),
      'must not filter pull_request',
    ],
    [
      'a push trigger beyond main',
      secureWorkflow.replace('branches: [main]', 'branches: [main, release]'),
      'push trigger',
    ],
    [
      'cancellation of main-branch runs',
      secureWorkflow.replace(`cancel-in-progress: ${CANCEL_PULL_REQUEST_RUNS}`, 'cancel-in-progress: true'),
      'superseded pull-request runs',
    ],
    [
      'a second job',
      `${secureWorkflow}  other:\n    runs-on: ubuntu-26.04\n    timeout-minutes: 10\n    steps:\n      - run: echo other\n`,
      'exactly one quality job',
    ],
    ['an unnamed quality check', secureWorkflow.replace('    name: quality\n', ''), 'check name'],
    ['an unlocked gate', secureWorkflow.replace("MISE_LOCKED: '1'", "MISE_LOCKED: '0'"), 'MISE_LOCKED'],
    [
      'a workflow without the gate',
      secureWorkflow.replace('mise run standards:check', 'mise run lint'),
      'mise run standards:check',
    ],
    [
      'a credential-persisting checkout',
      secureWorkflow.replace(credentials, 'persist-credentials: true'),
      credentials,
    ],
    [
      'a checkout without inputs',
      secureWorkflow.replace(`        with:\n          ${credentials}\n`, ''),
      credentials,
    ],
    [
      'a block-scalar checkout input',
      secureWorkflow.replace(
        `          ${credentials}\n`,
        `          fetch-depth: |\n            ${credentials}\n`,
      ),
      credentials,
    ],
    ['a differently cased checkout', withAction(secureWorkflow, `Actions/Checkout@${commit}`), credentials],
    ['a floating action tag', secureWorkflow.replace(checkout, 'actions/checkout@v7'), immutable],
    [
      'a mutable action behind an explicit YAML key',
      withStep(secureWorkflow, '      - ? uses\n        : jdx/mise-action@v4'),
      immutable,
    ],
  ]) {
    rejects(label, fixture, fragment);
  }

  // Same-repository references resolve at the running commit; external ones
  // name a full commit or an image digest.
  for (const [reference, place] of [
    ['$/.github/actions/contract', withAction],
    ['./.github/actions/contract', withAction],
    ['$/.github/workflows/contract.yml', withReusableWorkflow],
    ['./.github/workflows/contract.yml', withReusableWorkflow],
    [`docker://alpine@sha256:${digest}`, withAction],
    [`docker://alpine:3.20@sha256:${digest}`, withAction],
    [`docker://registry.example.com:5000/owner/image:stable@sha256:${digest}`, withAction],
  ]) {
    accepts(`action reference ${reference}`, place(secureWorkflow, reference), immutable);
  }
  for (const reference of [
    `owner/../action@${commit}`,
    `owner/./action@${commit}`,
    `owner\\action@${commit}`,
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
  ]) {
    for (const place of [withAction, withReusableWorkflow]) {
      rejects(`action reference ${JSON.stringify(reference)}`, place(secureWorkflow, reference), immutable);
    }
  }

  for (const [layout, mutableGroup, unhardenedGroup] of [
    [
      'block',
      '      - parallel:\n          - parallel:\n              - uses: example/action@v1',
      `      - parallel:\n          - uses: ${checkout}`,
    ],
    [
      'flow',
      '      - { parallel: [ { parallel: [ { uses: example/action@v1 } ] } ] }',
      `      - { parallel: [ { uses: ${checkout} } ] }`,
    ],
  ]) {
    const mutable = withStep(secureWorkflow, mutableGroup);
    const unhardened = withStep(secureWorkflow, unhardenedGroup);
    rejects(`a mutable action in a ${layout} parallel group`, mutable, immutable);
    accepts(`a ${layout} parallel group's pinned action as a checkout`, mutable, credentials);
    rejects(`an unhardened checkout in a ${layout} parallel group`, unhardened, credentials);
    accepts(`a ${layout} parallel group's pinned checkout as mutable`, unhardened, immutable);
  }
  const reusedGroup = withStep(
    secureWorkflow,
    `      - parallel: &shared\n          - uses: ${checkout}\n            with:\n              ${credentials}\n      - parallel: *shared`,
  );
  accepts('a reused parallel group of pinned actions', reusedGroup, immutable);
  accepts('a reused parallel group of hardened checkouts', reusedGroup, credentials);

  for (const [spelling, hardened, mutable] of [
    [
      'quoted and spaced key',
      `      - "uses" : ${checkout}\n        "with" : { "persist-credentials" : false }`,
      '      - "uses" : actions/checkout@v7',
    ],
    [
      'flow mapping key',
      `      - { 'uses': ${checkout}, with: { 'persist-credentials': false } }`,
      "      - { 'uses': actions/checkout@v7 }",
    ],
    [
      'Unicode-escaped key',
      `      - "u\\u0073es": ${checkout}\n        with: { persist-credentials: false }`,
      '      - "u\\u0073es": actions/checkout@v7',
    ],
  ]) {
    for (const fragment of [immutable, credentials]) {
      accepts(`a hardened checkout behind a ${spelling}`, withStep(secureWorkflow, hardened), fragment);
      rejects(`a mutable checkout behind a ${spelling}`, withStep(secureWorkflow, mutable), fragment);
    }
  }

  const blockScalarDecoy = withStep(secureWorkflow, '      - run: |\n          uses: example/action@v1');
  if (workflowContractErrors(blockScalarDecoy, 'block-scalar fixture').length !== 0) {
    errors.push('governance parser treated block-scalar contents as workflow structure');
  }

  const codeownerErrors = await codeownerContractErrors(
    '* @OWNER\nsrc/ @OTHER\n',
    ['README.md', 'src/project/main.py'],
    'override fixture',
  );
  if (!codeownerErrors.some((error) => error.includes('src/project/main.py'))) {
    errors.push('CODEOWNERS contract ignored a later source ownership override');
  }
  return errors;
}

async function checkGovernance() {
  const errors = await checkParserContracts();
  // The catalog runs every gate locally. GitHub runs only root workflows, so
  // the template copies stay inert here.
  const rootWorkflows = join(ROOT, '.github', 'workflows');
  for (const name of await readdir(rootWorkflows).catch(() => [])) {
    errors.push(
      `${displayPath(join(rootWorkflows, name))}: the catalog verifies locally and ships no workflow`,
    );
  }

  const manifestPath = join(ROOT, 'standards.manifest.toml');
  const manifest = Bun.TOML.parse(await readFile(manifestPath, 'utf8'));
  const profiles =
    isRecord(manifest) && isRecord(manifest.profiles) ? manifest.profiles : undefined;
  if (profiles === undefined) {
    return [...errors, 'standards.manifest.toml must contain a [profiles] table'];
  }

  for (const [profileId, candidates] of Object.entries(AUTOMATIC_PROFILE_PATHS)) {
    const profile = profiles[profileId];
    if (!isRecord(profile) || typeof profile.template !== 'string') {
      errors.push(`automatic profile missing from manifest: ${profileId}`);
      continue;
    }

    const template = join(ROOT, profile.template);
    const codeownersPath = join(template, '.github', 'CODEOWNERS');
    const workflowPath = join(template, '.github', 'workflows', 'quality.yml');
    const readmePath = join(template, 'README.md');
    const pullRequestTemplatePath = join(template, '.github', 'pull_request_template.md');
    const requiredFiles = [codeownersPath, workflowPath, readmePath, pullRequestTemplatePath];
    const documents = await Promise.all(
      requiredFiles.map(async (path) => {
        try {
          return await readFile(path, 'utf8');
        } catch {
          errors.push(`${profileId}: missing governance file ${displayPath(path)}`);
          return undefined;
        }
      }),
    );
    if (documents.some((document) => document === undefined)) {
      continue;
    }

    const [codeowners, workflow, readmeDocument, pullRequestTemplateDocument] = documents;
    errors.push(
      ...(await codeownerContractErrors(codeowners, candidates, displayPath(codeownersPath))).map(
        (error) => `${profileId}: ${error}`,
      ),
    );
    errors.push(
      ...workflowContractErrors(workflow, displayPath(workflowPath)).map(
        (error) => `${profileId}: ${error}`,
      ),
    );

    const readme = readmeDocument.toLowerCase().split(/\s+/u).join(' ');
    for (const phrase of [
      'require the `quality` job',
      'code owner review',
      'dismiss stale approvals',
      'disallow protection',
    ]) {
      if (!readme.includes(phrase)) {
        errors.push(
          `${profileId}: ${displayPath(readmePath)} missing host-setting contract: ${phrase}`,
        );
      }
    }

    const pullRequestTemplate = pullRequestTemplateDocument
      .toLowerCase()
      .split(/\s+/u)
      .join(' ');
    if (
      Object.hasOwn(MUTATION_PROFILE_PATHS, profileId) &&
      (!pullRequestTemplate.includes('surviv') ||
        !pullRequestTemplate.includes('source reason') ||
        !['classified', 'ignored', 'skipped'].some((word) => pullRequestTemplate.includes(word)))
    ) {
      errors.push(
        `${profileId}: ${displayPath(pullRequestTemplatePath)} must request both surviving ` +
          'and source-reasoned classified mutation results',
      );
    }
  }
  return errors;
}

const errors = await checkGovernance();
if (errors.length !== 0) {
  for (const error of errors) {
    console.error(error);
  }
  process.exitCode = 1;
}
