import { expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';

/**
 * Contract tests: the shared-mutable-state wall and the exception protocol
 * in eslint.config.mjs must actually fire. A mistyped esquery selector or a
 * dropped plugin rule would otherwise leave the gate green while the wall
 * silently stops existing.
 *
 * The probe file is virtual, so the override below grants it a default
 * project — parser plumbing only; every rule under test comes from the real
 * config.
 */
const PROBE_PATH = 'src/state-wall-probe.ts';

async function lintProbe(source: string): Promise<ESLint.LintResult['messages']> {
  const eslint = new ESLint({
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    overrideConfig: [
      {
        files: [PROBE_PATH],
        languageOptions: {
          parserOptions: { projectService: { allowDefaultProject: [PROBE_PATH] } },
        },
      },
    ],
  });
  const [result] = await eslint.lintText(source, { filePath: PROBE_PATH });
  return result?.messages ?? [];
}

test('the state wall mechanically rejects module-scope mutable bindings', async () => {
  const messages = await lintProbe('let counter = 0;\nexport { counter };\n');

  expect(
    messages.some(
      ({ ruleId, severity, message }) =>
        ruleId === 'no-restricted-syntax' &&
        severity === 2 &&
        message.includes('Module-scope mutable binding is ambient shared state'),
    ),
  ).toBe(true);
});

test('the state wall mechanically rejects exported mutable bindings', async () => {
  const messages = await lintProbe('export let counter = 0;\n');

  expect(
    messages.some(
      ({ ruleId, severity, message }) =>
        ruleId === 'no-restricted-syntax' &&
        severity === 2 &&
        message.includes('Exported mutable binding is a global mutable singleton'),
    ),
  ).toBe(true);
});

test('the state wall mechanically rejects globalThis mutation', async () => {
  const messages = await lintProbe('globalThis.flag = true;\n');

  expect(
    messages.some(
      ({ ruleId, severity, message }) =>
        ruleId === 'no-restricted-syntax' &&
        severity === 2 &&
        message.includes('Mutating globalThis creates ambient state'),
    ),
  ).toBe(true);
});

test('the exception protocol mechanically rejects reasonless disables', async () => {
  const messages = await lintProbe('// eslint-disable-next-line no-restricted-syntax\nexport let counter = 0;\n');

  expect(
    messages.some(
      ({ ruleId, severity }) => ruleId === '@eslint-community/eslint-comments/require-description' && severity === 2,
    ),
  ).toBe(true);
});

test('the exception protocol mechanically rejects unlimited block disables', async () => {
  const messages = await lintProbe('/* eslint-disable */\nexport const ok = 1;\n');

  expect(
    messages.some(
      ({ ruleId, severity }) => ruleId === '@eslint-community/eslint-comments/no-unlimited-disable' && severity === 2,
    ),
  ).toBe(true);
});
