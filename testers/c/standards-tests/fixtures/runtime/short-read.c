#include <stdio.h>
#include <string.h>

static int read_exact(FILE *file, unsigned char *buffer, size_t size)
{
    if (size == 0U) {
        return 0;
    }
    return fread(buffer, 1U, size, file) == size ? 0 : -1;
}

static void close_after_failure(FILE *file)
{
    fclose(file); // NOLINT(cert-err33-c): primary error preserved.
}

int main(void)
{
    static const unsigned char input[] = { 'a', 'b', 'c' };
    unsigned char buffer[4] = { 0 };
    FILE *file = tmpfile();
    if (file == NULL) {
        return 1;
    }

    if (fwrite(input, 1U, sizeof(input), file) != sizeof(input) ||
        fseek(file, 0L, SEEK_SET) != 0) {
        close_after_failure(file);
        return 1;
    }
    if (read_exact(file, buffer, sizeof(buffer)) == 0 || !feof(file)) {
        close_after_failure(file);
        return 1;
    }

    clearerr(file);
    if (fseek(file, 0L, SEEK_SET) != 0 ||
        read_exact(file, buffer, sizeof(input)) != 0 ||
        memcmp(buffer, input, sizeof(input)) != 0) {
        close_after_failure(file);
        return 1;
    }
    return fclose(file) == 0 ? 0 : 1;
}
