// swift-tools-version: 6.4

import PackageDescription

// Keep these settings on every first-party target, including tests. Native
// settings preserve the library's eligibility as a downstream dependency.
let strictSettings: [SwiftSetting] = [
  .treatAllWarnings(as: .error),
  .strictMemorySafety(),
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
