const tester = @import("standards_zig_tester");

pub fn main() !void {
    _ = tester.add(2, 3);
}

test {
    @import("std").testing.refAllDecls(@This());
}
