#include <limits.h>

int main(void)
{
    volatile int maximum = INT_MAX;
    volatile int overflowed = maximum + 1;
    return overflowed == 0;
}
