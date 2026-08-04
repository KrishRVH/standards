#ifndef PROJECT_LIBRARY_H_
#define PROJECT_LIBRARY_H_

namespace project {

/**
 * Returns twice the supplied value.
 *
 * @throws std::overflow_error when the result is not representable as an int.
 */
[[nodiscard]] int double_value(int value);

} // namespace project

#endif // PROJECT_LIBRARY_H_
