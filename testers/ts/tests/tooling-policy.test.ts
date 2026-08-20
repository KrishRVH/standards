import { expect, test } from 'bun:test';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { URL, fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const directiveSourceExtensions = ['cjs', 'cts', 'js', 'jsx', 'mjs', 'mts', 'ts', 'tsx'] as const;
const applicationSourceGlob = 'src/**/*.{cts,mts,ts,tsx}';
const compositionRootSourceGlob = 'src/main.{cts,mts,ts,tsx}';
const compositionRootGlob = '!src/main.{cts,mts,ts,tsx}';

async function runScript(
  script: string,
  arguments_: readonly string[],
): Promise<{ code: number; stderr: string; stdout: string }> {
  const child = Bun.spawn([process.execPath, fileURLToPath(new URL(script, import.meta.url)), ...arguments_], {
    cwd: projectRoot,
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const [code, stderr, stdout] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
    new Response(child.stdout).text(),
  ]);

  return { code, stderr, stdout };
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function waitForPath(target: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await pathExists(target)) {
      return;
    }
    await Bun.sleep(10);
  }

  throw new Error(`Timed out waiting for ${target}.`);
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !(typeof error === 'object' && error !== null && 'code' in error && error.code === 'ESRCH');
  }
}

async function waitForProcessExit(pid: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (!processExists(pid)) {
      return;
    }
    await Bun.sleep(10);
  }

  throw new Error(`Timed out waiting for process ${String(pid)} to exit.`);
}

const directiveCases: readonly {
  readonly accepted: boolean;
  readonly name: string;
  readonly source: string;
}[] = [
  {
    accepted: true,
    name: 'reasoned single-line exceptions',
    source: [
      '// eslint-disable-next-line no-console -- CLI output is the command contract.',
      "console.log('ready');",
      '// @ts-expect-error -- the negative fixture deliberately violates the type.',
      'const value: never = true;',
      '// Stryker disable next-line all: the platform branch is unobservable in this fixture.',
      'const platform = 1;',
    ].join('\n'),
  },
  {
    accepted: true,
    name: 'directive-like string contents',
    source: "const example = 'eslint-disable @ts-ignore Stryker disable all';\n",
  },
  {
    accepted: true,
    name: 'ordinary lowercase ESLint prose and JSX text',
    source: [
      '// eslint keeps the policy mechanical without owning ordinary prose.',
      '// eslint-enable-next-line is not an ESLint directive.',
      'export const copy = <p>eslint-disable is visible interface text</p>;',
    ].join('\n'),
  },
  {
    accepted: true,
    name: 'ordinary Stryker prose',
    source: '// Stryker runs mutations in an isolated sandbox.\n',
  },
  {
    accepted: false,
    name: 'reasonless ESLint exceptions',
    source: '// eslint-disable-next-line no-console\n',
  },
  {
    accepted: false,
    name: 'block ESLint exceptions',
    source: '/* eslint-disable-next-line no-console -- too broad */\n',
  },
  {
    accepted: false,
    name: 'self-suppressed exception controls',
    source: '// eslint-disable-next-line @eslint-community/eslint-comments/no-use -- bypass the exception protocol.\n',
  },
  {
    accepted: false,
    name: 'inline-config self-disable exploit',
    source: '/* eslint @eslint-community/eslint-comments/no-use: off -- disable the protocol itself. */\n',
  },
  {
    accepted: false,
    name: 'reasoned block no-restricted-syntax disable',
    source: '/* eslint-disable no-restricted-syntax -- bypass the state wall. */\n',
  },
  {
    accepted: false,
    name: 'inline global declaration',
    source: '/* global hiddenState:readonly */\n',
  },
  {
    accepted: false,
    name: 'non-expiring TypeScript exceptions',
    source: '// @ts-ignore -- this escape does not expire.\n',
  },
  {
    accepted: false,
    name: 'unreasoned Stryker classifications',
    source: '// Stryker disable next-line all\n',
  },
];

