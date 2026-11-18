import { load } from 'js-yaml';

export default {
  names: ['yaml-frontmatter'],
  description: 'YAML frontmatter must be a mapping',
  tags: ['metadata'],
  parser: 'none',
  function: ({ frontMatterLines, lines }, onError) => {
    if (frontMatterLines.length === 0) {
      if (/^---[ \t]*$/.test(lines[0])) {
        onError({ lineNumber: 1, detail: 'Missing closing --- delimiter.' });
      }
      return;
    }

    let metadata;
    try {
      metadata = load(frontMatterLines.slice(1, -1).join('\n'));
    } catch (error) {
      onError({ frontMatter: true, lineNumber: (error.mark?.line ?? 0) + 2, detail: error.reason });
      return;
    }
    if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
      onError({ frontMatter: true, lineNumber: 2, detail: 'Expected a YAML mapping.' });
    }
  },
};
