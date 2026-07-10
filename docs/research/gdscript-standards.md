# GDScript standards research

Research date: 2026-07-10. This note evaluates a copyable GDScript profile for
Godot 4.7, using `~/dev/personal/cleave` as the worked example and primary
sources for the general rules.

## Recommended baseline

| Concern | Baseline |
| --- | --- |
| Engine | Pin `godot = "4.7-stable"` through mise and commit the mise lockfile. |
| Formatting | Pin GDToolkit `4.5.0`; run `gdformat` over owned `src` and `tests` trees. |
| Style linting | Run `gdlint` over the same owned trees with a small `.gdlintrc`. |
| Semantic checking | Import, parse every owned `.gd` file, then load every script resource. |
| Tests | Use a tiny headless `SceneTree` test runner for the fixture. Add a framework only when a real project needs its features. |
| Type safety | Require typed declarations and make unsafe dynamic operations errors in `project.godot`. |
| Generated state | Ignore `.godot/`, but commit generated `.uid` sidecars. |

Godot `4.7-stable` is the current stable release as of the research date;
`4.7.1` is still a release candidate and `4.8` is a development release in the
[official archive](https://godotengine.org/download/archive/). An exact stable
pin is therefore preferable to a floating minor, RC, or development build.
Godot's [release policy](https://docs.godotengine.org/en/4.7/about/release_policy.html)
also makes upgrades deliberate: minor releases may contain narrowly scoped
compatibility breaks, while patch releases are the normal bug-fix path.

## Language and project settings

Follow the current
[style guide](https://docs.godotengine.org/en/4.7/tutorials/scripting/gdscript/gdscript_styleguide.html):

- Use tabs displayed at four columns and keep lines at or below 100 characters,
  preferring 80 where it does not harm readability.
- Use `snake_case` for files, functions, variables, and signals;
  `PascalCase` for classes, nodes, and enums; and `CONSTANT_CASE` for constants
  and enum members. Name signals for events, normally in the past tense.
- Keep declarations in the guide's current order. In particular, the Godot 4.7
  order accounts for static variables and methods, overridden virtual methods,
  and inner classes; older third-party ordering rules do not.
- Prefer `:=` when the type is obvious on the same line. Write the type when it
  is not obvious, and explicitly type node references so a wrong node type is
  diagnosed instead of silently becoming `null` through an `as` cast.

Static types catch errors before execution and improve editor assistance and,
in some cases, runtime performance. Godot permits typed and dynamic code to
coexist, but its
[static typing guidance](https://docs.godotengine.org/en/4.7/tutorials/scripting/gdscript/static_typing.html)
recommends choosing a consistent project style. A strict reusable profile
should therefore make untyped declarations and unsafe Variant operations
errors, with a local `@warning_ignore(...)` only when dynamic behavior is
intentional:

```ini
[debug]

gdscript/warnings/untyped_declaration=2
gdscript/warnings/unsafe_property_access=2
gdscript/warnings/unsafe_method_access=2
gdscript/warnings/unsafe_cast=2
gdscript/warnings/unsafe_call_argument=2
gdscript/warnings/missing_await=2
gdscript/warnings/return_value_discarded=1
```

Godot defines `0`, `1`, and `2` as ignore, warn, and error respectively, and an
error-level warning prevents compilation. The keys and defaults are documented
by [ProjectSettings](https://docs.godotengine.org/en/4.7/classes/class_projectsettings.html),
and the [warning system](https://docs.godotengine.org/en/4.7/tutorials/scripting/gdscript/warning_system.html)
documents narrow per-site suppression.

This intentionally changes two details from Cleave:

- Do not enable `inferred_declaration`. Godot's own style guide prefers `:=`
  for obvious types, while that warning exists for teams that require the more
  verbose explicit form.
- Do not carry forward `exclude_addons=true`. Godot 4.7 uses
  `debug/gdscript/warnings/directory_rules`, whose default already excludes
  `res://addons`; owned add-ons can be opted back in individually.

Keep other engine defaults out of the copied config. The exact engine is pinned,
so restating every default adds drift without adding policy.

## Formatter and linter

Godot's script editor provides syntax checking, indentation, whitespace cleanup,
and related editing operations, but neither the
[script editor documentation](https://docs.godotengine.org/en/4.7/tutorials/editor/script_editor.html)
nor the [command-line reference](https://docs.godotengine.org/en/4.7/tutorials/editor/command_line_tutorial.html)
documents a repository-wide batch formatter. It is therefore reasonable to use
one focused external tool for deterministic formatting and style linting.

[GDToolkit](https://github.com/Scony/godot-gdscript-toolkit) provides the
`gdformat` formatter and `gdlint` linter for Godot 4 GDScript. Its
[formatter documentation](https://github.com/Scony/godot-gdscript-toolkit/wiki/4.-Formatter)
defines both rewrite and `--check` modes, and its
[linter documentation](https://github.com/Scony/godot-gdscript-toolkit/wiki/3.-Linter)
defines a parse-and-rules check with nonzero failure status. Pin the current
[4.5.0 release](https://github.com/Scony/godot-gdscript-toolkit/releases/tag/4.5.0)
rather than the README's broad `4.*` compatibility selector.

Treat the tools as complementary:

- `gdformat` owns mechanical source layout.
- `gdlint` owns naming and bounded complexity/style rules.
- Godot owns language semantics, type checking, resource loading, and runtime
  behavior. `gdlint` is not a replacement for an engine parse.

Cleave's `.gdlintrc` is a sound starting point: 100-character lines, modest
file/function complexity limits, and exclusions for `.godot`, third-party
`addons`, and generated/runtime directories. Retain its
`class-definitions-order` disable. GDToolkit's documented ordering model omits
several categories in the current Godot 4.7 guide, so enforcing it would create
false conflicts with the primary style source. Keep the copied config minimal;
project-specific exclusions such as Cleave's `runs` and `tools/godot` do not
belong in a generic template.

## Deterministic headless gate

Expose the following sequence behind the repository's normal mise task names:

1. Verify the universal GDToolkit lock byte-for-byte and sync its tool-owned
   environment.
2. Format or check formatting with `gdformat`.
3. Run `gdlint`.
4. Run `godot --headless --path . --import`.
5. Enumerate every project-owned `.gd` file under `src` and `tests`, then run
   `godot --headless --path . --check-only --script <path>` for each file.
6. Run a native `SceneTree` loader that calls `ResourceLoader.load` for every
   owned script, catching missing dependencies and global-class failures that
   an isolated parse can miss.
7. Run `godot --headless --path . --script tests/run_tests.gd`.

The [command-line reference](https://docs.godotengine.org/en/4.7/tutorials/editor/command_line_tutorial.html)
says that `--headless` selects headless display and dummy audio drivers,
`--import` waits for resource imports and already implies editor and quit modes,
and `--check-only` parses for errors when paired with `--script`. Consequently,
Cleave's extra `--quit` on the import command is redundant, while its per-file
check is important because `--check-only` accepts one script at a time.

The fixture test runner should extend `SceneTree`, make direct assertions, and
call `quit(0)` or `quit(1)`. Godot documents `SceneTree`/`MainLoop` scripts as
the native way to run code from the command line, and
[`SceneTree.quit`](https://docs.godotengine.org/en/4.7/classes/class_scenetree.html#class-scenetree-method-quit)
accepts the process exit code. This is enough to prove a tiny standards fixture
without a test dependency.

Do not use Godot's internal `--test` runner for project tests. The
[engine unit-testing documentation](https://docs.godotengine.org/en/4.7/engine_details/architecture/unit_testing.html)
explicitly says its GDScript runner tests the GDScript implementation itself,
not user scripts. Also defer GdUnit4 in the base template: its current
[6.1.3 release](https://github.com/godot-gdunit-labs/gdUnit4/releases/tag/v6.1.3)
advertises support through Godot 4.6.x, not the pinned 4.7 engine. A consuming
project can add a compatible release later when it needs scene tests, mocks, or
parameterized cases.

## Layout, version control, and editor defaults

Use `src/` and `tests/` in the copyable fixture to match this catalog, but keep
scene-specific scripts and assets together within `src`. Godot exposes the
filesystem directly, and its
[project organization guidance](https://docs.godotengine.org/en/4.7/tutorials/best_practices/project_organization.html)
recommends feature-oriented grouping, `snake_case` paths, and a top-level
`addons/` directory. Use `.gdignore` only for directories that must be invisible
to the resource system; ignored resources cannot be loaded by the project.

Commit `project.godot`, `.gd`, `.tscn`, `.tres`, and `.uid` files. Ignore the
`.godot/` import cache and generated translation outputs as described in the
[version-control guidance](https://docs.godotengine.org/en/4.7/tutorials/best_practices/version_control_systems.html).
Godot's [UID migration guidance](https://godotengine.org/article/uid-changes-coming-to-godot-4-4/)
specifically requires committing script/shader `.uid` sidecars and moving them
with their source files; they are durable reference metadata, not disposable
cache.

Use a small `.editorconfig` to make the language rules visible outside Godot:

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true

[*.gd]
indent_style = tab
indent_size = 4
max_line_length = 100
```

These settings combine the GDScript style guide with the UTF-8/LF/final-newline
defaults used by the official
[Godot engine](https://github.com/godotengine/godot/blob/master/.editorconfig)
and [demo projects](https://github.com/godotengine/godot-demo-projects/blob/master/.editorconfig).

## Pinning and deliberately deferred tools

The local mise registry already maps `godot` to the Aqua package
`godotengine/godot`, so the profile does not need Cleave's custom download and
checksum script. Mise's
[Aqua backend](https://mise.jdx.dev/dev-tools/backends/aqua.html) always verifies
checksums, while the
[mise lockfile](https://mise.jdx.dev/dev-tools/mise-lock.html) records exact
versions, platform artifacts, checksums, and provenance. Pin Godot and
GDToolkit exactly, route every command through mise, and commit the fixture
lockfile. Export templates are unnecessary until the profile gains an export
gate.

Cleave's hashed `requirements.txt` records wheels for its Linux-x64 host, which
is correct for that application but not for a copyable catalog. Generate a
universal [PEP 751 lock](https://docs.astral.sh/uv/pip/compile/) instead: it
records source distributions and all published wheels with their hashes, so uv
can select a verified artifact on macOS, Linux, or Windows. The pinned uv
version still preview-gates consuming this standardized format; acknowledge
that feature explicitly in the task, and reassess it when deliberately
upgrading uv.

[gdstyle](https://github.com/atelico/gdstyle) is a promising single-binary
formatter/linter, but its current
[v0.2.1 release](https://github.com/atelico/gdstyle/releases/tag/v0.2.1) was
published only two days before this research and remains pre-1.0. Deferring it
is a maturity judgment, not a criticism of its design: GDToolkit already has a
proven Cleave configuration and keeps this first profile predictable. Revisit
gdstyle when its output/config stability and Godot-version coverage have had
time to settle.
