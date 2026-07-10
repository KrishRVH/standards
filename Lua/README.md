# Lua Standards

Copy `.luacheckrc`, `.luarc.json`, `stylua.toml`, and
`Mise/conf.d/20-lua.toml` into a Lua project.

This is a strict, systems-level generic starting template. It targets Lua 5.4
because Luacheck 1.2.0 does not currently run under Lua 5.5 in this toolchain.
Relax globals, complexity, or test-runner settings when the copied baseline does
not fit the real host environment.

The standards workflow is:

```sh
mise run lua:standards
mise run lua:fmt:check
mise run lua:lint
mise run lua:test
mise run lua:standards:check
```

`lua:lint` installs pinned Luacheck into `.lua_modules`, then runs Luacheck and
gates LuaLS's JSON diagnostics. `lua:test` installs pinned Busted only when
`busted.lua`, `spec/`, `specs/`, `test/`, or `tests/` is present. Test runs add
`src/` to `LUA_PATH` so fixtures and copied projects can require modules by
their package name. `luarocks` must be available on `PATH` for lint/test tooling.
