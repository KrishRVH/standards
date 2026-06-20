# PHP Standards

Copy these files into a Composer project and replace `vendor/project`, package
metadata, namespaces, and source/test paths with the real project values.

This is a strict, systems-level generic starting template. It includes PHPUnit,
PHPStan, Psalm, PHPCS, PHPMD, Deptrac, Rector, PHPBench, Infection, dependency
usage checks, and Roave security advisories. Relax or split slower tools when
the copied baseline is broader than the project's risk or lifecycle.

The standard gate is:

```sh
mise run php:fmt:check
mise run php:lint
mise run php:test
mise run php:check
```

`php:install` requires Composer and a PHP runtime with `ext-sodium`, then runs
`composer install`. Commit `composer.lock` for applications, CLIs, and fixtures
that want locked CI behavior.
