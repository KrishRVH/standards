import path from 'node:path';
import { fileURLToPath } from 'node:url';

import comments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import jsxA11y from 'eslint-plugin-jsx-a11y-x';
import regexp from 'eslint-plugin-regexp';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import { standardsPlugin } from './scripts/eslint-local-rules.mjs';

/**
 * Flat config runs in ESM, so reconstruct __dirname for TS project service.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const applicationSourceFiles = 'src/**/*.{cts,mts,ts,tsx}';
const javaScriptFiles = '**/*.{cjs,js,jsx,mjs}';
const sourceFiles = '**/*.{cjs,cts,js,jsx,mjs,mts,ts,tsx}';
const typeScriptFiles = '**/*.{cts,mts,ts,tsx}';
const typeScriptSourceFiles = 'src/**/*.{cts,mts,ts,tsx}';
const typeScriptTestFiles = 'tests/**/*.{cts,mts,ts,tsx}';
const unsupportedJavaScriptSourceFiles = 'src/**/*.{cjs,js,jsx,mjs}';

// eslint-disable-next-line standards/no-default-export -- ESLint flat config is consumed through a default export by contract.
export default defineConfig(
  /**
   * 1) Global ignores (applies regardless of CLI globs)
   * Intent: never lint generated output, vendor deps, coverage, or TS incremental cache files.
   */
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
      '**/*.tsbuildinfo',
    ],
    'base/global-ignores',
  ),

  /**
   * 2) Core ESLint recommended rules (baseline correctness for JS).
   */
  { name: 'base/eslint/recommended', ...eslint.configs.recommended },

  /**
   * 2a) Project-local semantic rules for boundaries that cannot be expressed
   * reliably as syntax selectors alone.
   */
  { name: 'base/local-rules', plugins: { standards: standardsPlugin } },

  /**
   * 2b) Exception protocol: every suppression is per-site, reasoned, and
   * self-expiring. A disable without rule names is a silenced wall, not an
   * exception; a disable without a `-- reason` is not reviewable; and block
   * disables span unbounded code. Unused directives already fail below.
   */
  { ...comments.recommended, name: 'eslint-comments/recommended' },
  {
    name: 'base/exception-protocol',
    rules: {
      '@eslint-community/eslint-comments/no-unlimited-disable': 'error',
      '@eslint-community/eslint-comments/no-use': ['error', { allow: ['eslint-disable-next-line'] }],
      '@eslint-community/eslint-comments/require-description': ['error', { ignore: [] }],
    },
  },

  /**
   * 3) RegExp correctness and complexity checks.
   * The recommended preset is intentionally used instead of the semver-unstable all preset.
   */
  { ...regexp.configs['flat/recommended'], name: 'regexp/recommended' },

  /**
   * 4) Global language assumptions.
   * Add browser, node, test-runner, or framework globals in project-specific overlays.
   */
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

  /**
   * 5) Parse all TS/TSX files, including config files outside src/tests.
   * Type-aware rules are scoped below so config files do not need to be in tsconfig.json.
   */
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

  /**
   * 6) JSX/TSX accessibility baseline.
   * The preset also enables JSX parsing without adding browser globals.
   */
  {
    ...jsxA11y.configs.recommended,
    name: 'accessibility/recommended',
    files: ['src/**/*.tsx'],
  },

  /**
   * 7) Import/export baseline using ESLint core rules only.
   * This avoids eslint-plugin-import compatibility churn while preserving the key policies:
   * - no duplicate imports
   * - sorted import specifiers
   * - no default exports
   */
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

  /**
   * 8) TS/TSX: type-aware correctness and modern TypeScript idioms.
   */
  {
    name: 'typescript/strict-typechecked',
    files: [typeScriptSourceFiles, typeScriptTestFiles],
    ignores: ['**/*.d.ts'],
    extends: [...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      /**
       * Ban TS constructs that require special emit semantics or obscure module structure.
       * Aligns with `erasableSyntaxOnly` and transpiler-owned JavaScript output.
       */
      'standards/no-module-mutable-binding': 'error',
      'standards/no-typescript-emit-syntax': 'error',
      'standards/no-global-mutation': 'error',

      // General correctness / maintainability rules
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

      // TS hygiene / correctness
      /**
       * Casts are earned at validated boundaries only (EFF-030). A narrowing
       * assertion outside a validated adapter is a per-site exception with a
       * reasoned suppression; an object-literal assertion has a safe
       * replacement in `satisfies`.
       */
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

      /**
       * Controlled escape hatches:
       * - allow @ts-expect-error only with a `-- reason` in the same shape as
       *   ESLint disable directives; the compiler expires it when the error
       *   stops occurring, so stale suppressions cannot accumulate
       * - disallow the non-expiring ts comment escapes entirely
       */
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

      /**
       * Very strict boolean coercion policy. Forces explicit checks.
       * Tradeoff: more verbosity; upside: fewer truthiness bugs.
       */
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

  /**
   * 8b) Production-only ambient-state wall for every supported application
   * source extension. Unowned timers and cross-process or cross-thread shared
   * memory are design smells in src; tests may hold a timer backstop, so the
   * wall stops at the src boundary.
   */
  {
    name: 'application/ambient-state-wall',
    files: [applicationSourceFiles],
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

  /**
   * 8c) Tests may assert invariants the test itself established, mirroring
   * the production/test split of the panic-class rules. Production code is
   * not a test fixture; nothing else relaxes here.
   */
  {
    name: 'typescript/tests-assertion-exemptions',
    files: [typeScriptTestFiles],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  /**
   * 9) d.ts: allow declare global/module while keeping erasable-syntax bans.
   */
  {
    name: 'typescript/dts-ambient-ok',
    files: ['**/*.d.ts'],
    rules: {
      'standards/no-typescript-emit-syntax': ['error', { allowNamespaces: true }],
    },
  },

  /**
   * 10) UI overlay: component files delegate fiber ownership to a tested framework
   * controller. Runtime adapters should live in ordinary .ts modules.
   */
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

  /**
   * 11) JavaScript tooling files: disable type-aware TS rules because allowJs
   * is deliberately false. Still enforce ESM-only; JavaScript under src is
   * rejected by the application-source policy below.
   */
  {
    name: 'javascript/esm-only',
    files: [javaScriptFiles],
    extends: [tseslint.configs.disableTypeChecked],
    rules: {
      'standards/esm-only': 'error',
    },
  },

  /**
   * 11b) Application code is compiler-owned. JavaScript remains available for
   * tooling/config files, but cannot silently bypass the strict TypeScript gate
   * under src.
   */
  {
    name: 'application/typescript-source-only',
    files: [unsupportedJavaScriptSourceFiles],
    rules: {
      'standards/typescript-source-only': 'error',
    },
  },

  /**
   * 12) Prettier must come last to turn off conflicting formatting rules.
   */
  { ...prettier, name: 'prettier/config' },

  /**
   * 13) Re-enable specific rules you want even if Prettier disables them.
   * Here: always require braces for blocks.
   */
  { name: 'base/prettier-overrides', rules: { curly: 'error' } },

  /**
   * 14) Hygiene: fail on unused eslint-disable comments and on inline configs
   * that change nothing — stale suppressions self-expire instead of piling up.
   */
  {
    name: 'base/hygiene',
    linterOptions: { reportUnusedDisableDirectives: 'error', reportUnusedInlineConfigs: 'error' },
  },
);
