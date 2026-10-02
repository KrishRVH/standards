// Verifies the Swift profile's walls with only the pinned toolchain.
//
//   swift -swift-version 6 scripts/verify-standards.swift policy
//   swift -swift-version 6 scripts/verify-standards.swift report <test-log> <codecov-json>
//
// `policy` self-tests its rules, checks every Swift target's settings as
// SwiftPM reads them, scans first-party sources for unexplained exceptions,
// and compiles probes that each strict setting must reject. `report` fails a
// test run that executed no tests and prints first-party line coverage.

import Foundation

struct VerificationFailure: Error {
  let messages: [String]
}

struct Target {
  let name: String
  let type: String
  let moduleType: String
  let path: String
  let sources: [String]
}

struct SourceRule {
  let pattern: String
  let message: String
  var reasonAllowed = true
  var matchesComments = false
}

enum Policy {
  static let languageMode = 6
  static let settingsTargetTypes: Set<String> = ["executable", "library", "macro", "test"]
  static let scannedModuleTypes: Set<String> = ["PluginTarget", "SwiftTarget"]

  // Escape hatches move a guarantee from the compiler to a person. Each one
  // needs its own `//` comment that names the invariant, on its line or above
  // it; documentation comments and attributes may sit in between.
  static let escapes: [SourceRule] = [
    escape(#"@unchecked\s+Sendable"#, "@unchecked Sendable"),
    escape(#"nonisolated\(unsafe\)"#, "nonisolated(unsafe)"),
    escape(#"unowned\(unsafe\)"#, "unowned(unsafe)"),
    escape(#"@preconcurrency\b"#, "@preconcurrency"),
    escape(#"@unsafe\b"#, "@unsafe"),
    escape(#"(?:^|[^\w@])unsafe\s+(?![\w$]+\s*:(?!:))[\w$(&.\[]"#, "an unsafe expression"),
    escape(#"@exclusivity\(unchecked\)"#, "@exclusivity(unchecked)"),
    escape(#"^//\s*swift-format-ignore:"#, "a swift-format ignore", matchesComments: true),
  ]

  static let forbidden: [SourceRule] = [
    SourceRule(
      pattern: #"@diagnose\s*\("#,
      message: "in-source diagnostic control bypasses warnings-as-errors; fix the warning instead",
      reasonAllowed: false),
    SourceRule(
      pattern: #"^//\s*swift-format-ignore-file\b"#,
      message: "file-wide formatter ignores are forbidden; ignore one named rule at the site",
      reasonAllowed: false, matchesComments: true),
    SourceRule(
      pattern: #"^//\s*swift-format-ignore\s*$"#,
      message: "name the ignored rules: // swift-format-ignore: RuleName",
      reasonAllowed: false, matchesComments: true),
  ]

  // Library targets receive capabilities from their callers. Executables,
  // tests, macros, and plugins are composition roots and may construct them.
  static let ambient: [SourceRule] = [
    SourceRule(
      pattern: #"\bDate(?:\.init)?\(\)|\bDate\.now\b|\b(?:Continuous|Suspending)Clock\(\)"#,
      message: "ambient time; pass a clock or the current date in"),
    SourceRule(
      pattern: #"ProcessInfo\.processInfo\.environment"#,
      message: "ambient environment; read configuration at the composition root and pass it in"),
    SourceRule(
      pattern:
        #"\.random\((?![^)]*using:)|\.(?:shuffle|shuffled|randomElement)\(\)|\bUUID\(\)|SystemRandomNumberGenerator\(\)"#,
      message: "ambient randomness; pass a generator with using: or an ID source in"),
    SourceRule(
      pattern: #"\bTask\s*[({]|\bTask\.detached\b|DispatchQueue\.global\("#,
      message: "unowned task; use structured concurrency or a task owner that awaits it"),
    SourceRule(
      pattern:
        #"\b(?:URLSession\.shared|FileManager\.default|UserDefaults\.standard|NotificationCenter\.default)\b"#,
      message: "shared singleton service; pass the dependency in explicitly"),
  ]

  static func escape(_ pattern: String, _ name: String, matchesComments: Bool = false)
    -> SourceRule
  {
    SourceRule(
      pattern: pattern,
      message: "explain \(name) with a // comment naming the invariant on its line or above it",
      matchesComments: matchesComments)
  }
}

func run(_ arguments: [String], mergeErrors: Bool = false) throws -> (Int32, String) {
  let process = Process()
  let output = Pipe()
  process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
  process.arguments = arguments
  process.standardOutput = output
  process.standardError = mergeErrors ? output : FileHandle.standardError
  try process.run()
  let data = output.fileHandleForReading.readDataToEndOfFile()
  process.waitUntilExit()
  return (process.terminationStatus, String(decoding: data, as: UTF8.self))
}

func json(_ arguments: [String]) throws -> [String: Any] {
  let (status, output) = try run(arguments)
  guard status == 0,
    let object = try JSONSerialization.jsonObject(with: Data(output.utf8)) as? [String: Any]
  else {
    throw VerificationFailure(messages: ["\(arguments.joined(separator: " ")) failed"])
  }
  return object
}

// `describe` resolves default target folders, `exclude`, and `sources`.
func targets(in description: [String: Any]) -> [Target] {
  let entries = description["targets"] as? [[String: Any]] ?? []
  return entries.compactMap { entry in
    guard let name = entry["name"] as? String, let type = entry["type"] as? String,
      let path = entry["path"] as? String
    else { return nil }
    return Target(
      name: name, type: type, moduleType: entry["module_type"] as? String ?? "",
      path: path, sources: entry["sources"] as? [String] ?? [])
  }
}

// Upcoming features that later language modes enable become required here, so
// a toolchain upgrade surfaces each new one as migration work.
func upcomingFeatures() throws -> (supported: Set<String>, required: Set<String>) {
  let features = try json(["swiftc", "-print-supported-features"])
  let upcoming = (features["features"] as? [String: Any])?["upcoming"] as? [[String: Any]] ?? []
  var supported = Set<String>()
  var required = Set<String>()
  for feature in upcoming {
    guard let name = feature["name"] as? String else { continue }
    supported.insert(name)
    if let mode = (feature["enabled_in"] as? String).flatMap(Int.init), mode > Policy.languageMode {
      required.insert(name)
    }
  }
  return (supported, required)
}

func manifestFailures(
  manifest: [String: Any], targets: [Target], supported: Set<String>, required: Set<String>
) -> [String] {
  var failures: [String] = []
  let modes = manifest["swiftLanguageVersions"] as? [String] ?? []
  if modes.contains(where: { (Int($0) ?? 0) < Policy.languageMode }) {
    failures.append(
      "Package.swift: swiftLanguageModes must stay at Swift \(Policy.languageMode) or later")
  }

  let declared = (manifest["targets"] as? [[String: Any]] ?? []).reduce(
    into: [String: [[String: Any]]]()
  ) { settings, entry in
    if let name = entry["name"] as? String {
      settings[name] = entry["settings"] as? [[String: Any]] ?? []
    }
  }
  for target in targets {
    let settings = declared[target.name] ?? []
    for setting in settings where (setting["kind"] as? [String: Any])?["unsafeFlags"] != nil {
      let tool = setting["tool"] as? String ?? "unknown"
      failures.append("\(target.name): \(tool) unsafeFlags block downstream use of the package")
    }
    guard target.moduleType == "SwiftTarget", Policy.settingsTargetTypes.contains(target.type)
    else { continue }

    var warningsAreErrors = false
    var memorySafety = false
    var features = Set<String>()
    for setting in settings where setting["tool"] as? String == "swift" {
      guard let kind = setting["kind"] as? [String: Any], let name = kind.keys.first else {
        continue
      }
      let value = (kind[name] as? [String: Any])?["_0"]
      let unconditional = setting["condition"] == nil || setting["condition"] is NSNull
      switch name {
      case "treatAllWarnings":
        if value as? String == "error" && unconditional {
          warningsAreErrors = true
        } else {
          failures.append("\(target.name): keep .treatAllWarnings(as: .error) unconditional")
        }
      case "strictMemorySafety":
        memorySafety = memorySafety || unconditional
      case "enableUpcomingFeature":
        let feature = value as? String ?? ""
        if !supported.contains(feature) {
          failures.append("\(target.name): unknown upcoming feature \(feature)")
        } else if unconditional {
          features.insert(feature)
        }
      case "treatWarning":
        failures.append("\(target.name): treatWarning overrides warnings-as-errors for a group")
      case "swiftLanguageMode":
        if (Int(value as? String ?? "") ?? 0) < Policy.languageMode {
          failures.append(
            "\(target.name): a target language mode below Swift \(Policy.languageMode)")
        }
      default:
        break
      }
    }
    if !warningsAreErrors {
      failures.append("\(target.name): add .treatAllWarnings(as: .error) through strictSettings")
    }
    if !memorySafety {
      failures.append("\(target.name): add .strictMemorySafety() through strictSettings")
    }
    for feature in required.subtracting(features).sorted() {
      failures.append(
        "\(target.name): add .enableUpcomingFeature(\"\(feature)\") to strictSettings")
    }
  }
  return failures
}

// Splits lines into code and `//` comment text. String contents and block
// comments are blanked, so they cannot match or hide a rule.
struct LineSplitter {
  var inBlockComment = false
  var inMultilineString = false

  mutating func split(_ line: String) -> (code: String, comment: String?) {
    var code = ""
    var index = line.startIndex
    while index < line.endIndex {
      let rest = line[index...]
      if inBlockComment || inMultilineString {
        let close = inBlockComment ? "*/" : "\"\"\""
        guard let end = rest.range(of: close) else { break }
        inBlockComment = false
        inMultilineString = false
        index = end.upperBound
        continue
      }
      if rest.hasPrefix("//") {
        return (code, String(rest))
      }
      if rest.hasPrefix("/*") {
        inBlockComment = true
        index = line.index(index, offsetBy: 2)
      } else if rest.hasPrefix("\"\"\"") {
        inMultilineString = true
        code += "\"\""
        index = line.index(index, offsetBy: 3)
      } else if rest.hasPrefix("\"") {
        index = line.index(after: index)
        while index < line.endIndex, line[index] != "\"" {
          if line[index] == "\\" {
            index = line.index(after: index)
            if index == line.endIndex { break }
          }
          index = line.index(after: index)
        }
        code += "\"\""
        if index < line.endIndex { index = line.index(after: index) }
      } else {
        code.append(line[index])
        index = line.index(after: index)
      }
    }
    return (code, nil)
  }
}

func isReason(_ comment: String) -> Bool {
  !comment.hasPrefix("///") && !comment.contains("swift-format-ignore")
    && comment.dropFirst(2).contains(where: { $0.isLetter || $0.isNumber })
}

func sourceFailures(file: String, text: String, ambientApplies: Bool) throws -> [String] {
  let rules = try (Policy.forbidden + Policy.escapes + (ambientApplies ? Policy.ambient : []))
    .map { ($0, try Regex($0.pattern)) }
  var failures: [String] = []
  var splitter = LineSplitter()
  var carriedReason = false
  for (index, line) in text.split(separator: "\n", omittingEmptySubsequences: false).enumerated() {
    let wasInside = splitter.inBlockComment || splitter.inMultilineString
    let (rawCode, rawComment) = splitter.split(String(line))
    let code = rawCode.trimmingCharacters(in: .whitespaces)
    let comment = rawComment?.trimmingCharacters(in: .whitespaces)
    let trailingReason = !code.isEmpty && comment.map(isReason) == true
    var usedCarriedReason = false
    for (rule, pattern) in rules {
      guard (rule.matchesComments ? comment ?? "" : code).contains(pattern) else { continue }
      if rule.reasonAllowed && trailingReason { continue }
      if rule.reasonAllowed && carriedReason {
        usedCarriedReason = true
        continue
      }
      failures.append("\(file):\(index + 1): \(rule.message)")
    }
    let continuesDeclaration =
      code.isEmpty ? comment?.hasPrefix("///") == true : code.hasPrefix("@")
    if code.isEmpty, let comment, isReason(comment), !wasInside {
      carriedReason = true
    } else if usedCarriedReason || !continuesDeclaration || wasInside {
      carriedReason = false
    }
  }
  return failures
}

func selfTest() throws -> [String] {
  let cases: [(String, Bool, Int)] = [
    ("final class Box: @unchecked Sendable {}", true, 1),
    ("// Writes stay on the owning queue.\nfinal class Box: @unchecked Sendable {}", true, 0),
    ("// Set once at startup.\n@MainActor\nnonisolated(unsafe) var x = 0", true, 0),
    ("// Owned by the queue.\n/// Box.\npublic final class Box: @unchecked Sendable {}", true, 0),
    ("/// Doc comments do not explain an escape.\nnonisolated(unsafe) var x = 0", true, 1),
    ("//\nnonisolated(unsafe) var x = 0", true, 1),
    ("// One reason.\n@preconcurrency import A\n@preconcurrency import B", true, 1),
    ("// Reason.\n/* note */\nnonisolated(unsafe) var x = 0", true, 1),
    ("/* note */ nonisolated(unsafe) var x = 0", true, 1),
    ("let p = unsafe pointer.pointee // The buffer outlives this call.", true, 0),
    ("consume(unsafe pointer.pointee)", true, 1),
    ("let sum = { unsafe $0.reduce(0, +) }", true, 1),
    ("func copy(from s: Int, unsafe pointer: Int) {}", true, 0),
    ("let flags = unsafeFlags; withUnsafeBytes(of: x) { _ in }", true, 0),
    ("let text = \"nonisolated(unsafe) // Date()\"", true, 0),
    ("let text = \"\"\"\n  @preconcurrency import Foo\n  \"\"\"", true, 0),
    ("// Reason.\n@diagnose(NoUsage, as: ignored)", true, 1),
    ("// swift-format-ignore-file", true, 1),
    ("// Reason.\n// swift-format-ignore", true, 1),
    ("// The literal is valid.\n// swift-format-ignore: NeverForceUnwrap", true, 0),
    ("// swift-format-ignore: NeverForceUnwrap", true, 1),
    ("let now = Date()", true, 1),
    ("let now = Date()", false, 0),
    ("// The composition root owns the clock.\nlet now = Date()", true, 0),
    ("let stamp = Date.now", true, 1),
    ("let roll = Int.random(in: 1...6)", true, 1),
    ("let roll = Int.random(in: 1...6, using: &generator)", true, 0),
    ("Task { await work() }", true, 1),
    ("let stamp = clock.now", true, 0),
  ]
  var failures: [String] = []
  for (source, ambientApplies, expected) in cases {
    let found = try sourceFailures(
      file: "probe.swift", text: source, ambientApplies: ambientApplies)
    if found.count != expected {
      failures.append("source rule self-test expected \(expected) finding(s) for: \(source)")
    }
  }

  let manifest: [String: Any] = [
    "swiftLanguageVersions": ["5"],
    "targets": [
      [
        "name": "Loose",
        "settings": [
          ["tool": "swift", "kind": ["treatAllWarnings": ["_0": "error"]]],
          ["tool": "swift", "kind": ["treatAllWarnings": ["_0": "warning"]]],
          ["tool": "swift", "kind": ["enableUpcomingFeature": ["_0": "Bogus"]]],
          ["tool": "linker", "kind": ["unsafeFlags": ["_0": ["-z"]]]],
        ],
      ],
      ["name": "Native", "settings": [["tool": "c", "kind": ["unsafeFlags": ["_0": ["-w"]]]]]],
    ],
  ]
  let loose = Target(
    name: "Loose", type: "library", moduleType: "SwiftTarget", path: "src", sources: [])
  let native = Target(
    name: "Native", type: "library", moduleType: "ClangTarget", path: "c", sources: [])
  let findings = manifestFailures(
    manifest: manifest, targets: [loose, native], supported: ["Real"], required: ["Real"])
  for expected in [
    "swiftLanguageModes", "Loose: keep .treatAllWarnings(as: .error) unconditional",
    "unknown upcoming feature Bogus", "Loose: linker unsafeFlags", "Native: c unsafeFlags",
    "strictMemorySafety", "enableUpcomingFeature(\"Real\")",
  ] where !findings.contains(where: { $0.contains(expected) }) {
    failures.append("manifest self-test missed \(expected)")
  }
  if findings.contains(where: { $0.hasPrefix("Native: add") }) {
    failures.append("manifest self-test required Swift settings on a C target")
  }
  return failures
}

// Each probe breaks one wall in its own build: a declaration error stops a
// build before function bodies report theirs.
func probeFailures(toolsVersion: String, required: Set<String>) throws -> [String] {
  let root = FileManager.default.temporaryDirectory
    .appendingPathComponent("standards-policy-probe-\(ProcessInfo.processInfo.processIdentifier)")
    .path
  defer { try? FileManager.default.removeItem(atPath: root) }
  let sources = "\(root)/Sources/Probe"
  try FileManager.default.createDirectory(atPath: root, withIntermediateDirectories: true)
  let features = required.sorted().map { "  .enableUpcomingFeature(\"\($0)\"),\n" }.joined()
  let manifest = """
    // swift-tools-version: \(toolsVersion)
    import PackageDescription

    let settings: [SwiftSetting] = [
      .treatAllWarnings(as: .error),
      .strictMemorySafety(),
    \(features)]

    let package = Package(
      name: "standards-policy-probe",
      targets: [.target(name: "Probe", swiftSettings: settings)],
      swiftLanguageModes: [.v6]
    )

    """
  let probes: [(file: String, source: String, diagnostic: String)] = [
    ("Warning.swift", "func probeUnused() { let unused = 1 }\n", "NoUsage"),
    (
      "Memory.swift",
      "func probePointer() {\n  let p = UnsafeMutablePointer<Int>.allocate(capacity: 1)\n"
        + "  p.deallocate()\n}\n",
      "StrictMemorySafety"
    ),
    ("Global.swift", "var probeCounter = 0\n", "MutableGlobalVariable"),
    (
      "Existential.swift", "protocol ProbeShape {}\nfunc probe(_ s: ProbeShape) {}\n",
      "ExistentialAny"
    ),
  ]
  try manifest.write(toFile: "\(root)/Package.swift", atomically: true, encoding: .utf8)
  var failures: [String] = []
  for probe in probes {
    try? FileManager.default.removeItem(atPath: sources)
    try FileManager.default.createDirectory(atPath: sources, withIntermediateDirectories: true)
    try probe.source.write(toFile: "\(sources)/\(probe.file)", atomically: true, encoding: .utf8)
    let (status, output) = try run(
      ["swift", "build", "--package-path", root, "--scratch-path", "\(root)/.build"],
      mergeErrors: true)
    let errors = output.split(separator: "\n").filter { $0.contains("error:") }
    if status == 0 || !errors.contains(where: { $0.contains(probe.diagnostic) }) {
      failures.append(
        "\(probe.file): expected a \(probe.diagnostic) error from the strict settings; "
          + "compiler output:\n\(output.split(separator: "\n").suffix(20).joined(separator: "\n"))")
    }
  }
  return failures
}

func policy() throws {
  var failures = try selfTest()
  let manifest = try json(["swift", "package", "dump-package"])
  let description = try json(["swift", "package", "describe", "--type", "json"])
  let allTargets = targets(in: description)
  let features = try upcomingFeatures()
  failures += manifestFailures(
    manifest: manifest, targets: allTargets, supported: features.supported,
    required: features.required)

  let rootFiles = (try? FileManager.default.contentsOfDirectory(atPath: ".")) ?? []
  var scanned: [(String, Bool)] = rootFiles.filter {
    $0 == "Package.swift" || ($0.hasPrefix("Package@swift-") && $0.hasSuffix(".swift"))
  }.sorted().map { ($0, false) }
  // This verifier's own rule patterns and self-test sources would match themselves.
  let scripts = FileManager.default.enumerator(atPath: "scripts")?.compactMap { $0 as? String }
  scanned += (scripts ?? []).filter { $0.hasSuffix(".swift") && $0 != "verify-standards.swift" }
    .sorted().map { ("scripts/\($0)", false) }
  for target in allTargets where Policy.scannedModuleTypes.contains(target.moduleType) {
    scanned += target.sources.filter { $0.hasSuffix(".swift") }
      .map { ("\(target.path)/\($0)", target.type == "library") }
  }
  for (file, ambientApplies) in scanned {
    let text = try String(contentsOfFile: file, encoding: .utf8)
    failures += try sourceFailures(file: file, text: text, ambientApplies: ambientApplies)
  }

  let toolsVersion = (manifest["toolsVersion"] as? [String: Any])?["_version"] as? String ?? "6.0"
  failures += try probeFailures(toolsVersion: toolsVersion, required: features.required)
  guard failures.isEmpty else { throw VerificationFailure(messages: failures) }
  print("Swift policy passed: \(allTargets.count) target(s), \(scanned.count) file(s) scanned.")
}

func report(log: String, coverage: String) throws {
  let text = try String(contentsOfFile: log, encoding: .utf8)
  let swiftTesting = text.matches(of: try Regex(#"Test run with (\d+) tests?"#))
    .compactMap { Int(String($0.output[1].substring ?? "")) }.reduce(0, +)
  let xcTest =
    text.matches(of: try Regex(#"Executed (\d+) tests?"#))
    .compactMap { Int(String($0.output[1].substring ?? "")) }.max() ?? 0
  guard swiftTesting + xcTest > 0 else {
    throw VerificationFailure(messages: [
      "The test run executed no tests; add one that defends the package's behavior."
    ])
  }

  let description = try json(["swift", "package", "describe", "--type", "json"])
  let sourceRoots = targets(in: description).filter { $0.type != "test" }.map { "/\($0.path)/" }
  let data = try Data(contentsOf: URL(fileURLWithPath: coverage))
  let export = try JSONSerialization.jsonObject(with: data) as? [String: Any]
  let files = ((export?["data"] as? [[String: Any]])?.first?["files"] as? [[String: Any]]) ?? []
  let cwd = FileManager.default.currentDirectoryPath + "/"
  var covered = 0
  var total = 0
  print("Line coverage for first-party sources:")
  for file in files {
    guard let name = file["filename"] as? String, name.hasPrefix(cwd),
      sourceRoots.contains(where: { name.dropFirst(cwd.count - 1).hasPrefix($0) }),
      let lines = (file["summary"] as? [String: Any])?["lines"] as? [String: Any],
      let count = lines["count"] as? Int, let hit = lines["covered"] as? Int
    else { continue }
    covered += hit
    total += count
    print("  \(name.dropFirst(cwd.count)): \(hit)/\(count) lines")
  }
  let percent = total == 0 ? 100.0 : Double(covered) * 100 / Double(total)
  print("  total: \(covered)/\(total) lines (\(String(format: "%.1f", percent))%)")
}

do {
  let arguments = Array(CommandLine.arguments.dropFirst())
  switch arguments.first {
  case "policy" where arguments.count == 1:
    try policy()
  case "report" where arguments.count == 3:
    try report(log: arguments[1], coverage: arguments[2])
  default:
    FileHandle.standardError.write(
      Data("usage: verify-standards.swift policy | report <test-log> <codecov-json>\n".utf8))
    exit(2)
  }
} catch let failure as VerificationFailure {
  FileHandle.standardError.write(Data((failure.messages.joined(separator: "\n") + "\n").utf8))
  exit(1)
} catch {
  FileHandle.standardError.write(Data("verify-standards.swift: \(error)\n".utf8))
  exit(1)
}
