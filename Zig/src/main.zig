const project_name = @import("project_name");

pub fn main() !void {
    _ = project_name.add(2, 3);
}

test {
    @import("std").testing.refAllDecls(@This());
}
