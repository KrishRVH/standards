/* Compile exactly one CASE_* branch at a time. */
#if defined(CASE_WALL)
int main(void)
{
    int unused_value = 0;
    return 0;
}

#elif defined(CASE_EXTRA)
static int ignore_parameter(int unused_parameter)
{
    return 0;
}

int main(void)
{
    return ignore_parameter(1);
}

#elif defined(CASE_PEDANTIC)
int main(void)
{
    return ({
        int value = 0;
        value;
    });
}

#elif defined(CASE_CONVERSION)
int main(void)
{
    double source = 1.5;
    int destination = source;
    return destination;
}

#elif defined(CASE_SIGN_CONVERSION)
int main(void)
{
    int signed_value = -1;
    unsigned int unsigned_value = signed_value;
    return unsigned_value == 0U;
}

#elif defined(CASE_SHADOW)
int main(void)
{
    int value = 1;
    {
        int value = 2;
        return value;
    }
    return value;
}

#elif defined(CASE_STRICT_PROTOTYPES)
static int old_declaration();

static int old_declaration(void)
{
    return 0;
}

int main(void)
{
    return old_declaration();
}

#elif defined(CASE_MISSING_PROTOTYPES)
int externally_visible_function(int value)
{
    return value;
}

int main(void)
{
    return externally_visible_function(0);
}

#elif defined(CASE_OLD_STYLE_DEFINITION)
static int old_definition(value)
int value;
{
    return value;
}

int main(void)
{
    return old_definition(0);
}

#elif defined(CASE_FORMAT)
#include <stdio.h>

int main(void)
{
    return printf("%s\n", 42) < 0;
}

#elif defined(CASE_FORMAT_SECURITY)
#include <stdio.h>

static int emit(const char *format)
{
    return printf(format);
}

int main(void)
{
    return emit("message");
}

#elif defined(CASE_FORMAT_NONLITERAL)
#include <stdio.h>

static int emit_formatted(const char *format, const char *argument)
{
    return printf(format, argument);
}

int main(void)
{
    return emit_formatted("value: %s\n", "one") < 0;
}

#elif defined(CASE_UNDEF)
#if UNDECLARED_FEATURE
static int selected = 1;
#else
static int selected = 0;
#endif

int main(void)
{
    return selected;
}

#elif defined(CASE_VLA)
int main(int argc, char **argv)
{
    int length = argc > 0 ? argc : 1;
    int values[length];
    values[0] = argv != 0;
    return values[0];
}

#elif defined(CASE_ALLOCA)
#include <stddef.h>

#define alloca(size) __builtin_alloca(size)

int main(int argc, char **argv)
{
    int *value = alloca((size_t)argc * sizeof(*value));
    *value = 0;
    return *value + (argv != 0);
}

#elif defined(CASE_CAST_QUAL)
static int mutate(char *text)
{
    text[0] = 'x';
    return text[0];
}

int main(void)
{
    const char text[] = "a";
    return mutate((char *)text);
}

#elif defined(CASE_POINTER_ARITH)
static int pointer_distance(void *memory)
{
    return (memory + 1) != memory;
}

int main(void)
{
    int value = 0;
    return pointer_distance(&value);
}

#elif defined(CASE_FALLTHROUGH)
static int classify(int value)
{
    int result = 0;
    switch (value) {
        case 0:
            result++;
        case 1:
            result++;
            break;
        default:
            break;
    }
    return result;
}

int main(void)
{
    return classify(0);
}

#elif defined(CASE_SWITCH_ENUM)
enum state { STATE_READY, STATE_RUNNING };

static int classify(enum state value)
{
    switch (value) {
        case STATE_READY:
            return 0;
        default:
            return 1;
    }
}

int main(void)
{
    return classify(STATE_RUNNING);
}

#elif defined(CASE_DATE_TIME)
static const char build_date[] = __DATE__;

int main(void)
{
    return build_date[0] == '\0';
}

#elif defined(CASE_IMPLICIT_FUNCTION)
int main(void)
{
    return undeclared_function();
}

#elif defined(CASE_INCOMPATIBLE_POINTER)
int main(void)
{
    int value = 0;
    char *pointer = &value;
    return pointer != 0;
}

#elif defined(CASE_INT_CONVERSION)
int main(void)
{
    int *pointer = 1;
    return pointer != 0;
}

#elif defined(CASE_CAST_ALIGN)
int main(void)
{
    char bytes[sizeof(int) + 1U] = { 0 };
    int *value = (int *)(bytes + 1);
    return *value;
}

#elif defined(CASE_CAST_FUNCTION)
static int takes_double(double value)
{
    return value > 0.0;
}

int main(void)
{
    int (*takes_int)(int) = (int (*)(int))takes_double;
    return takes_int(0);
}

#elif defined(CASE_COMMA)
static int increment(int *value)
{
    (*value)++;
    return *value;
}

int main(void)
{
    int value = 0;
    return increment(&value), value;
}

#elif defined(CASE_MISSING_VARIABLE_DECLARATIONS)
int externally_visible_value = 1;

int main(void)
{
    return externally_visible_value;
}

#elif defined(CASE_SHIFT_SIGN_OVERFLOW)
int main(void)
{
    return 1 << 31;
}

#elif defined(CASE_DUPLICATED_CONDITION)
static int classify(int value)
{
    if (value == 1) {
        return 1;
    } else if (value == 1) {
        return 2;
    }
    return 0;
}

int main(void)
{
    return classify(0);
}

#elif defined(CASE_SHIFT_OVERFLOW)
int main(void)
{
    return 1 << 31;
}

#elif defined(CASE_USE_AFTER_FREE)
#include <stdlib.h>

int main(void)
{
    int *value = malloc(sizeof(*value));
    if (value == 0) {
        return 1;
    }
    *value = 0;
    free(value);
    return *value;
}

#elif defined(CASE_NULL_DEREFERENCE)
int main(void)
{
    int *value = 0;
    return *value;
}

#else
#error "define exactly one CASE_* warning fixture"
#endif
