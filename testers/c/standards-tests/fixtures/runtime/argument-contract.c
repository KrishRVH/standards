#include <stddef.h>
#include <string.h>

static const char *program_name(int argc, char *argv[])
{
    if (argc > 0) {
        return argv[0];
    }
    return "program";
}

int main(void)
{
    char executable[] = "project-cli";
    char *zero_arguments[] = { NULL };
    char *one_argument[] = { executable, NULL };

    if (strcmp(program_name(0, zero_arguments), "program") != 0) {
        return 1;
    }
    if (strcmp(program_name(1, one_argument), "project-cli") != 0) {
        return 1;
    }
    return 0;
}
