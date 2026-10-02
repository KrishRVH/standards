// swift-tools-version: 6.4

import PackageDescription

// Keep these settings on every first-party target, including tests;
// `swift:policy` rejects a target without them. Native settings preserve the
// library's eligibility as a downstream dependency. The upcoming features are
// Swift 7 defaults: explicit existentials, narrow imports, and caller isolation.
let strictSettings: [SwiftSetting] = [
  .treatAllWarnings(as: .error),
  .strictMemorySafety(),
  .enableUpcomingFeature("ExistentialAny"),
  .enableUpcomingFeature("ImmutableWeakCaptures"),
  .enableUpcomingFeature("InferIsolatedConformances"),
  .enableUpcomingFeature("InternalImportsByDefault"),
  .enableUpcomingFeature("MemberImportVisibility"),
  .enableUpcomingFeature("NonisolatedNonsendingByDefault"),
]

let package = Package(
  name: "project-name",
  products: [
    .library(name: "Project", targets: ["Project"])
  ],
  targets: [
    .target(name: "Project", path: "src/Project", swiftSettings: strictSettings),
    .testTarget(
      name: "ProjectTests",
      dependencies: ["Project"],
      path: "tests/ProjectTests",
      swiftSettings: strictSettings
    ),
  ],
  swiftLanguageModes: [.v6]
)
