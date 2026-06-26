# Kotlin Standards

Copy these files into a Kotlin/JVM library project that uses Gradle Kotlin DSL.
Replace `project-name`, package names, and source layout details with the
project's real names.

This is a strict, systems-level generic starting template. Relax Detekt rules,
warning policy, or dependency-verification expectations when the copied baseline
is broader than the real project needs.

This template pins Java, Gradle, and ktlint through mise; Gradle pins Kotlin
and Detekt. It uses the Java 21 LTS toolchain with Kotlin 2.0.21 and Detekt 1.23.
`kotlin:lint` runs typed `detektMain` and `detektTest` before compilation.
Generate and commit `gradle.lockfile` and
`gradle/verification-metadata.xml` after copying; `kotlin:standards:check`
fails until they exist:

```sh
mise run kotlin:locks
mise run kotlin:verification-metadata
```

Gradle's generated `gradle.lockfile` header may mention `./gradlew`; in this
template, regenerate it through `mise run kotlin:locks`.

The standards workflow is:

```sh
mise run kotlin:standards
mise run kotlin:fmt:check
mise run kotlin:lint
mise run kotlin:test
mise run kotlin:standards:check
```
