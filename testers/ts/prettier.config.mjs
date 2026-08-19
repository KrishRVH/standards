// Every option is spelled out, defaults included, so a Prettier major cannot
// silently reformat the tree; only printWidth and singleQuote deviate.
// eslint-disable-next-line no-restricted-exports -- Prettier loads its config through a default export by contract.
export default {
  arrowParens: 'always',
  bracketSameLine: false,
  bracketSpacing: true,
  embeddedLanguageFormatting: 'auto',
  endOfLine: 'lf',
  htmlWhitespaceSensitivity: 'css',
  jsxSingleQuote: false,
  printWidth: 120,
  proseWrap: 'preserve',
  quoteProps: 'as-needed',
  semi: true,
  singleAttributePerLine: false,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'all',
  useTabs: false,
};
