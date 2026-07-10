# Kotlin Standards

Copy these files into a Kotlin/JVM library project that uses Gradle Kotlin DSL.
Replace `project-name`, package names, and source layout details with the
project's real names.

This is a strict, systems-level generic starting template. Relax Detekt rules,
warning policy, or dependency-verification expectations when the copied baseline
is broader than the real project needs.

This template pins Java 25 LTS, Gradle, and ktlint through mise; Gradle pins
Kotlin 2.4 and Detekt 2. `kotlin:lint` runs typed `detektMain` and
`detektTest` before compilation.

Detekt is pinned to `2.0.0-alpha.5` because that release is the Detekt line
tested against JDK 25, Kotlin 2.4, and Gradle 9.5.

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
