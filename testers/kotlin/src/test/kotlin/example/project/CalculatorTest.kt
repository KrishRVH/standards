package example.project

import kotlin.test.Test
import kotlin.test.assertEquals

class CalculatorTest {
    @Test
    fun addsNumbers() {
        assertEquals(5, Calculator.add(2, 3))
    }
}
