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
