#include "project/library.h"

#include <limits.h>
#include <stddef.h>

int main(void)
{
    int result = 0;

    if (!project_add(2, 3, &result) || result != 5) {
        return 1;
    }

    result = 17;
    if (project_add(INT_MAX, 1, &result) || result != 17) {
        return 1;
    }
    if (project_add(INT_MIN, -1, &result) || result != 17) {
        return 1;
    }
    if (!project_add(INT_MAX, 0, &result) || result != INT_MAX) {
        return 1;
    }
    if (!project_add(INT_MIN, 0, &result) || result != INT_MIN) {
        return 1;
    }
    if (project_add(0, 0, NULL)) {
        return 1;
    }

    return 0;
}
