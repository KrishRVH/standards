#include "project/library.h"

#include <array>

namespace project {

int double_value(int value) {
    const auto parts = std::array{value, value};
    return parts[0] + parts[1];
}

} // namespace project
