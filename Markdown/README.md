# Markdown for agent ingestion

Use this profile for instructions and reference documents an agent reads from a
checkout. It checks the structure of Markdown and the statically readable
subset of MDX.

## Adopt the profile

1. Merge the [Markdown instructions](AGENTS.md) into the adopting project's
   agent guide.
2. From this profile, copy [.markdownlint-cli2.jsonc](.markdownlint-cli2.jsonc),
   [lychee.toml](lychee.toml), [typos.toml](typos.toml), and the files in
   [scripts/](scripts/) to the same paths under the adopting project's root.
3. Merge the scripts, dependencies, and overrides from this profile's
   [package.json](package.json) into the project's `package.json`. Copy the
   [Markdown mise tasks](../Mise/conf.d/20-markdown.toml) to
   `.config/mise/conf.d/20-markdown.toml` in the project.
4. From the project root, run `mise run md:lock`, commit `bun.lock`, and run
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
themes to the author. Review a procedure by reading only that section of the
source. Can an agent tell where to run the command, what to run, and which
result confirms success?

## Run the checks

- `mise run md:standards` applies structural fixes supported by markdownlint.
- `mise run md:standards:check` validates the documents and exercises the
  policy on valid and invalid inputs. Configure exceptions in
  the [Markdown lint config](.markdownlint-cli2.jsonc) with their scope and
  rationale.
- `mise run md:standards:check:deep` also checks external links and audits
  tooling dependencies. The audit exempts development dependency picomatch
  for advisory GHSA-fc5q-39xc-vjpf until a patched version resolves in the
  lockfile. The KaTeX override supplies a patched version for markdownlint's
  math parser.
