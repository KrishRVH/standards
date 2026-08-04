static int next_value(int *value)
{
    (*value)++;
    return *value;
}

int main(void)
{
    int value = 0;
    return next_value(&value), value;
}
