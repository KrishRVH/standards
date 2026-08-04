#include <stdio.h>

int main(void)
{
    return fprintf(stderr, "value: %s\n", "one") < 0;
}
