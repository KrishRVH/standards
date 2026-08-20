import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { constants as osConstants } from 'node:os';
import path from 'node:path';
import process, { argv, execPath, stderr } from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { URL, fileURLToPath } from 'node:url';

const mode = argv[2];
const configPath = argv[3];
if ((mode !== 'full' && mode !== 'incremental') || configPath !== 'stryker.config.mjs') {
  throw new Error('Usage: run-stryker.mjs <full|incremental> stryker.config.mjs');
}
if (process.platform === 'win32') {
  throw new Error('run-stryker.mjs requires POSIX process-group signaling and does not support Windows.');
}

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const reportsDirectory = path.join(projectRoot, 'reports');
const lockDirectory = path.join(reportsDirectory, '.stryker-mutation.lock');
const ownerPath = path.join(lockDirectory, 'owner.json');
const reportPath = path.join(projectRoot, 'reports/mutation/mutation.json');
const strykerCli = path.join(projectRoot, 'node_modules/@stryker-mutator/core/bin/stryker.js');
const checker = path.join(projectRoot, 'scripts/check-stryker-report.mjs');
const owner = {
  token: randomUUID(),
  pid: process.pid,
  mode,
  startedAt: new Date().toISOString(),
};
const STOP_POLL_INTERVAL_MS = 50;
const STOP_POLL_ATTEMPTS = 100;
let activeGroup;
let interruptedSignal;
let signalForwardingError;
let notifyInterruption;
const interruption = new Promise((resolve) => {
  notifyInterruption = resolve;
});

function errorCode(error) {
  return typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
}

function clearActive() {
  activeGroup = undefined;
}

function groupExists(processGroup) {
  try {
    process.kill(-processGroup, 0);
    return true;
  } catch (error) {
    if (errorCode(error) === 'ESRCH') {
      return false;
    }
    if (errorCode(error) === 'EPERM') {
      return true;
    }
    throw new Error(`Cannot inspect mutation process group ${String(processGroup)}.`, { cause: error });
  }
}

function signalActive(signal) {
  const processGroup = activeGroup;
  if (processGroup === undefined) {
    return;
  }

  try {
    process.kill(-processGroup, signal);
  } catch (error) {
    if (errorCode(error) === 'ESRCH') {
      clearActive();
      return;
    }
    throw new Error(`Cannot signal mutation process group ${String(processGroup)} with ${signal}.`, {
      cause: error,
    });
  }
}

async function waitForGroupExit(attempts) {
  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    const processGroup = activeGroup;
    if (processGroup === undefined || !groupExists(processGroup)) {
      clearActive();
      return true;
    }
    if (attempt < attempts) {
      await delay(STOP_POLL_INTERVAL_MS);
    }
  }

  return false;
}

async function stopActive(signal) {
  const processGroup = activeGroup;
  if (processGroup === undefined) {
    clearActive();
    return;
  }

  signalActive(signal);
  if (await waitForGroupExit(STOP_POLL_ATTEMPTS)) {
    return;
  }

  signalActive('SIGKILL');
  if (await waitForGroupExit(STOP_POLL_ATTEMPTS)) {
    return;
  }

  throw new Error(
    `Mutation process group ${String(processGroup)} survived SIGKILL; retaining ` +
      'reports/.stryker-mutation.lock because descendant shutdown could not be confirmed.',
  );
}

function interrupt(signal) {
  interruptedSignal ??= signal;
  try {
    signalActive(signal);
  } catch (error) {
    signalForwardingError ??= error;
  }
  notifyInterruption();
}

const signalHandlers = new Map(['SIGHUP', 'SIGINT', 'SIGTERM'].map((signal) => [signal, () => interrupt(signal)]));

function assertNotInterrupted() {
  if (interruptedSignal !== undefined) {
    throw new Error(`Mutation run interrupted by ${interruptedSignal}.`);
  }
}

async function existingOwner() {
  try {
    return await readFile(ownerPath, 'utf8');
  } catch {
    return 'owner metadata is unavailable';
  }
}

