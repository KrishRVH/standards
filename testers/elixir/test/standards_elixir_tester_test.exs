defmodule StandardsElixirTesterTest do
  use ExUnit.Case, async: true

  test "doubles integers" do
    assert StandardsElixirTester.double(21) == 42
  end
end
