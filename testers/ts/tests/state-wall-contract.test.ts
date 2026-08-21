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
const PROBE_GLOB = 'src/*';
const applicationSourceExtensions = ['cts', 'mts', 'ts', 'tsx'] as const;
const unsupportedApplicationSourceExtensions = ['cjs', 'js', 'jsx', 'mjs'] as const;
const immediateTimerCases: readonly {
  readonly name: string;
  readonly ruleId: string;
  readonly source: string;
}[] = [
  {
    name: 'bare',
    ruleId: 'no-restricted-globals',
    source: 'setImmediate(() => undefined);\n',
  },
  {
    name: 'qualified',
    ruleId: 'standards/no-ambient-runtime',
    source: 'globalThis.setImmediate(() => undefined);\n',
  },
  {
    name: 'extracted alias',
    ruleId: 'standards/no-ambient-runtime',
    source: 'const runSoon = globalThis.setImmediate;\nvoid runSoon;\n',
  },
  {
    name: 'destructured alias',
    ruleId: 'standards/no-ambient-runtime',
    source: 'const { setImmediate: runSoon } = globalThis;\nvoid runSoon;\n',
  },
];

async function lintProbe(source: string, probePath = PROBE_PATH): Promise<ESLint.LintResult['messages']> {
  const needsTypeScriptProject = /\.(?:cts|mts|ts|tsx)$/u.test(probePath);
  const eslint = new ESLint({
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    overrideConfig: needsTypeScriptProject
      ? [
          {
            files: [PROBE_GLOB],
            languageOptions: {
              parserOptions: { projectService: { allowDefaultProject: [PROBE_GLOB] } },
            },
          },
        ]
      : [],
  });
  const [result] = await eslint.lintText(source, { filePath: probePath });
  return result?.messages ?? [];
}

for (const extension of applicationSourceExtensions) {
  test(`the application state walls cover .${extension} source`, async () => {
    const messages = await lintProbe(
      'let moduleCounter = 0;\nglobalThis.counter++;\nvoid moduleCounter;\n',
      `src/state-wall-probe.${extension}`,
    );

    expect(
      messages.some(
        ({ ruleId, severity, message }) =>
          ruleId === 'no-restricted-syntax' &&
          severity === 2 &&
          message.includes('Module-scope mutable binding is ambient shared state'),
      ),
      `.${extension} module wall: ${JSON.stringify(messages)}`,
    ).toBe(true);
    expect(
      messages.some(({ ruleId, severity }) => ruleId === 'standards/no-global-mutation' && severity === 2),
      `.${extension} global wall: ${JSON.stringify(messages)}`,
    ).toBe(true);

    for (const timerCase of immediateTimerCases) {
      const timerMessages = await lintProbe(timerCase.source, `src/state-wall-probe.${extension}`);
      expect(
        timerMessages.some(({ ruleId, severity }) => ruleId === timerCase.ruleId && severity === 2),
        `.${extension} ${timerCase.name} setImmediate wall: ${JSON.stringify(timerMessages)}`,
      ).toBe(true);
    }
  });
}

for (const extension of unsupportedApplicationSourceExtensions) {
  test(`the application source policy rejects .${extension} source before it can bypass typechecking`, async () => {
    const messages = await lintProbe('export const value = 1;\n', `src/state-wall-probe.${extension}`);

    expect(
      messages.some(
        ({ ruleId, severity, message }) =>
          ruleId === 'no-restricted-syntax' &&
          severity === 2 &&
          message.includes('First-party application source must use .ts, .mts, .cts, or .tsx'),
      ),
      `.${extension} source policy: ${JSON.stringify(messages)}`,
    ).toBe(true);
  });
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
        ruleId === 'standards/no-global-mutation' &&
        severity === 2 &&
        message.includes('Mutating the ambient global object creates ambient state'),
    ),
  ).toBe(true);
});

