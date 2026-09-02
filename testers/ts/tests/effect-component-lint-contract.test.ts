import { expect, test } from 'bun:test';

import { lintProbe } from './support/oxlint-probe.js';

test('the UI overlay mechanically rejects raw runFork in component source', async () => {
  const messages = await lintProbe(
    'const runtime = { runFork: () => 1 }; runtime.runFork();',
    'src/UnsafeComponent.tsx',
  );

  expect(messages.some(({ ruleId, severity }) => ruleId === 'no-restricted-properties' && severity === 2)).toBe(true);
});

test('the UI overlay mechanically rejects inaccessible component markup', async () => {
  const messages = await lintProbe('<img src="/avatar.png" />;', 'src/UnsafeImage.tsx');

  expect(messages.some(({ ruleId, severity }) => ruleId === 'jsx-a11y/alt-text' && severity === 2)).toBe(true);
});
