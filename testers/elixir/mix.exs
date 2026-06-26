defmodule ProjectName.MixProject do
  use Mix.Project

  def project do
    [
      app: :project_name,
      version: "0.1.0",
      elixir: "~> 1.20",
      start_permanent: Mix.env() == :prod,
      deps: deps(),
      dialyzer: [
        plt_add_apps: [:mix],
        flags: [
          :error_handling,
          :extra_return,
          :missing_return,
          :underspecs,
          :unknown,
          :unmatched_returns
        ]
      ],
      test_coverage: [tool: ExCoveralls]
    ]
  end

  def cli do
    [
      preferred_envs: [
        coveralls: :test,
        "coveralls.html": :test,
        dialyzer: :test,
        "deps.audit": :test
      ]
    ]
  end

  def application do
    [
      extra_applications: [:logger]
    ]
  end

  defp deps do
    [
      {:credo, "~> 1.7", only: [:dev, :test], runtime: false},
      {:dialyxir, "~> 1.4", only: [:dev, :test], runtime: false},
      {:ex_doc, "~> 0.38", only: [:dev], runtime: false},
      {:excoveralls, "~> 0.18", only: [:test], runtime: false},
      {:mix_audit, "~> 2.1", only: [:dev, :test], runtime: false}
    ]
  end
end