const ambientStateBypasses: readonly {
  readonly name: string;
  readonly ruleId: string;
  readonly source: string;
}[] = [
  {
    name: 'globalThis updates',
    ruleId: 'standards/no-global-mutation',
    source: 'globalThis.counter++;\n',
  },
  {
    name: 'globalThis deletion',
    ruleId: 'standards/no-global-mutation',
    source: 'delete globalThis.counter;\n',
  },
  {
    name: 'Node global root reassignment',
    ruleId: 'standards/no-global-mutation',
    source: 'global = {};\n',
  },
  {
    name: 'Object.defineProperty on globalThis',
    ruleId: 'standards/no-global-mutation',
    source: "Object.defineProperty(globalThis, 'counter', { value: 1 });\n",
  },
  {
    name: 'Reflect.set on globalThis',
    ruleId: 'standards/no-global-mutation',
    source: "Reflect.set(globalThis, 'counter', 1);\n",
  },
  {
    name: 'ambient Object.defineProperty on globalThis',
    ruleId: 'standards/no-global-mutation',
    source: "globalThis.Object.defineProperty(globalThis, 'counter', { value: 1 });\n",
  },
  {
    name: 'ambient Reflect.set on globalThis',
    ruleId: 'standards/no-global-mutation',
    source: "globalThis.Reflect.set(globalThis, 'counter', 1);\n",
  },
  {
    name: 'Reflect.preventExtensions on globalThis',
    ruleId: 'standards/no-global-mutation',
    source: 'Reflect.preventExtensions(globalThis);\n',
  },
  {
    name: 'ambient Reflect.preventExtensions on globalThis',
    ruleId: 'standards/no-global-mutation',
    source: 'globalThis.Reflect.preventExtensions(globalThis);\n',
  },
  {
    name: 'aliased Reflect.preventExtensions on globalThis',
    ruleId: 'standards/no-global-mutation',
    source: 'const stop = Reflect.preventExtensions;\nstop(globalThis);\n',
  },
  {
    name: 'aliased ambient Object mutation methods',
    ruleId: 'standards/no-global-mutation',
    source:
      "const ObjectAlias = globalThis.Object;\nObjectAlias.defineProperty(globalThis, 'counter', { value: 1 });\n",
  },
  {
    name: 'destructured ambient Object aliases',
    ruleId: 'standards/no-global-mutation',
    source:
      "const { Object: ObjectAlias } = globalThis;\nObjectAlias.defineProperty(globalThis, 'counter', { value: 1 });\n",
  },
  {
    name: 'destructured ambient global aliases',
    ruleId: 'standards/no-global-mutation',
    source: 'const { globalThis: root } = globalThis;\nvoid root;\n',
  },
  {
    name: 'assigned destructured ambient Object aliases',
    ruleId: 'standards/no-global-mutation',
    source: [
      'export function mutate(useAmbient: boolean): void {',
      '  let ObjectAlias = Object;',
      '  if (useAmbient) {',
      '    ({ Object: ObjectAlias } = globalThis);',
      '  }',
      "  ObjectAlias.defineProperty(globalThis, 'counter', { value: 1 });",
      '}',
      '',
    ].join('\n'),
  },
  {
    name: 'destructuring assignment into globalThis',
    ruleId: 'standards/no-global-mutation',
    source: '({ value: globalThis.counter } = { value: 1 });\n',
  },
  {
    name: 'Object.defineProperty.call on globalThis',
    ruleId: 'standards/no-global-mutation',
    source: "Object.defineProperty.call(Object, globalThis, 'counter', { value: 1 });\n",
  },
  {
    name: 'Reflect.set.call on globalThis',
    ruleId: 'standards/no-global-mutation',
    source: "Reflect.set.call(Reflect, globalThis, 'counter', 1);\n",
  },
  {
    name: 'qualified global timers',
    ruleId: 'standards/no-ambient-runtime',
    source: 'globalThis.setTimeout(() => undefined, 1);\n',
  },
  {
    name: 'Node global timers',
    ruleId: 'standards/no-ambient-runtime',
    source: 'global.setTimeout(() => undefined, 1);\n',
  },
  {
    name: 'bare cluster imports',
    ruleId: 'no-restricted-imports',
    source: "import cluster from 'cluster';\nvoid cluster;\n",
  },
  {
    name: 'bare worker imports',
    ruleId: 'no-restricted-imports',
    source: "import workers from 'worker_threads';\nvoid workers;\n",
  },
  {
    name: 'dynamic cluster imports',
    ruleId: 'standards/no-ambient-runtime',
    source: "await import('node:cluster');\n",
  },
  {
    name: 'dynamic worker imports',
    ruleId: 'standards/no-ambient-runtime',
    source: "await import('worker_threads');\n",
  },
  {
    name: 'static timer-module imports',
    ruleId: 'no-restricted-imports',
    source: "import { setTimeout as delay } from 'node:timers';\nvoid delay;\n",
  },
  {
    name: 'static promise timer-module imports',
    ruleId: 'no-restricted-imports',
    source: "import { setTimeout as delay } from 'node:timers/promises';\nvoid delay;\n",
  },
  {
    name: 'dynamic timer-module imports',
    ruleId: 'standards/no-ambient-runtime',
    source: "await import('node:timers');\n",
  },
  {
    name: 'dynamic promise timer-module imports',
    ruleId: 'standards/no-ambient-runtime',
    source: "await import('node:timers/promises');\n",
  },
  {
    name: 'globalThis mutation through an alias',
    ruleId: 'standards/no-global-mutation',
    source: 'const root = globalThis;\nroot.counter = 1;\n',
  },
  {
    name: 'mutable globalThis alias creation',
    ruleId: 'standards/no-global-mutation',
    source: 'let root = globalThis;\nvoid root;\n',
  },
  {
    name: 'default-parameter globalThis alias creation',
    ruleId: 'standards/no-global-mutation',
    source: 'export function inspect(root = globalThis): unknown {\n  return root;\n}\n',
  },
  {
    name: 'computed Object mutation methods',
    ruleId: 'standards/no-global-mutation',
    source: "const method = 'define' + 'Property';\nObject[method](globalThis, 'counter', { value: 1 });\n",
  },
  {
    name: 'aliased Object mutation methods and globalThis targets',
    ruleId: 'standards/no-global-mutation',
    source: "const root = globalThis;\nconst define = Object.defineProperty;\ndefine(root, 'counter', { value: 1 });\n",
  },
  {
    name: 'destructured Object mutation methods',
    ruleId: 'standards/no-global-mutation',
    source: "const { defineProperty: define } = Object;\ndefine(globalThis, 'counter', { value: 1 });\n",
  },
  {
    name: 'computed aliased Reflect mutation methods',
    ruleId: 'standards/no-global-mutation',
    source: "const reflection = Reflect;\nconst method = 'set';\nreflection[method](globalThis, 'counter', 1);\n",
  },
  {
    name: 'qualified global timers through aliases',
    ruleId: 'standards/no-ambient-runtime',
    source: 'const root = globalThis;\nroot.setInterval(() => undefined, 1);\n',
  },
  {
    name: 'aliased qualified global timers',
    ruleId: 'standards/no-ambient-runtime',
    source: 'const delay = globalThis.setTimeout;\ndelay(() => undefined, 1);\n',
  },
  {
    name: 'qualified global timer call indirection',
    ruleId: 'standards/no-ambient-runtime',
    source: 'globalThis.setTimeout.call(globalThis, () => undefined, 1);\n',
  },
  {
    name: 'qualified global timer binding',
    ruleId: 'standards/no-ambient-runtime',
    source: 'const delay = globalThis.setTimeout.bind(globalThis);\nvoid delay;\n',
  },
  {
    name: 'destructured qualified global timeouts',
    ruleId: 'standards/no-ambient-runtime',
    source: 'const { setTimeout: delay } = globalThis;\ndelay(() => undefined, 1);\n',
  },
  {
    name: 'destructured qualified global intervals',
    ruleId: 'standards/no-ambient-runtime',
    source: 'const { setInterval: repeat } = globalThis;\nrepeat(() => undefined, 1);\n',
  },
  {
    name: 'template-literal process imports',
    ruleId: 'standards/no-ambient-runtime',
    source: 'await import(`node:cluster`);\n',
  },
  {
    name: 'statically interpolated process imports',
    ruleId: 'standards/no-ambient-runtime',
    source: "const moduleName = 'worker_threads';\nawait import(`${moduleName}`);\n",
  },
  {
    name: 'repeated statically interpolated process imports',
    ruleId: 'standards/no-ambient-runtime',
    source: "const empty = '';\nawait import(`${empty}worker_threads${empty}`);\n",
  },
  {
    name: 'CommonJS worker loading',
    ruleId: '@typescript-eslint/no-require-imports',
    source: "const workers = require('worker_threads');\nvoid workers;\n",
  },
  {
    name: 'CommonJS cluster loading',
    ruleId: '@typescript-eslint/no-require-imports',
    source: "const cluster = require('node:cluster');\nvoid cluster;\n",
  },
];

