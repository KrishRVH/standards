namespace StandardsCsharpTester;

/// <summary>
/// Provides deterministic integer arithmetic for the C# standards fixture.
/// </summary>
public static class Calculator {
    /// <summary>
    /// Returns twice the supplied integer.
    /// </summary>
    /// <param name="value">The integer to double.</param>
    /// <returns>The doubled integer.</returns>
    public static int Twice(int value) => value * 2;
}