test('the out-of-band directive policy accepts only narrow reasoned exceptions', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'standards-ts-directives-'));

  try {
    for (const directiveCase of directiveCases) {
      const sourcePath = path.join(directory, `${directiveCase.name.replaceAll(' ', '-')}.ts`);
      await writeFile(sourcePath, directiveCase.source, 'utf8');
      const result = await runScript('../scripts/check-directives.mjs', [sourcePath]);

      expect(result.code, `${directiveCase.name}: ${result.stderr}`).toBe(directiveCase.accepted ? 0 : 1);
    }
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test('the directive scanner discovers every JavaScript-like tooling extension', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'standards-ts-directive-extensions-'));

  try {
    for (const extension of directiveSourceExtensions) {
      await writeFile(
        path.join(directory, `reasonless.${extension}`),
        '// eslint-disable-next-line no-console\n',
        'utf8',
      );
    }

    const result = await runScript('../scripts/check-directives.mjs', [directory]);
    expect(result.code).toBe(1);
    for (const extension of directiveSourceExtensions) {
      expect(result.stderr).toContain(`reasonless.${extension}`);
    }
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

function mutant(status: string, testsCompleted?: number): object {
  return {
    id: `mutant-${status}`,
    location: { start: { column: 1, line: 1 }, end: { column: 2, line: 1 } },
    mutatorName: 'StringLiteral',
    status,
    ...(testsCompleted === undefined ? {} : { testsCompleted }),
  };
}

function mutationReport(
  statuses: readonly { readonly status: string; readonly testsCompleted?: number }[],
  options: {
    readonly bunTimeout?: number;
    readonly concurrency?: number;
    readonly force?: boolean;
    readonly inPlace?: boolean;
    readonly incremental?: boolean;
    readonly timeoutMS?: number;
  } = {},
) {
  return {
    config: {
      bun: { timeout: options.bunTimeout ?? 60000 },
      concurrency: options.concurrency ?? 2,
      force: options.force ?? true,
      inPlace: options.inPlace ?? false,
      incremental: options.incremental ?? true,
      jsonReporter: { fileName: 'reports/mutation/mutation.json' },
      timeoutMS: options.timeoutMS ?? 30000,
    },
    files: {
      'src/example.ts': {
        language: 'typescript',
        mutants: statuses.map(({ status, testsCompleted }) => mutant(status, testsCompleted)),
        source: 'export const example = true;\n',
      },
    },
    schemaVersion: '1.0',
    thresholds: { high: 80, low: 60 },
  };
}

test('the mutation report gate distinguishes fresh full evidence from compatible incremental reuse', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'standards-ts-mutation-report-'));

  try {
    const validForMalformedFile = mutationReport([{ status: 'Killed', testsCompleted: 1 }]);
    const malformedFile = {
      ...validForMalformedFile,
      files: { ...validForMalformedFile.files, 'src/broken.ts': { mutants: [] } },
    };
    const validForMalformedMutant = mutationReport([{ status: 'Killed', testsCompleted: 1 }]);
    const malformedMutant = {
      ...validForMalformedMutant,
      files: {
        ...validForMalformedMutant.files,
        'src/example.ts': {
          ...validForMalformedMutant.files['src/example.ts'],
          mutants: [...validForMalformedMutant.files['src/example.ts'].mutants, { status: 'Killed' }],
        },
      },
    };

    const cases = [
      {
        accepted: true,
        mode: 'full',
        name: 'freshly-executed',
        output: 'freshly tested mutant(s)',
        report: mutationReport([{ status: 'Killed', testsCompleted: 1 }]),
      },
      {
        accepted: false,
        mode: 'full',
        name: 'all-timeout',
        report: mutationReport([{ status: 'Timeout' }]),
      },
      {
        accepted: true,
        mode: 'full',
        name: 'terminal-statuses',
        output: 'freshly tested mutant(s)',
        report: mutationReport([
          { status: 'Killed', testsCompleted: 1 },
          { status: 'Survived', testsCompleted: 1 },
          { status: 'NoCoverage' },
          { status: 'CompileError' },
          { status: 'RuntimeError' },
          { status: 'Timeout' },
          { status: 'Ignored' },
        ]),
      },
      {
        accepted: false,
        mode: 'full',
        name: 'timeout-score-inflation',
        report: mutationReport([{ status: 'Killed', testsCompleted: 1 }, { status: 'Timeout' }, { status: 'Timeout' }]),
      },
      {
        accepted: true,
        mode: 'incremental',
        name: 'compatibly-reused',
        output: 'tested or compatibly reused mutant outcome(s)',
        report: mutationReport([{ status: 'Killed' }], { force: false }),
      },
      {
        accepted: false,
        mode: 'full',
        name: 'not-executed',
        report: mutationReport([{ status: 'NoCoverage' }]),
      },
      {
        accepted: false,
        mode: 'full',
        name: 'ignored',
        report: mutationReport([{ status: 'Ignored' }]),
      },
      {
        accepted: false,
        mode: 'full',
        name: 'zero-tests',
        report: mutationReport([{ status: 'Survived', testsCompleted: 0 }]),
      },
      {
        accepted: false,
        mode: 'full',
        name: 'mixed-pending',
        report: mutationReport([{ status: 'Killed', testsCompleted: 1 }, { status: 'Pending' }]),
      },
      {
        accepted: false,
        mode: 'full',
        name: 'mixed-unknown',
        report: mutationReport([{ status: 'Killed', testsCompleted: 1 }, { status: 'FutureStatus' }]),
      },
      {
        accepted: false,
        mode: 'full',
        name: 'wrong-full-mode',
        report: mutationReport([{ status: 'Killed', testsCompleted: 1 }], { force: false }),
      },
      {
        accepted: false,
        mode: 'incremental',
        name: 'wrong-incremental-force',
        report: mutationReport([{ status: 'Killed' }]),
      },
      {
        accepted: false,
        mode: 'incremental',
        name: 'incremental-disabled',
        report: mutationReport([{ status: 'Killed' }], { force: false, incremental: false }),
      },
      {
        accepted: false,
        mode: 'full',
        name: 'in-place',
        report: mutationReport([{ status: 'Killed', testsCompleted: 1 }], { inPlace: true }),
      },
      {
        accepted: false,
        mode: 'full',
        name: 'unbounded-concurrency',
        report: mutationReport([{ status: 'Killed', testsCompleted: 1 }], { concurrency: 24 }),
      },
      {
        accepted: false,
        mode: 'full',
        name: 'short-core-timeout',
        report: mutationReport([{ status: 'Killed', testsCompleted: 1 }], { timeoutMS: 5000 }),
      },
      {
        accepted: false,
        mode: 'full',
        name: 'short-bun-timeout',
        report: mutationReport([{ status: 'Killed', testsCompleted: 1 }], { bunTimeout: 10000 }),
      },
      { accepted: false, mode: 'full', name: 'mixed-malformed-file', report: malformedFile },
      { accepted: false, mode: 'full', name: 'mixed-malformed-mutant', report: malformedMutant },
    ] as const;

    for (const reportCase of cases) {
      const reportPath = path.join(directory, `${reportCase.name}.json`);
      await writeFile(reportPath, JSON.stringify(reportCase.report), 'utf8');
      const result = await runScript('../scripts/check-stryker-report.mjs', [reportCase.mode, reportPath]);

      expect(result.code, `${reportCase.name}: ${result.stderr}`).toBe(reportCase.accepted ? 0 : 1);
      if (reportCase.accepted) {
        expect(result.stdout).toContain(reportCase.output);
      }
    }
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test('the mutation task graph orders its preflight and pins the intended Stryker config', async () => {
  const tasks = await Bun.file(new URL('../.config/mise/conf.d/20-ts.toml', import.meta.url)).text();
  const runner = await Bun.file(new URL('../scripts/run-stryker.mjs', import.meta.url)).text();
  const section = (name: string): string =>
    new RegExp(`\\[tasks\\."${name}"\\]\\n([\\s\\S]*?)(?=\\n\\[tasks|$)`, 'u').exec(tasks)?.[1] ?? '';

  expect(section('ts:install')).toContain('depends = ["ts:lock:check"]');
  expect(section('ts:preflight')).toContain('depends = ["ts:install"]');
  expect(section('ts:mutants')).toContain('depends = ["ts:preflight"]');
  expect(section('ts:mutants')).toContain('run = "node scripts/run-stryker.mjs full stryker.config.mjs"');
  expect(section('ts:mutants:diff')).toContain('depends = ["ts:preflight"]');
  expect(section('ts:mutants:diff')).toContain('run = "node scripts/run-stryker.mjs incremental stryker.config.mjs"');
  expect(section('ts:standards:check')).toContain('depends = ["ts:mutants"]');
  expect(runner).toContain("const lockDirectory = path.join(reportsDirectory, '.stryker-mutation.lock');");
  expect(runner).toContain("const strykerArguments = [strykerCli, 'run', configPath];");
  expect(runner).toContain("await runNode([checker, mode, 'reports/mutation/mutation.json']);");
  expect(runner).toContain('remove reports/.stryker-mutation.lock manually and rerun');
});

test('static analysis and mutation use the complete application source extension policy', async () => {
  const knip = await Bun.file(new URL('../knip.jsonc', import.meta.url)).text();
  const stryker = await Bun.file(new URL('../stryker.config.mjs', import.meta.url)).text();
  const mutationPatterns = /mutate:\s*\[([\s\S]*?)\]/u.exec(stryker)?.[1] ?? '';

  expect(knip).toContain(`"entry": ["${compositionRootSourceGlob}"`);
  expect(knip).toContain(`"project": ["${applicationSourceGlob}"`);
  expect(mutationPatterns).toContain(`'${applicationSourceGlob}'`);
  expect(mutationPatterns).toContain(`'${compositionRootGlob}'`);
  expect(stryker).toContain('concurrency: 2');
  expect(stryker).toContain('timeoutMS: 30000');
  expect(stryker).toContain("bun: { env: { STANDARDS_STRYKER_SANDBOX: '1' }, timeout: 60000 }");
});

test('concurrent mutation runners fail fast without touching source or stealing the lock', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'standards-ts-mutation-contention-'));
  const runnerPath = path.join(directory, 'scripts/run-stryker.mjs');
  const checkerPath = path.join(directory, 'scripts/check-stryker-report.mjs');
  const strykerPath = path.join(directory, 'node_modules/@stryker-mutator/core/bin/stryker.js');
  const sourcePath = path.join(directory, 'src/example.ts');
  const ownerPath = path.join(directory, 'reports/.stryker-mutation.lock/owner.json');
  const lockDirectory = path.dirname(ownerPath);
  const releasePath = path.join(directory, 'release-first-run');
  const source = 'export const example = 1;\n';
  let first: Bun.Subprocess<'ignore', 'pipe', 'pipe'> | undefined;
  let second: Bun.Subprocess<'ignore', 'pipe', 'pipe'> | undefined;

  try {
    await mkdir(path.dirname(strykerPath), { recursive: true });
    await mkdir(path.dirname(runnerPath), { recursive: true });
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await writeFile(runnerPath, await Bun.file(new URL('../scripts/run-stryker.mjs', import.meta.url)).text(), 'utf8');
    await writeFile(checkerPath, '', 'utf8');
    await writeFile(
      strykerPath,
      [
        "const { existsSync } = require('node:fs');",
        'const signal = new Int32Array(new SharedArrayBuffer(4));',
        "while (!existsSync('release-first-run')) Atomics.wait(signal, 0, 0, 10);",
      ].join('\n'),
      'utf8',
    );
    await writeFile(sourcePath, source, 'utf8');

    first = Bun.spawn([process.execPath, runnerPath, 'incremental', 'stryker.config.mjs'], {
      cwd: directory,
      stderr: 'pipe',
      stdout: 'pipe',
    });
    const firstStderr = new Response(first.stderr).text();
    const firstStdout = new Response(first.stdout).text();
    await waitForPath(ownerPath);
    const owner: unknown = JSON.parse(await readFile(ownerPath, 'utf8'));
    if (
      typeof owner !== 'object' ||
      owner === null ||
      !('mode' in owner) ||
      typeof owner.mode !== 'string' ||
      !('pid' in owner) ||
      typeof owner.pid !== 'number'
    ) {
      throw new Error('Mutation lock owner metadata was malformed.');
    }

    second = Bun.spawn([process.execPath, runnerPath, 'incremental', 'stryker.config.mjs'], {
      cwd: directory,
      stderr: 'pipe',
      stdout: 'pipe',
    });
    const secondResult = Promise.all([
      second.exited,
      new Response(second.stderr).text(),
      new Response(second.stdout).text(),
    ]);
    const [secondCode, secondStderr, secondStdout] = await Promise.race([
      secondResult,
      Bun.sleep(2_000).then(() => {
        throw new Error('The contending mutation runner did not fail within two seconds.');
      }),
    ]);

    expect(secondCode, secondStdout).not.toBe(0);
    expect(secondStderr).toContain(`"pid": ${String(owner.pid)}`);
    expect(secondStderr).toContain(`"mode": "${owner.mode}"`);
    expect(secondStderr).toContain('remove reports/.stryker-mutation.lock manually and rerun');
    expect(await pathExists(lockDirectory)).toBe(true);
    expect(await readFile(sourcePath, 'utf8')).toBe(source);

    await writeFile(releasePath, 'release\n', 'utf8');
    const [firstCode, firstError, firstOutput] = await Promise.all([first.exited, firstStderr, firstStdout]);
    expect(firstCode, `${firstError}${firstOutput}`).toBe(0);
    expect(await pathExists(lockDirectory)).toBe(false);
    expect(await readFile(sourcePath, 'utf8')).toBe(source);
  } finally {
    await writeFile(releasePath, 'release\n', 'utf8').catch(() => undefined);
    for (const child of [first, second]) {
      if (child?.exitCode === null) {
        child.kill('SIGKILL');
        await child.exited;
      }
    }
    await rm(directory, { force: true, recursive: true });
  }
}, 10_000);

