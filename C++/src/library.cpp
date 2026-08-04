#include "project/library.h"

#include <limits>
#include <stdexcept>

namespace project {

int double_value(int value) {
    if (value > std::numeric_limits<int>::max() / 2 ||
        value < std::numeric_limits<int>::min() / 2) {
        throw std::overflow_error("double_value result is outside the int range");
    }
    return value * 2;
}

} // namespace project
