namespace StandardsCsharpTester;

[TestClass]
public sealed class CalculatorTests {
    [TestMethod]
    public void DoubleReturnsTwiceTheInput() {
        Assert.AreEqual(42, Calculator.Double(21));
    }
}
