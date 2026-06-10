-- Luacheck strict baseline.
--
-- Add runtime-specific globals such as `love`, `vim`, or host application APIs
-- in project-specific overrides. Keep this shared default portable.

std = "lua54"

-- Require explicit locals and explicit dependency boundaries.
allow_defined = false
allow_defined_top = false
module = false

-- Keep all hygiene checks enabled. Prefix intentionally unused values with `_`.
unused = true
unused_args = true
unused_secondaries = true
redefined = true
self = true

ignore = {
  "211/^_", -- intentionally unused local variables
  "212/^_", -- intentionally unused function arguments
  "213/^_", -- intentionally unused loop variables
}

-- Match stylua.toml and keep functions small enough to review.
max_line_length = 80
max_cyclomatic_complexity = 10

-- Exclude dependency, cache, build, coverage, and generated artifacts.
exclude_files = {
  ".lua_modules/**",
  "lua_modules/**",
  "luarocks_modules/**",
  "vendor/**",
  "third_party/**",
  "build/**",
  "dist/**",
  "coverage/**",
  "*.min.lua",
}

-- Busted is the test runner installed by the shared mise Lua task.
files["spec/*.lua"] = { std = "lua54+busted" }
files["spec/**/*.lua"] = { std = "lua54+busted" }
files["specs/*.lua"] = { std = "lua54+busted" }
files["specs/**/*.lua"] = { std = "lua54+busted" }
files["test/*.lua"] = { std = "lua54+busted" }
files["test/**/*.lua"] = { std = "lua54+busted" }
files["tests/*.lua"] = { std = "lua54+busted" }
files["tests/**/*.lua"] = { std = "lua54+busted" }
