plugins {
    kotlin("jvm") version "2.0.21"
    id("io.gitlab.arturbosch.detekt") version "1.23.8"
    `java-library`
}

group = "example.project"
version = "0.1.0"

dependencyLocking {
    lockAllConfigurations()
}

kotlin {
    jvmToolchain(21)
    explicitApi()
}

dependencies {
    testImplementation(kotlin("test"))
}

tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach {
    compilerOptions {
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
    config.setFrom(files("detekt.yml"))
}

tasks.withType<io.gitlab.arturbosch.detekt.Detekt>().configureEach {
    jvmTarget = "21"
    reports {
        xml.required.set(true)
        html.required.set(false)
        txt.required.set(false)
        sarif.required.set(false)
    }
}
