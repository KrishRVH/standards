//! Property tests for the doubling boundary: exact below the saturation
//! threshold, clamped to [`u32::MAX`] above it.

use proptest::prelude::*;

proptest! {
    #[test]
    fn doubles_exactly_below_saturation(value in 0..=u32::MAX / 2) {
        let doubled = value
            .checked_mul(2)
            .expect("value <= u32::MAX / 2, so doubling cannot overflow");
        prop_assert_eq!(project_name::double(value), doubled);
    }

    #[test]
    fn saturates_above_half_max(value in u32::MAX / 2 + 1..=u32::MAX) {
        prop_assert_eq!(project_name::double(value), u32::MAX);
    }
}
