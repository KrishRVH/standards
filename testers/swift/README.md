# Swift Standards

Copy `Package.swift`, `.swift-format`, and `.github/` into a Swift Package
Manager project. Merge `AGENTS.md` into the copied shared agent guide and put
`Mise/conf.d/20-swift.toml` in `.config/mise/conf.d/20-swift.toml`. Replace
`project-name`, `Project`, and `ProjectTests` with the package and module names.
The manifest maps targets to the catalog's `src/` and `tests/` layout. Adapt
those paths and the formatter task arguments together if the project uses
SwiftPM's `Sources/` and `Tests/` defaults or additional Swift directories.
The catalog's implementation and tests live in `testers/swift/`; copy your
project's own source and tests alongside the manifest.
Merge the operational sections below into the project's README so the agent
guide's README pointer reaches the adopted guidance.

## Toolchain and gate

The task fragment pins Swift 6.4.0 through mise's native Swift backend and
requires mise 2026.9.18 or newer. SwiftPM, Swift Testing,
and [swift-format](https://github.com/swiftlang/swift-format) come with the
toolchain, so the baseline adds no third-party package dependencies.
Install the host prerequisites from [Swift's installation
guide](https://www.swift.org/install/) before `mise install`; Linux archives
need compatible system libraries, and macOS needs Apple's command-line tools
and SDK. Interactive mise activation is optional.

The optional catalog Dagger image is not verified for Swift. A Swift container
gate needs a reviewed image whose Linux distribution and system libraries match
a Swift toolchain release. The Swift fixture does not include a Dagger gate.

The standards workflow is:

```sh
mise run swift:standards
mise run swift:fmt:check
mise run swift:lint
mise run swift:test
mise run swift:cover
mise run swift:standards:check
```

The gate checks formatting and source lint rules, builds optimized release
products, then runs debug tests with coverage. It serializes SwiftPM commands
because they share `.build` and dependency resolution state. Native coverage
JSON is exported beneath `.build`; use `swift test --show-codecov-path` to find
it. Coverage reports carry no percentage threshold.

`Package.swift` selects Swift 6 mode, which includes complete concurrency
checking. Each first-party source and test target uses native warnings-as-errors
and [strict memory-safety
checking](<https://developer.apple.com/documentation/packagedescription/swiftsetting/strictmemorysafety(_:)>).
Reuse `strictSettings` when adding targets. These settings avoid `unsafeFlags`,
which can make library products ineligible for downstream package dependencies.
Memory-safety checking diagnoses unacknowledged unsafe constructs; it does not
prove the safety of annotated operations or dependency implementations.

The formatter retains its toolchain defaults and enables documentation checks
for public declarations plus diagnostics for force unwraps, force tries, and
implicitly unwrapped optionals. Its native test and UI-lifecycle exceptions
still apply. `swift:fmt:check` uses `--strict` so every finding fails the gate;
formatting alone cannot fix all lint findings. Reasons for ignores and compiler
escape hatches remain a review duty, as described in `AGENTS.md`.

## Dependencies

After changing manifest requirements, run `mise run swift:lock` to resolve
dependencies. Use `mise run swift:update` for an intentional upgrade within
those requirements. Commit `Package.resolved` whenever SwiftPM generates it;
packages without external dependencies do not need a fabricated lockfile.
Both build and test tasks use `--force-resolved-versions`, so a missing or stale
resolution for external dependencies fails rather than being repaired in CI.
Commit `.config/mise/mise.lock` for the platforms where the gate runs.
[Mise's Swift backend](https://mise.jdx.dev/lang/swift.html) records the Linux
distribution in its lock options; generate Linux locks for the runner's
distribution. The catalog fixture locks Ubuntu 24.04 for CI and Ubuntu 26.04
for local checks. Generate the Ubuntu 24.04 entry from the project directory:

```sh
MISE_SWIFT_PLATFORM=ubuntu24.04 mise lock --platform linux-x64
```

SwiftPM keeps its native fingerprint and registry signature checks. Review
transitive dependencies, registry trust, binary artifacts, and build plugins
when adopting them; plugins execute code during builds. The baseline carries
no general vulnerability or mutation gate. Add a project-specific tool only
when its support, findings, and routine cost justify it.

## Apple-platform projects

The fixture checks a portable SwiftPM package on Linux. The copied workflow
targets Ubuntu 24.04.
For packages using Apple frameworks, select their minimum deployment platforms
in the manifest, lock mise tools for macOS, and run the gate on macOS. A Swift
toolchain pin does not pin Xcode or an Apple SDK.

An Xcode app needs project-specific `xcodebuild` tasks with an explicit shared
scheme, SDK, and test destination. Keep Swift 6 mode, warnings-as-errors, and
concurrency settings aligned across app and package targets. Put those tasks
in the project's mandatory gate and select a matching Xcode runner; the generic
`Package.swift` dispatcher does not discover `.xcodeproj` or `.xcworkspace`
apps. Keep SwiftUI and `@MainActor` state at the UI boundary and portable domain
logic in independently testable modules.

## CI and review

The copied workflow runs one locked `quality` job for pull requests, merge
queues, and pushes to `main`, and supports manual dispatch. Its action pins
and hardened checkout match the catalog's other automatic profiles.
The catalog root workflow runs only on manual dispatch.

Replace `@OWNER` in `.github/CODEOWNERS` with a real human, require the `quality`
job and Code Owner review, dismiss stale approvals on every new commit, and
disallow protection bypass. Configure those settings on the repository host;
CODEOWNERS alone does not enforce them. Latest-push approval does not replace
stale-approval dismissal because the latest approver need not be a code owner.
