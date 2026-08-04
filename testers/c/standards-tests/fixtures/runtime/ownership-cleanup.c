#include <stdint.h>
#include <stdlib.h>

typedef struct {
    int *items;
    size_t count;
} Buffer;

static void buffer_destroy(Buffer *buffer)
{
    free(buffer->items);
    *buffer = (Buffer){ 0 };
}

static int buffer_resize(Buffer *buffer, size_t count)
{
    if (count > SIZE_MAX / sizeof(*buffer->items)) {
        return -1;
    }

    int *resized = realloc(buffer->items, count * sizeof(*buffer->items));
    if (resized == NULL && count != 0U) {
        return -1;
    }
    buffer->items = resized;
    buffer->count = count;
    return 0;
}

int main(void)
{
    Buffer buffer = { 0 };
    if (buffer_resize(&buffer, 4U) != 0) {
        return 1;
    }
    buffer.items[0] = 7;

    if (buffer_resize(&buffer, SIZE_MAX) == 0 || buffer.items[0] != 7) {
        buffer_destroy(&buffer);
        return 1;
    }

    buffer_destroy(&buffer);
    buffer_destroy(&buffer);
    return 0;
}
