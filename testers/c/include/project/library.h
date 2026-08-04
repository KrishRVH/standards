#ifndef PROJECT_LIBRARY_H
#define PROJECT_LIBRARY_H

#include <stdbool.h>

#include "project/library_export.h"

/*
 * Add two int values when the mathematical result is representable.
 *
 * On success, returns true and stores the sum in *result. On an unrepresentable
 * sum or a null result pointer, returns false and leaves any pointed-to result
 * unchanged.
 */
PROJECT_LIBRARY_EXPORT bool project_add(int left, int right, int *result);

#endif
