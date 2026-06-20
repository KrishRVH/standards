defmodule StandardsElixirTester.MixProject do
  use Mix.Project

  def project do
    [
      app: :standards_elixir_tester,
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
      ]
    ]
  end

  def cli do
    [preferred_envs: [dialyzer: :test]]
  end

  def application do
    [extra_applications: [:logger]]
  end

  defp deps do
    [
      {:credo, "~> 1.7", only: [:dev, :test], runtime: false},
      {:dialyxir, "~> 1.4", only: [:dev, :test], runtime: false}
    ]
  end
end
