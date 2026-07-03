# Markdown/MDX Standards

Bun-backed Markdown and MDX standards for documentation and content-heavy
projects.

Copy these files into a project alongside `Mise/conf.d/20-markdown.toml`:

```text
.markdownlint-cli2.jsonc
lychee.toml
package.json
prettier.config.mjs
scripts/check-mdx.mjs
typos.toml
```

The default gate is intentionally deterministic:

```sh
mise run md:standards
mise run md:standards:check
```

`md:standards` runs Prettier and markdownlint autofixes. `md:standards:check`
runs markdownlint, the MDX compiler check, Prettier check, offline local link
checking, and typos. Generate and commit `bun.lock` with `mise run md:lock`
before relying on `md:standards:check`; the gate fails when the lockfile is
missing. External links and package audit are available through:

```sh
mise run md:standards:check:deep
```

## Posture

- Markdown and MDX are not the same language. markdownlint handles mechanical
  Markdown structure; `scripts/check-mdx.mjs` handles MDX syntax with JSX,
  frontmatter, GFM, and Shiki-compatible code fences.
- Prettier preserves prose wrapping to avoid churn in hand-wrapped posts and
  docs.
- Code fences should always use a language identifier. Keep Shiki/rehype
  metadata after the language, such as `ts title="example.ts" {1}`.
- The normal link check is offline. Run the deep task for external citations,
  preferably on a schedule or manually.
- `typos` is check-only by default. Add project words in `typos.toml` when a
  domain term is intentional.