test('a dead command leader cannot hide a TERM-resistant descendant from the mutation lock', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'standards-ts-mutation-descendant-'));
  const runnerPath = path.join(directory, 'scripts/run-stryker.mjs');
  const checkerPath = path.join(directory, 'scripts/check-stryker-report.mjs');
  const strykerPath = path.join(directory, 'node_modules/@stryker-mutator/core/bin/stryker.js');
  const lockDirectory = path.join(directory, 'reports/.stryker-mutation.lock');
  const descendantPidPath = path.join(directory, 'descendant.pid');
  const prematureReleasePath = path.join(directory, 'lock-released-while-descendant-alive');
  const checkerRanPath = path.join(directory, 'checker-ran');
  let descendantPid = -1;

  const descendantProgram = [
    "const { existsSync, writeFileSync } = require('node:fs');",
    "process.on('SIGTERM', () => undefined);",
    "process.on('SIGHUP', () => undefined);",
    "writeFileSync('descendant-ready', 'ready\\n');",
    'setInterval(() => {',
    "  if (!existsSync('reports/.stryker-mutation.lock')) {",
    "    writeFileSync('lock-released-while-descendant-alive', 'released\\n');",
    '  }',
    '}, 10);',
  ].join('\n');

  try {
    await mkdir(path.dirname(strykerPath), { recursive: true });
    await mkdir(path.dirname(runnerPath), { recursive: true });
    await writeFile(runnerPath, await Bun.file(new URL('../scripts/run-stryker.mjs', import.meta.url)).text(), 'utf8');
    await writeFile(checkerPath, "require('node:fs').writeFileSync('checker-ran', 'ran\\n');\n", 'utf8');
    await writeFile(
      strykerPath,
      [
        "const { existsSync, writeFileSync } = require('node:fs');",
        "const { spawn } = require('node:child_process');",
        'const signal = new Int32Array(new SharedArrayBuffer(4));',
        `const descendant = spawn(process.execPath, ['-e', ${JSON.stringify(descendantProgram)}], { stdio: 'ignore' });`,
        'descendant.unref();',
        "writeFileSync('descendant.pid', `${descendant.pid}\\n`);",
        "while (!existsSync('descendant-ready')) Atomics.wait(signal, 0, 0, 10);",
      ].join('\n'),
      'utf8',
    );

    const child = Bun.spawn([process.execPath, runnerPath, 'incremental', 'stryker.config.mjs'], {
      cwd: directory,
      stderr: 'pipe',
      stdout: 'pipe',
    });
    const [code, stderr, stdout] = await Promise.all([
      child.exited,
      new Response(child.stderr).text(),
      new Response(child.stdout).text(),
    ]);
    descendantPid = Number.parseInt(await readFile(descendantPidPath, 'utf8'), 10);
    await Bun.sleep(100);

    expect(code, stdout).not.toBe(0);
    expect(stderr).toContain('exited while descendants remained in process group');
    expect(await pathExists(checkerRanPath)).toBe(false);
    expect(await pathExists(prematureReleasePath)).toBe(false);
    expect(processExists(descendantPid)).toBe(false);
    expect(await pathExists(lockDirectory)).toBe(false);
  } finally {
    if (descendantPid > 0 && processExists(descendantPid)) {
      process.kill(descendantPid, 'SIGKILL');
      await waitForProcessExit(descendantPid).catch(() => undefined);
    }
    await rm(directory, { force: true, recursive: true });
  }
}, 15_000);

