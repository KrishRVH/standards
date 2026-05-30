// eslint-disable-next-line import/no-default-export
export default {
  // Always: (x) => x (stable diffs, consistent style)
  arrowParens: 'always',

  // Put JSX closing bracket on its own line for multiline elements
  bracketSameLine: false,

  // { a: 1 } not {a:1}
  bracketSpacing: true,

  // Format embedded languages (CSS/GraphQL/etc) when safe
  embeddedLanguageFormatting: 'auto',

  // Normalize line endings to LF on write
  endOfLine: 'lf',

  // Respect CSS-like whitespace handling in HTML
  htmlWhitespaceSensitivity: 'css',

  // JSX uses double quotes by default
  jsxSingleQuote: false,

  // Wrap lines at 120 columns
  printWidth: 120,

  // Don't reflow prose (markdown/docs)
  proseWrap: 'preserve',

  // Quote object keys only when required
  quoteProps: 'as-needed',

  // Always use semicolons (avoid ASI edge cases)
  semi: true,

  // Allow multiple props per line if they fit under printWidth
  singleAttributePerLine: false,

  // Prefer single quotes in JS/TS
  singleQuote: true,

  // Two-space indentation
  tabWidth: 2,

  // Trailing commas where valid (diff-friendly)
  trailingComma: 'all',

  // Spaces, not tabs
  useTabs: false,
};
