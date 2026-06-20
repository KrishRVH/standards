plugins {
    kotlin("jvm") version "2.4.0"
    id("io.gitlab.arturbosch.detekt") version "1.23.8"
    `java-library`
}

group = "example.project"
version = "0.1.0"

repositories {
    mavenCentral()
}

dependencyLocking {
    lockAllConfigurations()
}

kotlin {
    jvmToolchain(22)
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
    jdkHome.set(file(System.getProperty("java.home")))
    jvmTarget = "22"
    reports {
        html.required.set(false)
        md.required.set(false)
        sarif.required.set(false)
        txt.required.set(true)
        xml.required.set(false)
    }
}
