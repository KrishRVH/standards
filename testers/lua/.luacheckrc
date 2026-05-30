std = "lua54"

files["spec/*_spec.lua"] = {
  read_globals = {
    "describe",
    "it",
    "assert",
  },
}
