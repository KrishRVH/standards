# Kotlin Standards

Copy these files into a Kotlin/JVM library project that uses Gradle Kotlin DSL. Replace
`project-name`, package names, and source layout details with the project's real
names.

This is a strict, systems-level generic starting template. Relax Detekt rules,
warning policy, or dependency-verification expectations when the copied baseline
is broader than the real project needs.

This template pins Java, Gradle, Kotlin, Detekt, and ktlint through mise and
Gradle. Detekt 2.x is still an alpha line, but it is the Detekt line currently
aligned with Kotlin 2.4.0. It intentionally does not include generated `gradle.lockfile` or
`gradle/verification-metadata.xml`; generate and commit those after copying:

```sh
mise run kotlin:locks
mise run kotlin:verification-metadata
```

The standard gate is:

```sh
mise run kotlin:fmt:check
mise run kotlin:lint
mise run kotlin:test
```
