# GDScript Standards

Copy `.config/python/gdtoolkit-requirements.in`,
`.config/python/pylock.gdtoolkit.toml`, `.editorconfig`, `.gdlintrc`,
`project.godot`, `src/`, and `tests/` into a Godot project. Copy
`Mise/conf.d/20-godot.toml` to `.config/mise/conf.d/20-godot.toml`, then replace
`Project Name` and the sample code with the real project identity and behavior.
Use the shared `.gitignore` and `.gitattributes` alongside these files so the
tool cache and Godot-generated state stay untracked while project resources
remain normalized text.

This is a strict, typed Godot 4.7 starting template. It pins Godot and
GDToolkit, treats untyped declarations and unsafe dynamic operations as
compile errors, preserves idiomatic `:=` inference, and keeps generated
`.godot/` state out of version control. Let Godot create `.uid` sidecars and
commit them with their source files.

Refresh the GDToolkit lock only when intentionally upgrading its dependency
set:

```sh
mise run godot:lock
```

The normal workflow is:

```sh
mise run godot:install
mise run godot:import
mise run godot:standards
mise run godot:fmt:check
mise run godot:lint
mise run godot:test
mise run godot:standards:check
```

`godot:lock` resolves the GDToolkit input pin into a universal PEP 751 lock
containing hashes for source distributions and all available wheels.
`godot:lock:check` regenerates that lock without upgrades and compares it
byte-for-byte at the start of `godot:standards:check`. The installer owns
`.cache/gdtoolkit`; it never modifies a project's Python environment.
`godot:import` scans new and changed resources headlessly, including generated
`.uid` sidecars that should be committed with their source files.
`godot:lint` runs `gdlint`, imports the project headlessly, asks Godot to parse
and type-check every owned script under `src/` and `tests/`, then loads every
script resource to catch dependency and global-class failures.
`godot:test` runs the small native `SceneTree` test entrypoint. Replace that
task with a pinned project test framework when scene fixtures, mocks, or
parameterized tests justify the dependency.
