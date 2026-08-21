//! Property tests for the doubling boundary: exact below the saturation
//! threshold, clamped to [`u32::MAX`] above it.
#![expect(
    clippy::arithmetic_side_effects,
    reason = "test-established bounds: value is drawn from 0..=u32::MAX / 2, so value * 2 cannot overflow"
)]

use proptest::prelude::*;

proptest! {
    #[test]
    fn doubles_exactly_below_saturation(value in 0..=u32::MAX / 2) {
        prop_assert_eq!(project_name::double(value), value * 2);
    }

    #[test]
    fn saturates_above_half_max(value in u32::MAX / 2 + 1..=u32::MAX) {
        prop_assert_eq!(project_name::double(value), u32::MAX);
    }
}
