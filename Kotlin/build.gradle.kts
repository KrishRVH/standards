plugins {
    kotlin("jvm") version "2.4.0"
    id("dev.detekt") version "2.0.0-alpha.5"
    `java-library`
}

group = "example.project"
version = "0.1.0"

dependencyLocking {
    lockAllConfigurations()
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

tasks.withType<dev.detekt.gradle.Detekt>().configureEach {
    jvmTarget.set("25")
    reports {
        checkstyle.required.set(true)
        html.required.set(false)
        markdown.required.set(false)
        sarif.required.set(false)
    }
}