async function acquireLock() {
  await mkdir(reportsDirectory, { recursive: true });

  try {
    await mkdir(lockDirectory);
  } catch (error) {
    if (error?.code !== 'EEXIST') {
      throw error;
    }

    throw new Error(
      `Mutation testing is already locked by ${await existingOwner()}. ` +
        'The lock fails closed because another run may still own the report or incremental cache. ' +
        'If no mutation process is running, remove reports/.stryker-mutation.lock manually and rerun.',
      { cause: error },
    );
  }

  try {
    await writeFile(ownerPath, `${JSON.stringify(owner, null, 2)}\n`, { flag: 'wx' });
  } catch (error) {
    await rm(lockDirectory, { recursive: true });
    throw error;
  }
}

async function releaseLock() {
  const currentOwner = JSON.parse(await readFile(ownerPath, 'utf8'));
  if (currentOwner.token !== owner.token) {
    throw new Error("Mutation lock ownership changed unexpectedly; refusing to remove another process's lock.");
  }

  await rm(lockDirectory, { recursive: true });
}

async function runNode(arguments_) {
  assertNotInterrupted();
  const child = spawn(execPath, arguments_, { cwd: projectRoot, detached: true, stdio: 'inherit' });
  const completion = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  if (child.pid === undefined || child.pid <= 0) {
    const cause = await completion.then(
      () => new Error('Mutation command completed without exposing its process-group leader PID.'),
      (error) => error,
    );
    throw new Error('Mutation command could not start an owned process group.', { cause });
  }

  activeGroup = child.pid;
  const outcome = await Promise.race([
    completion.then(
      (result) => ({ result, type: 'exit' }),
      (error) => ({ error, type: 'error' }),
    ),
    interruption.then(() => ({ type: 'interruption' })),
  ]);

  if (outcome.type === 'interruption') {
    await stopActive(interruptedSignal ?? 'SIGTERM');
    await completion.catch(() => undefined);
    if (signalForwardingError !== undefined) {
      throw signalForwardingError;
    }
    throw new Error(`Mutation run interrupted by ${interruptedSignal ?? 'a soft signal'}.`);
  }
  if (outcome.type === 'error') {
    throw outcome.error;
  }

  if (!(await waitForGroupExit(1))) {
    throw new Error(
      `Mutation command ${arguments_.join(' ')} exited while descendants remained in process group ` +
        `${String(activeGroup)}.`,
    );
  }
  if (outcome.result.signal !== null) {
    throw new Error(`Child process terminated by ${outcome.result.signal}.`);
  }

  const code = outcome.result.code ?? 1;
  if (code !== 0) {
    throw new Error(`Child process failed with exit code ${String(code)}.`);
  }

  assertNotInterrupted();
}

for (const [signal, handler] of signalHandlers) {
  process.on(signal, handler);
}

let exitCode = 0;
let ownsLock = false;
try {
  await acquireLock();
  ownsLock = true;
  assertNotInterrupted();
  await rm(reportPath, { force: true });
  assertNotInterrupted();
  await access(strykerCli, constants.R_OK);
  assertNotInterrupted();

  const strykerArguments = [strykerCli, 'run', configPath];
  if (mode === 'full') {
    strykerArguments.push('--force');
  }

  await runNode(strykerArguments);
  await runNode([checker, mode, 'reports/mutation/mutation.json']);
} catch (error) {
  stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  exitCode = 1;
} finally {
  let shutdownConfirmed = false;
  try {
    await stopActive(interruptedSignal ?? 'SIGTERM');
    shutdownConfirmed = true;
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    exitCode = 1;
  } finally {
    try {
      if (ownsLock && shutdownConfirmed) {
        await releaseLock();
      }
    } catch (error) {
      stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      exitCode = 1;
    } finally {
      for (const [signal, handler] of signalHandlers) {
        process.off(signal, handler);
      }
    }
  }
}

if (interruptedSignal !== undefined) {
  const signalNumber = osConstants.signals[interruptedSignal];
  exitCode = signalNumber === undefined ? 1 : 128 + signalNumber;
}
process.exitCode = exitCode;