for (const signal of ['SIGHUP', 'SIGTERM'] as const) {
  test(`the mutation runner releases its owned lock after ${signal}`, async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'standards-ts-mutation-signal-'));
    const runnerPath = path.join(directory, 'scripts/run-stryker.mjs');
    const strykerPath = path.join(directory, 'node_modules/@stryker-mutator/core/bin/stryker.js');
    const lockDirectory = path.join(directory, 'reports/.stryker-mutation.lock');
    let child: Bun.Subprocess<'ignore', 'pipe', 'pipe'> | undefined;

    try {
      await mkdir(path.dirname(strykerPath), { recursive: true });
      await mkdir(path.dirname(runnerPath), { recursive: true });
      await writeFile(
        runnerPath,
        await Bun.file(new URL('../scripts/run-stryker.mjs', import.meta.url)).text(),
        'utf8',
      );
      await writeFile(strykerPath, 'setInterval(() => undefined, 1_000);\n', 'utf8');

      child = Bun.spawn([process.execPath, runnerPath, 'incremental', 'stryker.config.mjs'], {
        cwd: directory,
        stderr: 'pipe',
        stdout: 'pipe',
      });
      const stderrText = new Response(child.stderr).text();
      const stdoutText = new Response(child.stdout).text();

      await waitForPath(path.join(lockDirectory, 'owner.json'));
      child.kill(signal);

      const [code, stderr, stdout] = await Promise.all([child.exited, stderrText, stdoutText]);
      expect(code, stdout).not.toBe(0);
      expect(stderr).toContain(signal);
      expect(await pathExists(lockDirectory)).toBe(false);
    } finally {
      if (child?.exitCode === null) {
        child.kill('SIGKILL');
        await child.exited;
      }
      await rm(directory, { force: true, recursive: true });
    }
  }, 10_000);
}

