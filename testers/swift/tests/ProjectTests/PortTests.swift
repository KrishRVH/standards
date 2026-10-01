import Project
import Testing

@Test(arguments: [("1", UInt16(1)), ("8080", UInt16(8080)), ("65535", UInt16.max)])
func validServicePorts(input: String, expected: UInt16) throws {
  #expect(try parsePort(input) == expected)
}

@Test(arguments: ["", "0", "-1", "65536", " 80", "80 ", "8.0", "http"])
func invalidServicePorts(input: String) {
  #expect(throws: PortError.invalid) {
    try parsePort(input)
  }
}
