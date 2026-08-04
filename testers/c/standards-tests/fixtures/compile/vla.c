int main(int argc, char **argv)
{
    int length = argc > 0 ? argc : 1;
    int values[length];
    values[0] = argv != 0;
    return values[0];
}
