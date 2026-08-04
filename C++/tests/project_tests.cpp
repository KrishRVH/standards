#include <limits>
#include <stdexcept>

#include "project/library.h"

namespace {

bool rejects_overflow(int value) {
    try {
        static_cast<void>(project::double_value(value));
    } catch (const std::overflow_error&) {
        return true;
    }
    return false;
}

} // namespace

int main() {
    constexpr int maximum_half = std::numeric_limits<int>::max() / 2;
    constexpr int minimum_half = std::numeric_limits<int>::min() / 2;

    if (project::double_value(21) != 42 ||
        project::double_value(maximum_half) != maximum_half * 2 ||
        project::double_value(minimum_half) != minimum_half * 2) {
        return 1;
    }

    return rejects_overflow(maximum_half + 1) && rejects_overflow(minimum_half - 1) ? 0 : 1;
}
