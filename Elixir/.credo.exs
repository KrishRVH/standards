%{
  configs: [
    %{
      name: "default",
      strict: true,
      files: %{
        included: ["lib/", "test/", "config/", "mix.exs"],
        excluded: ["_build/", "deps/"]
      },
      checks: [
        {Credo.Check.Design.TagFIXME, false},
        {Credo.Check.Design.TagTODO, false},
        {Credo.Check.Refactor.CyclomaticComplexity, max_complexity: 10},
        {Credo.Check.Refactor.Nesting, max_nesting: 3},
        {Credo.Check.Readability.MaxLineLength, max_length: 120}
      ]
    }
  ]
}
