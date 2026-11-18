# Markdown for agent ingestion

Use this profile for instructions and reference documents an agent reads from a
checkout. It checks the structure of Markdown and the statically readable
subset of MDX. The authoring rules cover section retrieval, context links,
exact identifiers, and observable outcomes. Merge them into the agent guide of
the adopting project. [Markdown instructions](AGENTS.md)

## Adopt the profile

1. Copy `.markdownlint-cli2.jsonc`, `lychee.toml`, `typos.toml`, and the
   files under `scripts/` into the project at the same paths.
2. Merge this profile's `package.json` scripts, dependencies, and overrides
   with the project's package manifest. Install
   `Mise/conf.d/20-markdown.toml` under `.config/mise/conf.d/`.
3. From the project root, run `mise run md:lock`, commit `bun.lock`, and run
   `mise run md:standards:check`. A zero exit status means the sources pass
   the structural, metadata, local link, spelling, and policy checks.

## Source contract

A standalone document begins with a single ATX title. Heading levels describe
the section hierarchy. Code blocks have language labels, images have alt text,
and links name their destinations. The gate checks local paths and heading
fragments offline. The GitHub pull request body is a fragment whose title is
supplied by GitHub. Register other host-owned fragments with a narrow rule
override when adopting the profile.

MDX can wrap literal instructions in JSX. Keep the information in Markdown or
literal JSX children. Put runnable JavaScript examples in fences. The checker
parses MDX without importing its modules or evaluating its expressions.
[Markdown example](docs/example.md) and [MDX example](content/example.mdx)

YAML frontmatter is optional. When supplied, it must be a mapping with unique
keys. An agent can read the visible title and section path without consulting
metadata. The gate leaves prose wrapping, table alignment, and highlighting
themes to the author. Review whether a section contains enough information to
act on it by reading the source in isolation.

## Run the checks

- `mise run md:standards` applies structural fixes supported by markdownlint.
- `mise run md:standards:check` validates the documents and exercises the
  policy on valid and invalid inputs. Configure exceptions in
  `.markdownlint-cli2.jsonc` with their scope and rationale.
- `mise run md:standards:check:deep` also checks external links and audits
  tooling dependencies. The audit exempts development dependency picomatch
  for advisory GHSA-fc5q-39xc-vjpf until a patched version resolves in the
  lockfile. The KaTeX override supplies a patched version for markdownlint's
  math parser.
