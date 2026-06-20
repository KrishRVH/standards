# Kotlin Standards

Copy these files into a Kotlin/JVM project that uses Gradle Kotlin DSL. Replace
`project-name`, package names, and source layout details with the project's real
names.

This template pins Java, Gradle, Kotlin, Detekt, and ktlint through mise and
Gradle. It intentionally does not include generated `gradle.lockfile` or
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
