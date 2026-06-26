import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    kotlin("jvm") version "2.4.0"
    id("dev.detekt") version "2.0.0-alpha.5"
    `java-library`
}

val allowedDetektAlpha = "2.0.0-alpha.5"
val allowedIntellijCoroutineFork = "1.10.2-intellij-1"
val allowedIntellijCoroutineForkArtifacts =
    setOf(
        "kotlinx-coroutines-bom",
        "kotlinx-coroutines-core",
        "kotlinx-coroutines-core-jvm",
    )
val blockedQualifierPattern = "alpha|beta|rc|m|milestone|eap|preview|intellij"
val prereleaseVersionPattern =
    Regex(
        pattern = """.*[.-]($blockedQualifierPattern)[0-9.-]*.*|.*SNAPSHOT.*""",
        option = RegexOption.IGNORE_CASE,
    )

group = "example.project"
version = "0.1.0"

dependencyLocking {
    lockAllConfigurations()
}

configurations.configureEach {
    resolutionStrategy.componentSelection {
        all {
            val isAllowedDetektAlpha =
                candidate.group == "dev.detekt" && candidate.version == allowedDetektAlpha
            val isAllowedIntellijCoroutineFork =
                candidate.group == "org.jetbrains.intellij.deps.kotlinx" &&
                    candidate.module in allowedIntellijCoroutineForkArtifacts &&
                    candidate.version == allowedIntellijCoroutineFork
            if (
                !isAllowedDetektAlpha &&
                !isAllowedIntellijCoroutineFork &&
                prereleaseVersionPattern.matches(candidate.version)
            ) {
                reject("Only pinned Kotlin analyzer qualifier versions are allowed")
            }
        }
    }
}

kotlin {
    jvmToolchain(25)
    explicitApi()
}

dependencies {
    testImplementation(kotlin("test"))
}

tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_25)
        allWarningsAsErrors.set(true)
        freeCompilerArgs.add("-Xjsr305=strict")
    }
}

tasks.test {
    useJUnitPlatform()
}

detekt {
    allRules = true
    buildUponDefaultConfig = true
    basePath.set(projectDir)
    config.setFrom(files("detekt.yml"))
}

tasks.withType<dev.detekt.gradle.Detekt>().configureEach {
    jvmTarget.set("25")
    reports {
        checkstyle.required.set(true)
        html.required.set(false)
        markdown.required.set(false)
        sarif.required.set(false)
    }
}

tasks.withType<dev.detekt.gradle.DetektCreateBaselineTask>().configureEach {
    jvmTarget.set("25")
}
