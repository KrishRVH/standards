package example.project

import kotlin.test.Test
import kotlin.test.assertEquals

class CalculatorTest {
    @Test
    fun addsNumbers() {
        assertEquals(expected = 5, actual = Calculator.add(left = 2, right = 3))
    }
}
