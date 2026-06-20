defmodule StandardsElixirTester do
  @moduledoc false

  @spec double(integer()) :: integer()
  def double(value) when is_integer(value), do: value * 2
end
