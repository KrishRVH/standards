import comments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import jsxA11y from 'eslint-plugin-jsx-a11y-x';
import regexp from 'eslint-plugin-regexp';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import standardsPlugin from './scripts/eslint-local-rules.mjs';

const javaScriptFiles = '**/*.{cjs,js,jsx,mjs}';
const sourceFiles = '**/*.{cjs,cts,js,jsx,mjs,mts,ts,tsx}';
const typeScriptFiles = '**/*.{cts,mts,ts,tsx}';
const typeScriptSourceFiles = 'src/**/*.{cts,mts,ts,tsx}';
const typeScriptTestFiles = 'tests/**/*.{cts,mts,ts,tsx}';
const unsupportedJavaScriptSourceFiles = 'src/**/*.{cjs,js,jsx,mjs}';

// eslint-disable-next-line standards/no-default-export -- ESLint flat config is consumed through a default export by contract.
export default defineConfig(
  globalIgnores(
    [
      '**/build/**',
      '**/coverage/**',
      '**/dist/**',
      '**/effect-diagnostics/fixtures/**',
      '**/node_modules/**',
      '**/out/**',
      '**/reports/**',
      '**/.stryker-tmp/**',
      '**/type-tests/**',
    ],
    'base/global-ignores',
  ),

  { name: 'base/eslint/recommended', ...eslint.configs.recommended },

  // Scope and alias tracking require semantic rules beyond syntax selectors.
  { name: 'base/local-rules', plugins: { standards: standardsPlugin } },

  // Suppressions name the rule and reason, cover one line, and fail when stale.
  { ...comments.recommended, name: 'eslint-comments/recommended' },
  {
    name: 'base/exception-protocol',
    rules: {
      '@eslint-community/eslint-comments/no-unlimited-disable': 'error',
      '@eslint-community/eslint-comments/no-use': ['error', { allow: ['eslint-disable-next-line'] }],
      '@eslint-community/eslint-comments/require-description': ['error', { ignore: [] }],
    },
  },

  // The recommended RegExp preset has a stable semver contract; the all preset does not.
  { ...regexp.configs['flat/recommended'], name: 'regexp/recommended' },

  // Runtime and framework globals belong in project-specific overlays.
  {
    name: 'base/language',
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.es2024,
      },
    },
  },

  // Parse config files outside src/tests without requiring a tsconfig entry.
  {
    name: 'typescript/parse-only',
    files: [typeScriptFiles],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2024,
        sourceType: 'module',
      },
    },
  },

  // This preset enables JSX parsing without adding browser globals.
  {
    ...jsxA11y.configs.recommended,
    name: 'accessibility/recommended',
    files: ['src/**/*.tsx'],
  },

  // Core import checks avoid an additional plugin compatibility dependency.
  {
    name: 'imports/baseline',
    files: [sourceFiles],
    rules: {
      'no-duplicate-imports': 'error',
      'standards/no-default-export': 'error',
      'sort-imports': [
        'error',
        {
          ignoreCase: false,
          ignoreDeclarationSort: true,
          ignoreMemberSort: false,
          allowSeparatedGroups: true,
        },
      ],
    },
  },

  {
    name: 'typescript/strict-typechecked',
    files: [typeScriptSourceFiles, typeScriptTestFiles],
    ignores: ['**/*.d.ts'],
    extends: [...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Keep source syntax erasable so the transpiler owns JavaScript output.
      'standards/no-module-mutable-binding': 'error',
      'standards/no-typescript-emit-syntax': 'error',
      'standards/no-global-mutation': 'error',

      'array-callback-return': 'error',
      eqeqeq: 'error',
      'no-debugger': 'error',
      'no-eval': 'error',
      'no-else-return': 'error',
      'no-param-reassign': ['error', { props: false }],
      'no-sequences': 'error',
      'no-unreachable': 'error',
      'no-useless-computed-key': 'error',
      'no-useless-escape': 'error',
      'no-useless-return': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'prefer-const': 'error',
      yoda: 'error',

      // EFF-030 permits narrowing casts only at validated boundaries with a
      // reasoned per-site suppression. Object literals use `satisfies`.
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' },
      ],
      '@typescript-eslint/no-unsafe-type-assertion': 'error',
      '@typescript-eslint/consistent-type-exports': ['error', { fixMixedExportsWithInlineTypeSpecifier: true }],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      '@typescript-eslint/no-empty-object-type': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: false }],
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/no-require-imports': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-use-before-define': 'error',
      '@typescript-eslint/no-wrapper-object-types': 'error',
      '@typescript-eslint/prefer-includes': 'error',
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],

      // Type exceptions use the same reason format as lint exceptions; the
      // compiler rejects @ts-expect-error when the expected error disappears.
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': { descriptionFormat: '^ -- .+$' },
          'ts-ignore': true,
          'ts-nocheck': true,
          'ts-check': true,
          minimumDescriptionLength: 10,
        },
      ],

      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/only-throw-error': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',

      // Explicit checks distinguish absent values from zero, false, and empty strings.
      '@typescript-eslint/strict-boolean-expressions': [
        'error',
        {
          allowString: false,
          allowNumber: false,
          allowNullableBoolean: false,
          allowNullableString: false,
          allowNullableNumber: false,
          allowNullableObject: false,
          allowAny: false,
        },
      ],
    },
  },

  // Application work needs explicit timer and process ownership. Tests may
  // use host timers as backstops, so these restrictions stop at src.
  {
    name: 'application/ambient-state-wall',
    files: [typeScriptSourceFiles],
    rules: {
      'standards/no-ambient-runtime': 'error',
      'standards/no-global-mutation': 'error',
      'no-restricted-globals': [
        'error',
        {
          name: 'setImmediate',
          message:
            'Unowned immediate work escapes structured ownership. Use Effect scheduling under the owning fiber, or a scoped signal-aware adapter.',
        },
        {
          name: 'setInterval',
          message:
            'An unowned timer loop is ambient state. Use Effect.repeat/Schedule under an owner, or a scoped signal-aware adapter.',
        },
        {
          name: 'setTimeout',
          message:
            'Unowned delayed work escapes interruption. Use Effect timeout/sleep under the owning fiber, or a signal-aware adapter.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'cluster',
              message: 'Multi-process shared state is out of profile: one Bun process, one runtime owner.',
            },
            {
              name: 'node:cluster',
              message: 'Multi-process shared state is out of profile: one Bun process, one runtime owner.',
            },
            {
              name: 'worker_threads',
              message:
                'Cross-thread shared memory is out of profile. If a worker is genuinely needed, message-pass and justify it per site.',
            },
            {
              name: 'node:worker_threads',
              message:
                'Cross-thread shared memory is out of profile. If a worker is genuinely needed, message-pass and justify it per site.',
            },
            {
              name: 'timers',
              message: 'Timer modules expose unowned scheduling. Use Effect scheduling under the owning fiber.',
            },
            {
              name: 'node:timers',
              message: 'Timer modules expose unowned scheduling. Use Effect scheduling under the owning fiber.',
            },
            {
              name: 'timers/promises',
              message: 'Timer modules expose unowned scheduling. Use Effect scheduling under the owning fiber.',
            },
            {
              name: 'node:timers/promises',
              message: 'Timer modules expose unowned scheduling. Use Effect scheduling under the owning fiber.',
            },
          ],
        },
      ],
    },
  },

  // Tests may assert invariants they establish themselves.
  {
    name: 'typescript/tests-assertion-exemptions',
    files: [typeScriptTestFiles],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // Declaration files may describe ambient globals and modules, which no local code references.
  {
    name: 'typescript/dts-ambient-ok',
    files: ['**/*.d.ts'],
    rules: {
      'no-unused-vars': 'off',
      'standards/no-typescript-emit-syntax': ['error', { allowNamespaces: true }],
    },
  },

  // Components delegate fiber ownership to a tested controller in an ordinary .ts module.
  {
    name: 'effect/ui-component-fiber-ownership',
    files: ['src/**/*.tsx'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          property: 'runFork',
          message: 'Components must use the owned UI operation controller; see EFF-016 and the framework UI overlay.',
        },
      ],
    },
  },

  // JavaScript tooling stays ESM; allowJs is false, so type-aware rules do not apply.
  {
    name: 'javascript/esm-only',
    files: [javaScriptFiles],
    extends: [tseslint.configs.disableTypeChecked],
    rules: {
      'standards/esm-only': 'error',
    },
  },

  // Application source must remain inside the strict TypeScript gate.
  {
    name: 'application/typescript-source-only',
    files: [unsupportedJavaScriptSourceFiles],
    rules: {
      'standards/typescript-source-only': 'error',
    },
  },

  // Apply Prettier after lint presets, then restore the project's brace policy.
  { ...prettier, name: 'prettier/config' },

  { name: 'base/prettier-overrides', rules: { curly: 'error' } },

  {
    name: 'base/hygiene',
    linterOptions: { reportUnusedDisableDirectives: 'error', reportUnusedInlineConfigs: 'error' },
  },
);
