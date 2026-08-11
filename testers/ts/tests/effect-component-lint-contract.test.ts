import { expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';

test('the UI overlay mechanically rejects raw runFork in component source', async () => {
  const eslint = new ESLint({ cwd: fileURLToPath(new URL('..', import.meta.url)) });
  const [result] = await eslint.lintText('const runtime = { runFork: () => 1 }; runtime.runFork();', {
    filePath: 'src/UnsafeComponent.jsx',
  });

  expect(result?.messages.some(({ ruleId, severity }) => ruleId === 'no-restricted-properties' && severity === 2)).toBe(
    true,
  );
});

test('the UI overlay mechanically rejects inaccessible component markup', async () => {
  const eslint = new ESLint({ cwd: fileURLToPath(new URL('..', import.meta.url)) });
  const [result] = await eslint.lintText('<img src="/avatar.png" />;', {
    filePath: 'src/UnsafeImage.jsx',
  });

  expect(result?.messages.some(({ ruleId, severity }) => ruleId === 'jsx-a11y-x/alt-text' && severity === 2)).toBe(
    true,
  );
});
