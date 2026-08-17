using System;
using CsCheck;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace StandardsCsharpTester;

/// <summary>
/// Property tests for the doubling boundary: exact wherever the result is
/// representable, checked overflow everywhere outside. A counterexample found
/// by a property run gets pinned as a deterministic example test.
/// </summary>
[TestClass]
public sealed class CalculatorProperties
{
    /// <summary>
    /// Verifies that doubling is exact across the full representable range.
    /// </summary>
    [TestMethod]
    public void TwiceDoublesExactlyWithinRange() =>
        Gen.Int[int.MinValue / 2, int.MaxValue / 2].Sample(value => Calculator.Twice(value) == value + value);

    /// <summary>
    /// Verifies that results above the int range are rejected, not wrapped.
    /// </summary>
    [TestMethod]
    public void TwiceThrowsAboveHalfMax() =>
        Gen.Int[(int.MaxValue / 2) + 1, int.MaxValue].Sample(value =>
        {
            Assert.ThrowsExactly<OverflowException>(() => Calculator.Twice(value));
        });

    /// <summary>
    /// Verifies that results below the int range are rejected, not wrapped.
    /// </summary>
    [TestMethod]
    public void TwiceThrowsBelowHalfMin() =>
        Gen.Int[int.MinValue, (int.MinValue / 2) - 1].Sample(value =>
        {
            Assert.ThrowsExactly<OverflowException>(() => Calculator.Twice(value));
        });
}
