#include <stdlib.h>

static int allocate_and_maybe_fail(int fail)
{
    int *value = malloc(sizeof(*value));
    if (value == NULL) {
        return 0;
    }
    if (fail != 0) {
        return 1;
    }
    free(value);
    return 0;
}

int main(int argc, char *argv[])
{
    return allocate_and_maybe_fail(argc > 1 && argv[1][0] != '\0');
}
