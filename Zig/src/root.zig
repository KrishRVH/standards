const std = @import("std");

pub fn add(left: i32, right: i32) i32 {
    return left + right;
}

test "add" {
    try std.testing.expectEqual(@as(i32, 5), add(2, 3));
}
