static int select_value(int selected)
{
    int value;
    if (selected != 0) {
        value = 7;
    }
    return value;
}

int main(int argc, char *argv[])
{
    return select_value(argc > 1 && argv[1][0] != '\0');
}
