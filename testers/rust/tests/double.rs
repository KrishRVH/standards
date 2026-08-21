//! Example-based integration test for the public doubling API.

use project_name::double;

#[test]
fn doubles_from_integration_test() {
    assert_eq!(double(7), 14);
}
