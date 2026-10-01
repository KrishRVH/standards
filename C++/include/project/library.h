#ifndef PROJECT_LIBRARY_H
#define PROJECT_LIBRARY_H

namespace project {

/**
 * Returns twice the supplied value.
 *
 * @throws std::overflow_error when the result is not representable as an int.
 */
[[nodiscard]] int double_value(int value);

} // namespace project

#endif // PROJECT_LIBRARY_H
