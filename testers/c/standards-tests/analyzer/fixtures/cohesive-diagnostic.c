#include <stdio.h>

int main(void)
{
    fprintf(stderr, "cannot read %s\n", "input.txt"); // NOLINT(cert-err33-c):
    // best-effort fatal diagnostic;
    // primary failure already set.
    return 1;
}
