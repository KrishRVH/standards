# PHP Standards

Copy these files into a Composer project and replace `vendor/project`, package
metadata, namespaces, and source/test paths with the real project values.

This is a strict, systems-level generic starting template. It targets PHP 8.5
and includes PHPUnit, PHPStan, Rector, PHPCS/Slevomat, PHPMD maintainability
smell checks, ShipMonk dependency usage analysis, Composer audit, and Roave
security advisories. Relax or split slower tools when the copied baseline is
broader than the project's risk or lifecycle.

The standards workflow is:

```sh
mise run php:standards
mise run php:lock
mise run php:fmt:check
mise run php:lint
mise run php:test
mise run php:standards:check
```

`php:install` requires Composer, then runs `composer install`. `php:lock`
refreshes `composer.lock`; commit it for applications, CLIs, and fixtures that
want locked CI behavior.

`composer standards` runs Composer normalization, Rector, PHPCBF, and a PHPCS
post-check for unfixed style violations. `composer standards:check` runs
normalization verification, strict Composer validation, a Rector dry run,
lint/static analysis, tests, dependency hygiene, and Composer audit.

Rector derives its PHP upgrade set from Composer's PHP requirement, then
applies the code-quality, dead-code, early-return, type-declaration, and
privatization prepared sets. It also imports names and removes unused imports.
The defaults keep parallel execution enabled and cache outside the repository.

PHPStan is the default static-analysis engine. PHPMD is limited to source
maintainability smells such as complexity, oversized methods/classes, coupling,
and high-signal clean-code hazards; PHPCS/Slevomat owns style and PHPStan owns
type/correctness analysis. ShipMonk's dependency analyzer is the single default
dependency hygiene tool because it covers unused dependencies, shadow/transitive
dependencies, and `require`/`require-dev` placement in one pass.
