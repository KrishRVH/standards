#include <stdio.h>

int main(void)
{
    (void)fputs("cannot read ", stderr);
    (void)fputs("input.txt", stderr);
    (void)fputc('\n', stderr);
    return 1;
}
