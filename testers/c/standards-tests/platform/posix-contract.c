#include <stdio.h>
#include <sys/types.h>
#include <time.h>

int main(void)
{
    static const unsigned char payload[] = { 'p', 'o', 's', 'i', 'x', '\n' };
    struct timespec started;
    struct timespec finished;
    FILE *file;
    off_t offset = (off_t)-1;
    int status = 0;

    if (clock_gettime(CLOCK_MONOTONIC, &started) != 0) {
        return 1;
    }

    file = tmpfile();
    if (file == NULL) {
        return 2;
    }

    if (fwrite(payload, sizeof payload[0], sizeof payload, file) !=
        sizeof payload) {
        status = 3;
    } else if (fflush(file) != 0) {
        status = 4;
    } else if (fseeko(file, (off_t)0, SEEK_END) != 0) {
        status = 5;
    } else {
        offset = ftello(file);
        if (offset == (off_t)-1 || offset != (off_t)sizeof payload) {
            status = 6;
        }
    }

    if (clock_gettime(CLOCK_MONOTONIC, &finished) != 0) {
        if (status == 0) {
            status = 7;
        }
    } else if (status == 0 && (finished.tv_sec < started.tv_sec ||
                               (finished.tv_sec == started.tv_sec &&
                                finished.tv_nsec < started.tv_nsec))) {
        status = 8;
    }

    if (fclose(file) != 0 && status == 0) {
        status = 9;
    }

    return status;
}
