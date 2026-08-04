#ifndef PROJECT_DEFECT_H
#define PROJECT_DEFECT_H

#include <stdlib.h>

static inline int header_defect(void)
{
    int *value = malloc(sizeof(*value));
    if (value == NULL) {
        return 0;
    }
    free(value);
    free(value);
    return 0;
}

#endif
