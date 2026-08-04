#include "project/library.h"

#include <limits.h>
#include <stddef.h>

bool project_add(int left, int right, int *result)
{
    if (result == NULL) {
        return false;
    }

    if ((right > 0 && left > INT_MAX - right) ||
        (right < 0 && left < INT_MIN - right)) {
        return false;
    }

    *result = left + right;
    return true;
}
