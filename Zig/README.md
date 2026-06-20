# Zig Standards

Copy `build.zig` and `build.zig.zon` into a Zig project, then replace
`project_name` and `project-name` with the real package and executable names.
Remove the executable target if the project is library-only.

Run `zig build` after copying so the project can get a project-specific package
fingerprint when dependencies are added. Zig dependency hashes live in
`build.zig.zon`; there is no separate lockfile.

The standard gate is:

```sh
mise run zig:fmt:check
mise run zig:lint
mise run zig:test
```
