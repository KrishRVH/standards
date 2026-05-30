import prettier from 'eslint-config-prettier/flat';
import importPlugin from 'eslint-plugin-import';
import importHelpers from 'eslint-plugin-import-helpers';

import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import TSESLint from 'typescript-eslint';
import eslint from '@eslint/js';

/**
 * Flat config runs in ESM, so reconstruct __dirname for relative path resolution.
 * Used for import resolver + TS project service root.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// eslint-disable-next-line import/no-default-export
export default defineConfig(
  /**
   * 1) Global ignores (applies regardless of CLI globs)
   * Intent: never lint generated output, vendor deps, coverage, or TS incremental cache files.
   */
  globalIgnores(
    ['**/dist/**', '**/build/**', '**/coverage/**', '**/node_modules/**', '**/*.tsbuildinfo'],
    'base/global-ignores',
  ),

  /**
   * 2) Core ESLint recommended rules (baseline correctness for JS).
   */
  { name: 'base/eslint/recommended', ...eslint.configs.recommended },

  /**
   * 3) Import correctness + import ordering policy.
   * - eslint-plugin-import => correctness
   * - eslint-plugin-import-helpers => deterministic ordering/grouping
   */
  {
    name: 'base/import/overrides',
    plugins: { 'import-helpers': importHelpers },
    extends: [importPlugin.flatConfigs.recommended, importPlugin.flatConfigs.typescript],
    settings: {
      /**
       * Teach eslint-plugin-import how to resolve TS path aliases and node resolution.
       */
      'import/resolver': {
        typescript: { alwaysTryTypes: true, project: path.join(__dirname, 'tsconfig.json') },
        node: true,
      },
    },
    rules: {
      // Reduce duplication with TS + modern ESM (keep signal high).
      'import/default': 'off',
      'import/named': 'off',
      'import/namespace': 'off',

      /**
       * Cycle detection can be expensive on large graphs; disable by default.
       * If architectural cycle enforcement matters, enable it in CI-only or a deep lint script.
       */
      'import/no-cycle': 'off',

      /**
       * Named exports are more grep/refactor friendly.
       */
      'import/no-default-export': 'error',

      'import/no-named-as-default-member': 'off',

      /**
       * Allow bundler-style asset imports without false positives.
       * Double-escaped `\\.` matches a literal dot in the RegExp.
       */
      'import/no-unresolved': [
        'error',
        { ignore: ['\\.(css|scss|sass|less)$', '\\.(svg|png|jpg|jpeg|webp)$'] },
      ],

      // Use import-helpers for ordering instead.
      'import/order': 'off',
      'import/prefer-default-export': 'off',

      /**
       * Enforce stable, readable import blocks:
       * 1) Node built-ins using the node: protocol
       * 2) third-party modules
       * 3) local aliases (@/*, if the project uses one)
       * 4) relative imports
       */
      'import-helpers/order-imports': [
        'error',
        {
          groups: ['/^node:/', 'module', '/^@/', ['parent', 'sibling', 'index']],
          alphabetize: { order: 'asc', ignoreCase: true },
        },
      ],
    },
  },

  /**
   * 4) Global language assumptions.
   * Add browser, node, test-runner, or framework globals in project-specific overlays.
   */
  {
    name: 'base/language',
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.es2022,
      },
    },
  },

  /**
   * 5) TS/TSX: type-aware linting (the main bug-catching layer).
   */
  {
    name: 'TS+TSX',
    files: ['**/*.{ts,tsx}'],
    ignores: ['**/*.d.ts'],
    languageOptions: {
      parser: TSESLint.parser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2022,

        /**
         * Enable TS project service for type-aware rules (no-floating-promises, etc.).
         */
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    extends: [...TSESLint.configs.strictTypeChecked],
    rules: {
      /**
       * Ban TS constructs that require special emit semantics or obscure module structure.
       * Aligns with `erasableSyntaxOnly` and transpiler-owned JavaScript output.
       */
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSEnumDeclaration',
          message: 'Do not use TypeScript enums. Use as const objects + union types.',
        },
        {
          selector: 'TSModuleDeclaration',
          message: 'Ambient declarations (declare global/module/namespace) must live in *.d.ts files only.',
        },
        {
          selector: 'TSParameterProperty',
          message: 'Do not use parameter properties (constructor(public x: number)). Declare fields explicitly.',
        },
        { selector: 'TSImportEqualsDeclaration', message: 'Do not use import =. Use standard ES imports.' },
        { selector: 'TSExportAssignment', message: 'Do not use export =. Use ES exports.' },
      ],

      // General correctness / maintainability rules
      'array-callback-return': 'error',
      eqeqeq: 'error',
      'no-debugger': 'error',
      'no-else-return': 'error',
      'no-nested-ternary': 'off',
      'no-param-reassign': ['error', { props: false }],
      'no-plusplus': 'off',
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
      '@typescript-eslint/consistent-type-exports': [
        'error',
        { fixMixedExportsWithInlineTypeSpecifier: true },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      '@typescript-eslint/no-empty-object-type': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true }],
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
       * - allow @ts-expect-error only with a meaningful description
       * - disallow other ts comment escapes
       */
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': 'allow-with-description',
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
  {
    name: 'types/dts-ambient-ok',
    files: ['**/*.d.ts'],
    languageOptions: {
      parser: TSESLint.parser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    rules: {
      // Re-define the entire rule list for d.ts files:
      'no-restricted-syntax': [
        'error',

        // Keep enum ban.
        { selector: 'TSEnumDeclaration', message: 'Do not use TypeScript enums. Use as const objects + union types.' },

        // Keep other TS emit bans. They are usually irrelevant in d.ts, but harmless.
        { selector: 'TSParameterProperty', message: 'No parameter properties.' },
        { selector: 'TSImportEqualsDeclaration', message: 'No import =.' },
        { selector: 'TSExportAssignment', message: 'No export =.' },

        // Intentionally no TSModuleDeclaration ban here: allows `declare global {}` and `declare module "x" {}`.
      ],
    },
  },

  /**
   * 6) JS files: disable type-aware TS rules for performance + correctness (no TS project context).
   * Still enforce ESM-only and import hygiene.
   */
  {
    name: 'JS+JSX',
    files: ['**/*.js', '**/*.mjs', '**/*.jsx'],
    extends: [TSESLint.configs.disableTypeChecked],
    rules: { 'import/no-commonjs': 'error' },
  },

  /**
   * 7) Prettier must come last to turn off conflicting formatting rules.
   */
  { ...prettier, name: 'prettier/config' },

  /**
   * 8) Re-enable specific rules you want even if Prettier disables them.
   * Here: always require braces for blocks.
   */
  { name: 'base/prettier-overrides', rules: { curly: 'error' } },

  /**
   * 9) Hygiene: fail if eslint-disable comments are unused.
   */
  { name: 'base/hygiene', linterOptions: { reportUnusedDisableDirectives: 'error' } },
);
