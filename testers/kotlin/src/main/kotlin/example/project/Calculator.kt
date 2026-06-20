package example.project

/** Arithmetic helpers used by the tester fixture. */
public object Calculator {
    /** Returns the sum of two integers. */
    public fun add(
        left: Int,
        right: Int,
    ): Int = left + right
}
