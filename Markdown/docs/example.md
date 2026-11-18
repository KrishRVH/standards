# Validate repository instructions

Run this check after editing a Markdown or MDX instruction file. It reports
the file and line of any structural error.

## Check a documentation change

From the project root with the committed tool lockfiles, run:

```sh
mise run md:standards:check
```

A zero exit status completes the check. If a local link fails, correct the
relative path or heading fragment in the source file and rerun the command.
For an example of instructions inside JSX, read the
[MDX source example](../content/example.mdx#verify-a-local-reference).
