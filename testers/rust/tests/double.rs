use standards_rust_tester::double;

#[test]
fn doubles_from_integration_test() {
    assert_eq!(double(7), 14);
}
