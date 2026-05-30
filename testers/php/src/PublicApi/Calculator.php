<?php

declare(strict_types=1);

namespace App\PublicApi;

final readonly class Calculator
{
    public function add(int $left, int $right): int
    {
        return $left + $right;
    }
}
