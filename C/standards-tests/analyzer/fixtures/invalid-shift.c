static unsigned int invalid_shift(unsigned int width)
{
    return 1U << width;
}

int main(void)
{
    return invalid_shift(32U) == 0U;
}
