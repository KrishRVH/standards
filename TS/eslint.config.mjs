import path from 'node:path';
import { fileURLToPath } from 'node:url';

import eslint from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier/flat';
import jsxA11y from 'eslint-plugin-jsx-a11y-x';
import regexp from 'eslint-plugin-regexp';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Flat config runs in ESM, so reconstruct __dirname for TS project service.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// eslint-disable-next-line no-restricted-exports
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
    files: ['**/*.{ts,tsx}'],
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
    files: ['src/**/*.{jsx,tsx}'],
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
    files: ['**/*.{js,jsx,ts,tsx,mjs,cjs}'],
    rules: {
      'no-duplicate-imports': 'error',
      'no-restricted-exports': [
        'error',
        {
          restrictDefaultExports: {
            direct: true,
            named: true,
            defaultFrom: true,
            namedFrom: true,
            namespaceFrom: true,
          },
        },
      ],
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
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
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

  /**
   * 9) d.ts: allow declare global/module while keeping erasable-syntax bans.
   */
  {
    name: 'typescript/dts-ambient-ok',
    files: ['**/*.d.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: 'TSEnumDeclaration', message: 'Do not use TypeScript enums. Use as const objects + union types.' },
        { selector: 'TSParameterProperty', message: 'No parameter properties.' },
        { selector: 'TSImportEqualsDeclaration', message: 'No import =.' },
        { selector: 'TSExportAssignment', message: 'No export =.' },
      ],
    },
  },

  /**
   * 10) UI overlay: component files delegate fiber ownership to a tested framework
   * controller. Runtime adapters should live in ordinary .ts modules.
   */
  {
    name: 'effect/ui-component-fiber-ownership',
    files: ['src/**/*.{jsx,tsx}'],
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
   * 11) JS files: disable type-aware TS rules for performance + correctness.
   * Still enforce ESM-only without eslint-plugin-import.
   */
  {
    name: 'javascript/esm-only',
    files: ['**/*.{js,mjs,jsx}'],
    extends: [tseslint.configs.disableTypeChecked],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: "CallExpression[callee.name='require']", message: 'Do not use require(). Use ESM imports.' },
        {
          selector: "MemberExpression[object.name='module'][property.name='exports']",
          message: 'Do not use module.exports. Use ESM exports.',
        },
        { selector: "MemberExpression[object.name='exports']", message: 'Do not use exports.*. Use ESM exports.' },
      ],
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
   * 14) Hygiene: fail if eslint-disable comments are unused.
   */
  { name: 'base/hygiene', linterOptions: { reportUnusedDisableDirectives: 'error' } },
);
