//! Small library fixture for the Rust standards template.

/// Doubles a value, saturating at [`u32::MAX`] instead of overflowing.
///
/// # Examples
///
/// ```
/// assert_eq!(standards_rust_tester::double(21), 42);
/// ```
#[must_use]
pub fn double(value: u32) -> u32 {
    value.saturating_mul(2)
}

#[cfg(test)]
mod tests {
    use super::double;

    #[test]
    fn doubles_values() {
        assert_eq!(double(21), 42);
    }
}
