using System;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace StandardsCsharpTester;

/// <summary>
/// Verifies the calculator fixture API.
/// </summary>
[TestClass]
public sealed class CalculatorTests
{
    /// <summary>
    /// Verifies that <see cref="Calculator.Twice(int)" /> returns twice its input.
    /// </summary>
    [TestMethod]
    public void TwiceReturnsTwiceTheInput() => Assert.AreEqual(42, Calculator.Twice(21));

    /// <summary>
    /// Verifies that checked arithmetic rejects an unrepresentable result.
    /// </summary>
    [TestMethod]
    public void TwiceThrowsWhenResultOverflows() =>
        Assert.ThrowsExactly<OverflowException>(() => Calculator.Twice(int.MaxValue));
}
