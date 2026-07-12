package project_name_tests

import "core:testing"
import "project:project_name"

@(test)
double_returns_twice_the_input :: proc(t: ^testing.T) {
	testing.expect_value(t, project_name.double(21), 42)
}