test('the CI cache validator accepts only structurally usable Stryker incremental state', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'standards-ts-mutation-cache-'));

  try {
    const validForMalformedFile = mutationReport([{ status: 'Killed', testsCompleted: 1 }], { force: false });
    const malformedFile = {
      ...validForMalformedFile,
      files: { ...validForMalformedFile.files, 'src/broken.ts': { mutants: [] } },
    };
    const validForMalformedMutant = mutationReport([{ status: 'Killed', testsCompleted: 1 }], { force: false });
    const malformedMutant = {
      ...validForMalformedMutant,
      files: {
        ...validForMalformedMutant.files,
        'src/example.ts': {
          ...validForMalformedMutant.files['src/example.ts'],
          mutants: [...validForMalformedMutant.files['src/example.ts'].mutants, { status: 'Killed' }],
        },
      },
    };
    const cases = [
      { accepted: true, name: 'valid', state: mutationReport([{ status: 'Killed' }], { force: false }) },
      { accepted: false, name: 'mixed-malformed-file', state: malformedFile },
      { accepted: false, name: 'mixed-malformed-mutant', state: malformedMutant },
      {
        accepted: false,
        name: 'non-terminal',
        state: mutationReport([{ status: 'Pending' }], { force: false }),
      },
      {
        accepted: false,
        name: 'non-incremental',
        state: mutationReport([{ status: 'Killed' }], { force: false, incremental: false }),
      },
    ] as const;

    for (const cacheCase of cases) {
      const cachePath = path.join(directory, `${cacheCase.name}.json`);
      await writeFile(cachePath, JSON.stringify(cacheCase.state), 'utf8');
      const result = await runScript('../scripts/check-stryker-cache.mjs', [cachePath]);
      expect(result.code, `${cacheCase.name}: ${result.stderr}`).toBe(cacheCase.accepted ? 0 : 1);
    }

    const invalidJsonPath = path.join(directory, 'invalid-json.json');
    await writeFile(invalidJsonPath, '{"files":', 'utf8');
    expect((await runScript('../scripts/check-stryker-cache.mjs', [invalidJsonPath])).code).toBe(1);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