for (const bypass of ambientStateBypasses) {
  test(`the state wall rejects ${bypass.name}`, async () => {
    const messages = await lintProbe(bypass.source);

    expect(
      messages.some(({ ruleId, severity }) => ruleId === bypass.ruleId && severity === 2),
      `${bypass.name}: ${JSON.stringify(messages)}`,
    ).toBe(true);
  });
}

test('the mutation rule considers only the mutator target argument', async () => {
  const messages = await lintProbe(
    [
      'const copy: Record<string, unknown> = {};',
      'Object.assign(copy, globalThis);',
      "Object.defineProperty(copy, 'original', { value: globalThis });",
      "globalThis.Object.defineProperty(copy, 'original', { value: globalThis });",
      "Object.defineProperty.call(Object, copy, 'original', { value: globalThis });",
      "Reflect.set(copy, 'original', globalThis);",
      "globalThis.Reflect.set(copy, 'original', globalThis);",
      "Reflect.set.call(Reflect, copy, 'original', globalThis);",
      'Reflect.preventExtensions(copy);',
    ].join('\n'),
  );

  expect(messages.some(({ ruleId }) => ruleId === 'standards/no-global-mutation')).toBe(false);
});

test('the mutation rule respects a lexically shadowed globalThis parameter', async () => {
  const messages = await lintProbe(
    'export function update(globalThis: { flag: boolean }): void {\n  globalThis.flag = true;\n}\n',
  );

  expect(messages.some(({ ruleId }) => ruleId === 'standards/no-global-mutation')).toBe(false);
});

test('the mutation rule respects a lexically shadowed Node global parameter', async () => {
  const messages = await lintProbe(
    'export function replace(global: unknown): void {\n  global = {};\n  void global;\n}\n',
  );

  expect(messages.some(({ ruleId }) => ruleId === 'standards/no-global-mutation')).toBe(false);
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
