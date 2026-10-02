# Markdown/MDX Standards

This Bun-backed baseline covers Markdown and MDX in documentation and
content-heavy projects.

Copy these files into a project alongside `Mise/conf.d/20-markdown.toml`:

```text
.markdownlint-cli2.jsonc
.oxfmtrc.json
.prettierignore
lychee.toml
package.json
scripts/check-mdx.mjs
scripts/check-mdx.test.mjs
typos.toml
```

The included `docs/example.md` and `content/example.mdx` files smoke-test the
template and fixture. Keep, replace, or delete them to match the target
project's content layout.

The default gate is deterministic:

```sh
mise run md:standards
mise run md:standards:check
```

`md:standards` runs Oxfmt and markdownlint autofixes.
`md:standards:check` runs markdownlint, frontmatter and MDX checks, checker
tests, Oxfmt, offline local link checking, and typos. Before relying on
`md:standards:check`, generate and commit `bun.lock` with `mise run md:lock`; a
missing lockfile is a failure. Use the deeper task for external links and
package auditing:

```sh
mise run md:standards:check:deep
```

## Posture

- Markdown and MDX are not the same language. markdownlint handles mechanical
  Markdown structure; `scripts/check-mdx.mjs` validates YAML frontmatter in
  Markdown and MDX, then checks MDX syntax with JSX, GFM, and Shiki-compatible
  code fences. Frontmatter must be a valid YAML mapping; field schemas remain
  project-specific.
- Oxfmt formats Markdown and MDX and preserves prose wrapping to avoid churn
  in hand-wrapped posts and docs. It reads ignore paths from `.gitignore` and
  `.prettierignore`. The package pins it exactly because pre-1.0 releases can
  change output. A project that also uses the TypeScript profile keeps that
  profile's `.oxfmtrc.json`, which sets the same Markdown options.
- Code fences should always use a language identifier. Keep Shiki/rehype
  metadata after the language, such as `ts title="example.ts" {1}`.
- The normal link check is offline. Run the deep task for external citations,
  preferably on a schedule or manually.
- Inline `markdownlint` comments are disabled. Record an exception as a narrow
  `overrides` entry in `.markdownlint-cli2.jsonc` with a comment giving its
  reason.
- `typos` is check-only by default. Add project words in `typos.toml` when a
  domain term is intentional.
