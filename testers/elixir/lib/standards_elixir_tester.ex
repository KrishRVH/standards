defmodule StandardsElixirTester do
  @moduledoc """
  Small public API used to verify the Elixir standards profile.
  """

  @doc """
  Doubles an integer.
  """
  @spec double(integer()) :: integer()
  def double(value) when is_integer(value), do: value * 2
end
