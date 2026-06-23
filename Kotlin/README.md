# Kotlin Standards

Copy these files into a Kotlin/JVM library project that uses Gradle Kotlin DSL.
Replace `project-name`, package names, and source layout details with the
project's real names.

This is a strict, systems-level generic starting template. Relax Detekt rules,
warning policy, or dependency-verification expectations when the copied baseline
is broader than the real project needs.

This template pins Java, Gradle, and ktlint through mise; Gradle pins Kotlin
and Detekt. It uses the Java 26 toolchain with Kotlin 2.4.0 and the Detekt 2.x
line. `kotlin:lint` runs typed `detektMain` and `detektTest` before
compilation. Generate and commit `gradle.lockfile` and
`gradle/verification-metadata.xml` after copying; `kotlin:check` fails until
they exist:

```sh
mise run kotlin:locks
mise run kotlin:verification-metadata
```

Gradle's generated `gradle.lockfile` header may mention `./gradlew`; in this
template, regenerate it through `mise run kotlin:locks`.

The standard gate is:

```sh
mise run kotlin:fmt:check
mise run kotlin:lint
mise run kotlin:test
mise run kotlin:check
```
