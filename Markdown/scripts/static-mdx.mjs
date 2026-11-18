import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

const parser = unified().use(remarkParse).use(remarkMdx);

function literalAttribute(attribute) {
  if (attribute.type !== 'mdxJsxAttribute') return false;
  if (attribute.value === null || typeof attribute.value === 'string') return true;
  const expression = attribute.value.data.estree.body[0]?.expression;
  if (expression?.type === 'Literal') {
    return expression.value === null || ['string', 'number', 'boolean'].includes(typeof expression.value);
  }
  return expression?.type === 'UnaryExpression' && expression.operator === '-'
    && expression.argument.type === 'Literal' && typeof expression.argument.value === 'number';
}

function isExpression(node) {
  return node.type === 'mdxFlowExpression' || node.type === 'mdxTextExpression';
}

function isPreamble(node) {
  if (node.type === 'mdxjsEsm' || node.type === 'definition') return true;
  if (node.type === 'paragraph') return node.children.every(isPreamble);
  if (node.type === 'text') return !node.value.trim();
  return isExpression(node) && node.data.estree.body.length === 0;
}

function checkNode(node, report, title) {
  if (isExpression(node)) {
    if (node.data.estree.body.length > 0) {
      report(node.position.start.line, 'Write the content as Markdown or literal JSX children.');
    }
    return false;
  }
  if (node.type === 'mdxjsEsm') {
    if (node.data.estree.body.some((statement) => statement.type !== 'ImportDeclaration')) {
      report(node.position.start.line, 'Only import declarations are allowed in MDX.');
    }
    return false;
  }

  let readable = false;
  if (['text', 'inlineCode', 'code'].includes(node.type)) readable = Boolean(node.value.trim());
  if (node.type === 'image' || node.type === 'imageReference') readable = Boolean(node.alt?.trim());
  for (const child of node.children ?? []) {
    if (checkNode(child, report, title)) readable = true;
  }
  if (node.type === 'heading' && node.depth === 1 && title && node !== title) {
    report(node.position.start.line, 'Use a single level-one document title.');
  }
  if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') {
    for (const attribute of node.attributes) {
      if (!literalAttribute(attribute)) {
        report(attribute.position.start.line, 'Use named JSX attributes with literal values.');
      }
    }
    if (node.name && !/^[a-z][a-z0-9]*$/.test(node.name) && !readable) {
      report(node.position.start.line, `Write the content of <${node.name}> in its children so it is readable in source.`);
    }
  }
  return readable;
}

export default {
  names: ['static-mdx'],
  description: 'MDX content must be readable without evaluating JavaScript',
  tags: ['mdx'],
  parser: 'none',
  function: ({ name, lines, frontMatterLines }, onError) => {
    if (!name.toLowerCase().endsWith('.mdx')) return;
    // Keep parser diagnostics in file coordinates. markdownlint adds removed frontmatter lines back itself.
    const offset = frontMatterLines.length;
    const report = (line, detail) => onError({ lineNumber: Math.min(line - offset, lines.length), detail });
    let tree;
    try {
      tree = parser.parse('\n'.repeat(offset) + lines.join('\n'));
    } catch (error) {
      report(error.line ?? offset + 1, error.message);
      return;
    }
    const first = tree.children.find((node) => !isPreamble(node));
    const title = first?.type === 'heading' && first.depth === 1 ? first : null;
    if (!title) {
      const detail = 'Start the document with a level-one heading after any imports and comments.';
      if (!tree.children.length && offset) {
        onError({ frontMatter: true, lineNumber: offset, detail });
      } else {
        report(first?.position.start.line ?? offset + 1, detail);
      }
    }
    checkNode(tree, report, title);
  },
};
