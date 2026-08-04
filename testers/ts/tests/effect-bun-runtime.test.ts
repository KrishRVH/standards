import { expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';

const childScript = fileURLToPath(new URL('./fixtures/bun-runtime-signal-child.ts', import.meta.url));

test('BunRuntime SIGTERM interrupts main, finalizes its scope, and exits zero', async () => {
  const child = Bun.spawn([process.execPath, childScript], {
    cwd: process.cwd(),
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const stderrText = new Response(child.stderr).text();
  const reader = child.stdout.getReader();
  const decoder = new TextDecoder();
  let stdout = '';
  let backstopTriggered = false;
  const backstop = setTimeout(() => {
    backstopTriggered = true;
    if (child.exitCode === null) {
      child.kill('SIGKILL');
    }
  }, 5_000);

  try {
    while (!stdout.includes('HANDLERS_READY\n')) {
      const chunk = await reader.read();

      if (chunk.done) {
        throw new Error(`BunRuntime child exited before registering handlers: ${stdout}`);
      }
      stdout += decoder.decode(chunk.value, { stream: true });
    }

    child.kill('SIGTERM');

    let chunk = await reader.read();
    while (!chunk.done) {
      stdout += decoder.decode(chunk.value, { stream: true });
      chunk = await reader.read();
    }
    stdout += decoder.decode();

    const exitCode = await child.exited;

    expect(backstopTriggered).toBe(false);
    expect(exitCode).toBe(0);
    expect(stdout.trim().split(/\r?\n/)).toEqual(['ACQUIRED', 'HANDLERS_READY', 'FINALIZED']);
    expect(await stderrText).toBe('');
  } finally {
    clearTimeout(backstop);
    if (child.exitCode === null) {
      child.kill('SIGKILL');
    }
    await child.exited;
  }
}, 10_000);
