local greeting = require("greeting")

describe("greeting", function()
  it("greets by name", function()
    assert(greeting.greet("Ada") == "Hello, Ada")
  end)
end)
