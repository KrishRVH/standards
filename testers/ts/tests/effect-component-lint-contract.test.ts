import { expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const probeConfig = [
  {
    files: ['src/*'],
    languageOptions: { parserOptions: { projectService: { allowDefaultProject: ['src/*'] } } },
  },
];

test('the UI overlay mechanically rejects raw runFork in component source', async () => {
  const eslint = new ESLint({ cwd: projectRoot, overrideConfig: probeConfig });
  const [result] = await eslint.lintText('const runtime = { runFork: () => 1 }; runtime.runFork();', {
    filePath: 'src/UnsafeComponent.tsx',
  });

  expect(result?.messages.some(({ ruleId, severity }) => ruleId === 'no-restricted-properties' && severity === 2)).toBe(
    true,
  );
});

test('the UI overlay mechanically rejects inaccessible component markup', async () => {
  const eslint = new ESLint({ cwd: projectRoot, overrideConfig: probeConfig });
  const [result] = await eslint.lintText('<img src="/avatar.png" />;', {
    filePath: 'src/UnsafeImage.tsx',
  });

  expect(result?.messages.some(({ ruleId, severity }) => ruleId === 'jsx-a11y-x/alt-text' && severity === 2)).toBe(
    true,
  );
});
