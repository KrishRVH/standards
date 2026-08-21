#!/usr/bin/env bun
/** Check the host-enforced governance contracts shipped by automatic profiles. */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { devNull, tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const AUTOMATIC_PROFILE_PATHS = {
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
const FULL_COMMIT_SHA = /^[0-9a-f]{40}$/u;
const IMMUTABLE_DOCKER_ACTION = /^docker:\/\/(.+)@sha256:[0-9a-f]{64}$/u;
const DOCKER_NAME_COMPONENT = /^[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*$/u;
const DOCKER_TAG = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/u;

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function displayPath(path) {
  return relative(ROOT, path).replaceAll('\\', '/');
}

function actionlintErrors(document, description) {
  const result = Bun.spawnSync({
    cmd: ['actionlint', '-'],
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
      ? `${description} failed actionlint with exit code ${result.exitCode}`
      : `${description} is not a valid GitHub Actions workflow:\n${diagnostic}`,
  ];
}

function parseWorkflow(document, description) {
  const errors = actionlintErrors(document, description);
  if (errors.length !== 0) {
    return { errors, workflow: undefined };
  }
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

function workflowUses(workflow, description) {
  const jobs = workflow.jobs;
  if (!isRecord(jobs)) {
    return { errors: [`${description} must contain a jobs mapping`], uses: [] };
  }

  const errors = [];
  const uses = [];
  for (const [jobName, job] of Object.entries(jobs)) {
    if (!isRecord(job)) {
      errors.push(`${description} job ${JSON.stringify(jobName)} must be a mapping`);
      continue;
    }
    if (Object.hasOwn(job, 'uses')) {
      uses.push({ container: job, reference: job.uses });
    }

    if (job.steps === undefined) {
      continue;
    }
    if (!Array.isArray(job.steps)) {
      errors.push(`${description} job ${JSON.stringify(jobName)} steps must be a sequence`);
      continue;
    }
    for (const [index, step] of job.steps.entries()) {
      if (!isRecord(step)) {
        errors.push(`${description} job ${JSON.stringify(jobName)} step ${index} must be a mapping`);
      } else if (Object.hasOwn(step, 'uses')) {
        uses.push({ container: step, reference: step.uses });
      }
    }
  }
  return { errors, uses };
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

function workflowContractErrors(document, description) {
  const parsed = parseWorkflow(document, description);
  if (parsed.workflow === undefined) {
    return parsed.errors;
  }

  const errors = [...parsed.errors];
  const triggers = parsed.workflow.on;
  if (!isRecord(triggers)) {
    errors.push(`${description} must contain one top-level on mapping`);
  } else {
    for (const trigger of ['pull_request', 'push', 'workflow_dispatch', 'merge_group']) {
      if (!Object.hasOwn(triggers, trigger)) {
        errors.push(`${description} missing ${trigger} trigger`);
      }
    }
    if (Object.hasOwn(triggers, 'pull_request_target')) {
      errors.push(`${description} must not use pull_request_target`);
    }
  }

  const jobs = parsed.workflow.jobs;
  if (!isRecord(jobs) || Object.keys(jobs).length !== 1 || !isRecord(jobs.quality)) {
    errors.push(`${description} must contain exactly one quality job`);
  }

  const collected = workflowUses(parsed.workflow, description);
  errors.push(...collected.errors);
  const checkoutSteps = collected.uses.filter(
    ({ reference }) => typeof reference === 'string' && reference.startsWith('actions/checkout@'),
  );
  if (
    checkoutSteps.length === 0 ||
    checkoutSteps.some(({ container }) => {
      const inputs = container.with;
      if (!isRecord(inputs)) {
        return true;
      }
      return inputs['persist-credentials'] !== false && inputs['persist-credentials'] !== 'false';
    })
  ) {
    errors.push(`every checkout in ${description} must set persist-credentials: false`);
  }

  for (const { reference } of collected.uses) {
    if (typeof reference !== 'string' || !isImmutableActionReference(reference)) {
      errors.push(`every external action in ${description} must use an immutable reference`);
    }
  }
  return errors;
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
  const secureWorkflow = `on:
  pull_request:
  push:
  workflow_dispatch:
  merge_group:
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@${commit}
        with:
          persist-credentials: false
`;
  if (workflowContractErrors(secureWorkflow, 'secure fixture').length !== 0) {
    errors.push('governance parser rejected a secure workflow');
  }

  for (const duplicate of [
    secureWorkflow.replace('  push:\n', '  push:\n  push:\n'),
    secureWorkflow.replace('  quality:\n', '  quality:\n  quality:\n'),
  ]) {
    if (workflowContractErrors(duplicate, 'duplicate-key fixture').length === 0) {
      errors.push('governance parser accepted a duplicate workflow mapping key');
    }
  }

  const explicitMutableKey = secureWorkflow.replace(
    `      - uses: actions/checkout@${commit}`,
    `      - ? uses\n        : jdx/mise-action@v4\n      - uses: actions/checkout@${commit}`,
  );
  if (
    !workflowContractErrors(explicitMutableKey, 'explicit-key fixture').some((error) =>
      error.includes('immutable'),
    )
  ) {
    errors.push('governance parser ignored a mutable action behind an explicit YAML key');
  }

  for (const target of [
    `owner/../action@${commit}`,
    `owner/./action@${commit}`,
    `owner\\action@${commit}`,
  ]) {
    const malformed = secureWorkflow.replace(
      `      - uses: actions/checkout@${commit}`,
      `      - uses: ${JSON.stringify(target)}\n      - uses: actions/checkout@${commit}`,
    );
    if (workflowContractErrors(malformed, 'malformed-action fixture').length === 0) {
      errors.push(
        `governance parser accepted malformed external action reference ${JSON.stringify(target)}`,
      );
    }
  }

  const blockScalarDecoy = secureWorkflow.replace(
    `      - uses: actions/checkout@${commit}`,
    `      - run: |\n          uses: example/action@v1\n      - uses: actions/checkout@${commit}`,
  );
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

async function checkAutomaticProfileGovernance() {
  const errors = await checkParserContracts();
  const rootWorkflowPath = join(ROOT, '.github', 'workflows', 'quality.yml');
  try {
    const rootWorkflow = await readFile(rootWorkflowPath, 'utf8');
    errors.push(...actionlintErrors(rootWorkflow, displayPath(rootWorkflowPath)));
  } catch {
    errors.push(`missing root workflow ${displayPath(rootWorkflowPath)}`);
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
      !pullRequestTemplate.includes('surviv') ||
      !pullRequestTemplate.includes('source reason') ||
      !['classified', 'ignored', 'skipped'].some((word) => pullRequestTemplate.includes(word))
    ) {
      errors.push(
        `${profileId}: ${displayPath(pullRequestTemplatePath)} must request both surviving ` +
          'and source-reasoned classified mutation results',
      );
    }
  }
  return errors;
}

const errors = await checkAutomaticProfileGovernance();
if (errors.length !== 0) {
  for (const error of errors) {
    console.error(error);
  }
  process.exitCode = 1;
}
