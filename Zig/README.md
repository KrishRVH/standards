# Zig Standards

Copy `build.zig`, `build.zig.zon`, `scripts/format.sh`, and `src/` into a Zig
project, put `Mise/conf.d/20-zig.toml` in `.config/mise/conf.d/`, then replace
`project_name` and `project-name` with the real package and executable names.
Keep or add the project's own `README.md`, which the package manifest includes.
Remove the executable target if the project is library-only.

The baseline starts with Zig's native format, build, and test checks. Remove
targets or release variants when the package does not need the full set.

After renaming the package, delete the copied fingerprint and run
`mise run zig:lint`; Zig fails with a suggested fingerprint for the new
package identity. Add that value to `build.zig.zon` and keep it stable across
releases. Zig dependency hashes live in `build.zig.zon`; there is no separate
lockfile.

The standards workflow is:

```sh
mise run zig:standards
mise run zig:fmt:check
mise run zig:lint
mise run zig:test
mise run zig:release
mise run zig:standards:check
```
