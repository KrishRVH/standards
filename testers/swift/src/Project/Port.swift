/// A failure to parse a TCP or UDP service port.
public enum PortError: Error {
  /// The input is not an unsigned, nonzero 16-bit integer.
  case invalid
}

/// Parses a service port, rejecting zero and values outside the UInt16 range.
public func parsePort(_ input: String) throws -> UInt16 {
  guard let port = UInt16(input), port > 0 else {
    throw PortError.invalid
  }
  return port
}
