local greeting = require("src.greeting")

describe("greeting", function()
  it("greets by name", function()
    assert.are.equal("Hello, Ada", greeting.greet("Ada"))
  end)
end)
