#include <project/library.h>

int main(void)
{
    int result = 0;

    return project_add(2, 3, &result) && result == 5 ? 0 : 1;
}
