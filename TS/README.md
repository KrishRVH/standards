# TypeScript Standards

Copy these files into a Bun-backed TypeScript project and replace
`project-name`, source paths, and test commands with the real project shape.

This is a strict, systems-level generic starting template. It uses TypeScript
strict mode, ESLint flat config, Prettier, and a Biome config for projects that
want Biome-compatible formatting/lint policy. Relax rules or package scripts
when the copied baseline is broader than the real project needs.

The standard gate is:

```sh
mise run ts:fmt:check
mise run ts:lint
mise run ts:test
mise run ts:check
```

The default `standards:check` script runs ESLint, `tsc`, and Prettier through
Bun. The Biome config is included as an explicit policy file, but it is not part
of the default tester gate unless a project wires it into its package scripts.
