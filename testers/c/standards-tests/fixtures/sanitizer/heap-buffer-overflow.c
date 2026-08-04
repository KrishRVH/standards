#include <stddef.h>
#include <stdlib.h>

int main(void)
{
    int *values = malloc(2U * sizeof(*values));
    volatile size_t invalid_index = 2U;
    if (values == NULL) {
        return 0;
    }

    values[invalid_index] = 7;
    free(values);
    return 0;
}
