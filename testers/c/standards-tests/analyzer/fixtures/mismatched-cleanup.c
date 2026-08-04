#include <stdio.h>
#include <stdlib.h>

int main(void)
{
    FILE *file = tmpfile();
    if (file == NULL) {
        return 0;
    }
    free(file);
    return 0;
}
