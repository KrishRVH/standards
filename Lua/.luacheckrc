-- Luacheck strict baseline.
-- Add runtime-specific globals such as `love`, `vim`, or test framework symbols
-- in project-specific overrides rather than in this shared default.

std = "lua54"

-- Prefer explicit globals. Set project globals here only when the runtime owns
-- them and passing them as dependencies is not practical.
globals = {}
read_globals = {}

-- Performance: cache all globals.
cache = true

-- StyLua handles whitespace.
ignore = {
  "611", -- trailing whitespace
  "612", -- trailing whitespace in string
  "613", -- trailing whitespace in comment
  "614", -- trailing whitespace in empty line
  "211/^_", -- unused local variables intentionally prefixed with _
  "212/^_", -- unused function arguments intentionally prefixed with _
  "213/^_", -- unused loop variables intentionally prefixed with _
}

-- Match stylua.toml.
max_line_length = 80

-- Keep functions small enough to review.
max_cyclomatic_complexity = 15

-- Exclude generated/vendor output.
exclude_files = {
  "build/**",
  "dist/**",
  "vendor/**",
  "*.min.lua",
}

allow_defined_top = false
