<?php

declare(strict_types=1);

namespace Tests;

use App\PublicApi\Calculator;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

final class CalculatorTest extends TestCase
{
    #[Test]
    public function itAddsTwoIntegers(): void
    {
        self::assertSame(5, new Calculator()->add(2, 3));
    }
}
