#include <stdlib.h>

int main(void)
{
    int *value = malloc(sizeof(*value));
    if (value == NULL) {
        return 0;
    }
    *value = 7;
    free(value);
    return *value;
}
