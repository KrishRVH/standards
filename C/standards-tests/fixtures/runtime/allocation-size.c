#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>

static bool checked_size_product(size_t count,
                                 size_t element_size,
                                 size_t *result)
{
    if (element_size != 0U && count > SIZE_MAX / element_size) {
        return false;
    }
    *result = count * element_size;
    return true;
}

int main(void)
{
    size_t size = 1U;
    if (checked_size_product(SIZE_MAX, 2U, &size)) {
        return 1;
    }
    if (!checked_size_product(0U, SIZE_MAX, &size) || size != 0U) {
        return 1;
    }
    if (!checked_size_product(3U, sizeof(int), &size) ||
        size != 3U * sizeof(int)) {
        return 1;
    }
    return 0;
}
