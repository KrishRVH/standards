using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Security;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

internal static class StandardsVerifier
{
    private const string InvalidMutatorMessage = "not recognized as a mutator at";
    private const string InvalidCommentMessage = "Invalid Stryker comments at";
    private const string SlowCommentMessageStart = "Parsing Stryker comments at";
    private const string SlowCommentMessageEnd = "took too long to parse and was ignored.";
    private const string MissingIgnoreReason = "Ignored via code comment";
    private static readonly Regex StrykerDirectivePattern = new(
        @"(?im)(?://|/\*)\s*Stryker\s*(?:disable|restore)[^\r\n]*",
        RegexOptions.Compiled | RegexOptions.CultureInvariant,
        TimeSpan.FromMilliseconds(200));
    private static readonly Regex AllowedStrykerDirective = new(
        @"^\s*//\s*Stryker\s+disable\s+once\s+[A-Za-z][A-Za-z0-9]*(?:\s*,\s*[A-Za-z][A-Za-z0-9]*)*\s*:\s*(?<reason>\S.*)\s*$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase,
        TimeSpan.FromMilliseconds(200));
    private static readonly string[] StrykerGitRefNamespaces =
        ["refs/heads", "refs/remotes", "refs/tags"];

    private static async Task<int> Main(string[] args)
    {
        try
        {
            switch (args)
            {
                case ["self-test"]:
                    RunSelfTests();
                    Console.WriteLine("Standards verifier self-tests passed.");
                    return 0;
                case ["policy"]:
                    RunSelfTests();
                    await VerifyVerifierCompilerPolicyAsync().ConfigureAwait(false);
                    await VerifyAnalyzerPolicyAsync().ConfigureAwait(false);
                    Console.WriteLine("Analyzer policy probes passed.");
                    return 0;
                case ["git-refs", string mergeBase]:
                    await VerifyNoContainingGitRefAsync(mergeBase).ConfigureAwait(false);
                    Console.WriteLine("Verified that no Git ref name can shadow the merge-base SHA.");
                    return 0;
                case ["stryker", "full", string reportPath, string logPath]:
                    VerifyStrykerRun(File.ReadAllText(reportPath), File.ReadAllText(logPath), true);
                    Console.WriteLine("Verified a complete, non-vacuous Stryker report.");
                    return 0;
                case ["stryker", "diff", string reportPath, string logPath]:
                    VerifyStrykerRun(File.ReadAllText(reportPath), File.ReadAllText(logPath), false);
                    Console.WriteLine("Verified a complete Stryker diff report.");
                    return 0;
                default:
                    Console.Error.WriteLine(
                        "Usage: verify-standards.cs self-test | policy | git-refs <merge-base-sha> | stryker <full|diff> <report.json> <run.log>");
                    return 2;
            }
        }
        catch (Exception exception) when (
            exception is IOException or JsonException or InvalidDataException
                or RegexMatchTimeoutException or UnauthorizedAccessException)
        {
            Console.Error.WriteLine(exception.Message);
            return 1;
        }
    }

    private static void VerifyStrykerRun(string reportJson, string runLog, bool requireExecutedMutant)
    {
        if (runLog.Contains(InvalidMutatorMessage, StringComparison.OrdinalIgnoreCase)
            || runLog.Contains(InvalidCommentMessage, StringComparison.OrdinalIgnoreCase)
            || (runLog.Contains(SlowCommentMessageStart, StringComparison.OrdinalIgnoreCase)
                && runLog.Contains(SlowCommentMessageEnd, StringComparison.OrdinalIgnoreCase)))
        {
            throw new InvalidDataException(
                "Stryker reported a malformed disable directive; fix the source comment instead of accepting the run.");
        }

        using JsonDocument report = JsonDocument.Parse(reportJson);
        if (!report.RootElement.TryGetProperty("files", out JsonElement files)
            || files.ValueKind != JsonValueKind.Object)
        {
            throw new InvalidDataException("Stryker JSON report has no object-valued files field.");
        }

        int executed = 0;
        foreach (JsonProperty file in files.EnumerateObject())
        {
            if (!file.Value.TryGetProperty("source", out JsonElement source)
                || source.ValueKind != JsonValueKind.String)
            {
                throw new InvalidDataException($"Stryker JSON report has no string source for {file.Name}.");
            }
            VerifyStrykerDirectivePolicy(file.Name, source.GetString()!);

            if (!file.Value.TryGetProperty("mutants", out JsonElement mutants)
                || mutants.ValueKind != JsonValueKind.Array)
            {
                throw new InvalidDataException($"Stryker JSON report has no mutant array for {file.Name}.");
            }

            foreach (JsonElement mutant in mutants.EnumerateArray())
            {
                if (!mutant.TryGetProperty("status", out JsonElement statusElement)
                    || statusElement.ValueKind != JsonValueKind.String)
                {
                    throw new InvalidDataException("Stryker JSON report contains a mutant without a string status.");
                }

                string status = statusElement.GetString()!;
                switch (status)
                {
                    case "Killed":
                    case "Survived":
                    case "Timeout":
                        executed++;
                        break;
                    case "NoCoverage":
                    case "CompileError":
                    case "RuntimeError":
                        break;
                    case "Ignored":
                        ValidateIgnoredReason(mutant);
                        break;
                    case "Pending":
                        throw new InvalidDataException("Stryker JSON report still contains a pending mutant.");
                    default:
                        throw new InvalidDataException($"Stryker JSON report contains unknown mutant status '{status}'.");
                }
            }
        }

        if (requireExecutedMutant && executed == 0)
        {
            throw new InvalidDataException(
                "Full mutation testing must execute at least one mutant; empty and all-NoCoverage reports fail.");
        }
    }

    private static void VerifyStrykerDirectivePolicy(string fileName, string source)
    {
        foreach (Match directive in StrykerDirectivePattern.Matches(source))
        {
            Match allowed = AllowedStrykerDirective.Match(directive.Value);
            if (!allowed.Success
                || !allowed.Groups["reason"].Value.Any(char.IsLetterOrDigit))
            {
                throw new InvalidDataException(
                    $"{fileName} contains an unsupported Stryker directive. Use exactly '// Stryker disable once <mutator|all>: <reason>'; ranged restore/disable comments and block comments are forbidden.");
            }
        }
    }

    private static void VerifyStrykerConfiguration(string configurationJson)
    {
        using JsonDocument configuration = JsonDocument.Parse(configurationJson);
        if (!configuration.RootElement.TryGetProperty("stryker-config", out JsonElement stryker)
            || stryker.ValueKind != JsonValueKind.Object)
        {
            throw new InvalidDataException("stryker-config.json has no object-valued stryker-config field.");
        }

        if (!stryker.TryGetProperty("coverage-analysis", out JsonElement coverageAnalysis)
            || coverageAnalysis.ValueKind != JsonValueKind.String
            || !string.Equals(coverageAnalysis.GetString(), "off", StringComparison.Ordinal))
        {
            throw new InvalidDataException(
                "Stryker coverage analysis must stay off while the Microsoft Testing Platform integration is in preview.");
        }

        if (!stryker.TryGetProperty("reporters", out JsonElement reporters)
            || reporters.ValueKind != JsonValueKind.Array)
        {
            throw new InvalidDataException("Stryker reporters must be an array containing json.");
        }

        bool hasJsonReporter = false;
        foreach (JsonElement reporter in reporters.EnumerateArray())
        {
            if (reporter.ValueKind != JsonValueKind.String)
            {
                throw new InvalidDataException("Every Stryker reporter must be a string.");
            }
            hasJsonReporter |= string.Equals(reporter.GetString(), "json", StringComparison.Ordinal);
        }
        if (!hasJsonReporter)
        {
            throw new InvalidDataException("Stryker must emit its json reporter for post-run verification.");
        }
    }

    private static void ValidateIgnoredReason(JsonElement mutant)
    {
        if (!mutant.TryGetProperty("statusReason", out JsonElement reasonElement)
            || reasonElement.ValueKind != JsonValueKind.String)
        {
            throw new InvalidDataException(
                "Every ignored mutant needs a nonblank source reason; Stryker's default code-comment reason is not enough.");
        }

        string reason = reasonElement.GetString()!.Trim();
        string normalizedReason = reason.TrimEnd('.').TrimEnd();
        if (reason.Length == 0
            || string.Equals(normalizedReason, MissingIgnoreReason, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidDataException(
                "Every ignored mutant needs a nonblank source reason; Stryker's default code-comment reason is not enough.");
        }
    }

    private static async Task VerifyAnalyzerPolicyAsync()
    {
        await ExpectBuildDiagnosticAsync(
            "RS0030",
            "BannedApiProbe.cs",
            """
            namespace StandardsPolicyProbe;

            internal static class BannedApiProbe
            {
                internal static void Violate() => System.Threading.Thread.Sleep(1);
            }
            """).ConfigureAwait(false);

        await ExpectBuildDiagnosticAsync(
            "SA1404",
            "SuppressionProbe.cs",
            """
            using System.Diagnostics.CodeAnalysis;

            [assembly: SuppressMessage("Design", "CA1062")]
            """).ConfigureAwait(false);
    }

    private static async Task VerifyVerifierCompilerPolicyAsync()
    {
        string probeRoot = Path.Combine("scripts", ".compiler-policy-probes");
        string probeDirectory = Path.Combine(probeRoot, Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(probeDirectory);

        try
        {
            string sourcePath = Path.Combine(probeDirectory, "WarningProbe.cs");
            File.WriteAllText(
                sourcePath,
                "#warning The standards verifier must compile warnings as errors.\nreturn 0;\n");

            ProcessStartInfo startInfo = new("dotnet")
            {
                RedirectStandardError = true,
                RedirectStandardOutput = true,
                UseShellExecute = false,
                WorkingDirectory = Environment.CurrentDirectory,
            };
            startInfo.ArgumentList.Add("run");
            startInfo.ArgumentList.Add("--file");
            startInfo.ArgumentList.Add(sourcePath);

            using Process process = Process.Start(startInfo)
                ?? throw new InvalidDataException("Could not start the verifier compiler-policy probe.");
            Task<string> standardOutput = process.StandardOutput.ReadToEndAsync();
            Task<string> standardError = process.StandardError.ReadToEndAsync();
            await process.WaitForExitAsync().ConfigureAwait(false);
            string output = await standardOutput.ConfigureAwait(false)
                + await standardError.ConfigureAwait(false);

            if (process.ExitCode == 0 || !output.Contains("CS1030", StringComparison.Ordinal))
            {
                throw new InvalidDataException(
                    $"The standards verifier compiler did not reject a #warning with CS1030.{Environment.NewLine}{output}");
            }
        }
        finally
        {
            Directory.Delete(probeDirectory, true);
            try
            {
                Directory.Delete(probeRoot);
            }
            catch (IOException)
            {
                // Another concurrent compiler-policy probe may still own the shared parent.
            }
        }
    }

    private static async Task VerifyNoContainingGitRefAsync(string mergeBase)
    {
        if (!IsLowerHexSha(mergeBase))
        {
            throw new InvalidDataException("The merge base must be an exact lowercase 40-character commit SHA.");
        }

        ProcessStartInfo startInfo = new("git")
        {
            RedirectStandardError = true,
            RedirectStandardOutput = true,
            UseShellExecute = false,
        };
        startInfo.ArgumentList.Add("for-each-ref");
        startInfo.ArgumentList.Add("--format=%(refname)");
        foreach (string gitRefNamespace in StrykerGitRefNamespaces)
        {
            startInfo.ArgumentList.Add(gitRefNamespace);
        }

        using Process process = Process.Start(startInfo)
            ?? throw new InvalidDataException("Could not inspect Git refs.");
        Task<string> standardOutput = process.StandardOutput.ReadToEndAsync();
        Task<string> standardError = process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync().ConfigureAwait(false);
        string gitRefs = await standardOutput.ConfigureAwait(false);
        string error = await standardError.ConfigureAwait(false);
        if (process.ExitCode != 0)
        {
            throw new InvalidDataException($"Could not inspect Git refs:{Environment.NewLine}{error}");
        }

        VerifyNoContainingGitRef(mergeBase, gitRefs);
    }

    private static bool IsLowerHexSha(string value)
    {
        if (value.Length != 40)
        {
            return false;
        }

        foreach (char character in value)
        {
            if (character is not (>= '0' and <= '9') and not (>= 'a' and <= 'f'))
            {
                return false;
            }
        }

        return true;
    }

    private static void VerifyNoContainingGitRef(string mergeBase, string gitRefs)
    {
        using StringReader reader = new(gitRefs);
        while (reader.ReadLine() is { } gitRef)
        {
            if (gitRef.Contains(mergeBase, StringComparison.Ordinal))
            {
                throw new InvalidDataException(
                    $"Stryker's Git ref lookup would make merge-base SHA {mergeBase} ambiguous with {gitRef}. Rename or remove the colliding Git ref.");
            }
        }
    }

    private static void VerifyMutationDiffTaskConfiguration(string taskConfiguration)
    {
        const string heading = "[tasks.\"csharp:mutants:diff\"]";
        int taskStart = taskConfiguration.IndexOf(heading, StringComparison.Ordinal);
        if (taskStart < 0)
        {
            throw new InvalidDataException("The C# mutation diff task is missing.");
        }

        int nextTask = taskConfiguration.IndexOf("\n[tasks.", taskStart + heading.Length, StringComparison.Ordinal);
        string task = nextTask < 0
            ? taskConfiguration[taskStart..]
            : taskConfiguration[taskStart..nextTask];
        int untrackedGuard = task.IndexOf(
            "git ls-files --others --exclude-standard",
            StringComparison.Ordinal);
        int reviewableGuidance = task.IndexOf("git add -N <path>", StringComparison.Ordinal);
        int emptyDiffCheck = task.IndexOf("git diff --quiet", StringComparison.Ordinal);
        int strykerInvocation = task.IndexOf("dotnet stryker", StringComparison.Ordinal);
        if (untrackedGuard < 0
            || reviewableGuidance < 0
            || emptyDiffCheck < 0
            || strykerInvocation < 0
            || untrackedGuard > emptyDiffCheck
            || untrackedGuard > strykerInvocation)
        {
            throw new InvalidDataException(
                "The C# mutation diff task must reject untracked files with git add -N guidance before checking or invoking the diff lane.");
        }
    }

    private static void VerifyGitRefNamespaceConfiguration()
    {
        if (!string.Equals(
                string.Join('\n', StrykerGitRefNamespaces),
                "refs/heads\nrefs/remotes\nrefs/tags",
                StringComparison.Ordinal))
        {
            throw new InvalidDataException(
                "The Stryker SHA-shadow preflight must inspect local branches, remote branches, and tags.");
        }
    }

    private static async Task ExpectBuildDiagnosticAsync(
        string diagnostic,
        string sourceFileName,
        string source)
    {
        string probeRoot = Path.Combine(Environment.CurrentDirectory, "StrykerOutput", "policy-probes");
        string probeDirectory = Path.Combine(probeRoot, Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(probeDirectory);

        try
        {
            string sourcePath = Path.Combine(probeDirectory, sourceFileName);
            string targetsPath = Path.Combine(probeDirectory, "PolicyProbe.targets");
            File.WriteAllText(sourcePath, source);
            File.WriteAllText(
                targetsPath,
                $"""
                <Project>
                  <ItemGroup>
                    <Compile Include="{SecurityElement.Escape(sourcePath)}" />
                  </ItemGroup>
                </Project>
                """);

            ProcessStartInfo startInfo = new("dotnet")
            {
                RedirectStandardError = true,
                RedirectStandardOutput = true,
                UseShellExecute = false,
                WorkingDirectory = Environment.CurrentDirectory,
            };
            startInfo.ArgumentList.Add("build");
            startInfo.ArgumentList.Add("--no-restore");
            startInfo.ArgumentList.Add("-warnaserror");
            startInfo.ArgumentList.Add("-p:ContinuousIntegrationBuild=true");
            startInfo.ArgumentList.Add("-p:TreatWarningsAsErrors=true");
            startInfo.ArgumentList.Add($"-p:CustomAfterMicrosoftCSharpTargets={targetsPath}");

            using Process process = Process.Start(startInfo)
                ?? throw new InvalidDataException("Could not start the analyzer policy build.");
            Task<string> standardOutput = process.StandardOutput.ReadToEndAsync();
            Task<string> standardError = process.StandardError.ReadToEndAsync();
            await process.WaitForExitAsync().ConfigureAwait(false);
            string output = await standardOutput.ConfigureAwait(false)
                + await standardError.ConfigureAwait(false);

            if (process.ExitCode == 0)
            {
                throw new InvalidDataException($"The {diagnostic} negative policy probe unexpectedly built.");
            }

            VerifyOnlyExpectedBuildDiagnostic(output, diagnostic);
        }
        finally
        {
            Directory.Delete(probeDirectory, true);
            try
            {
                Directory.Delete(probeRoot);
            }
            catch (IOException)
            {
                // Another concurrent policy probe may still own the shared parent.
            }
        }
    }

    private static void VerifyOnlyExpectedBuildDiagnostic(string output, string expectedDiagnostic)
    {
        bool foundExpected = false;
        using StringReader reader = new(output);
        while (reader.ReadLine() is { } line)
        {
            const string errorMarker = ": error ";
            const string warningMarker = ": warning ";
            int markerIndex = line.IndexOf(errorMarker, StringComparison.Ordinal);
            string marker = errorMarker;
            if (markerIndex < 0)
            {
                markerIndex = line.IndexOf(warningMarker, StringComparison.Ordinal);
                marker = warningMarker;
            }
            if (markerIndex < 0)
            {
                continue;
            }

            int diagnosticStart = markerIndex + marker.Length;
            int diagnosticEnd = line.IndexOf(':', diagnosticStart);
            if (diagnosticEnd < 0)
            {
                throw new InvalidDataException(
                    $"Could not parse a build diagnostic line:{Environment.NewLine}{line}");
            }

            string actualDiagnostic = line[diagnosticStart..diagnosticEnd].Trim();
            if (!string.Equals(actualDiagnostic, expectedDiagnostic, StringComparison.Ordinal))
            {
                throw new InvalidDataException(
                    $"The {expectedDiagnostic} policy probe also emitted unrelated diagnostic {actualDiagnostic}. Build output:{Environment.NewLine}{output}");
            }
            if (!string.Equals(marker, errorMarker, StringComparison.Ordinal))
            {
                throw new InvalidDataException(
                    $"The {expectedDiagnostic} policy probe remained a warning instead of a build error. Build output:{Environment.NewLine}{output}");
            }
            foundExpected = true;
        }

        if (!foundExpected)
        {
            throw new InvalidDataException(
                $"The negative policy probe failed without {expectedDiagnostic}. Build output:{Environment.NewLine}{output}");
        }
    }

    private static void RunSelfTests()
    {
        const string mergeBase = "0123456789abcdef0123456789abcdef01234567";
        const string validConfiguration = """
            {"stryker-config":{"coverage-analysis":"off","reporters":["cleartext","json"]}}
            """;
        const string killed = """
            {"files":{"Example.cs":{"source":"class Example {}","mutants":[{"status":"Killed"}]}}}
            """;
        const string survived = """
            {"files":{"Example.cs":{"source":"class Example {}","mutants":[{"status":"Survived"}]}}}
            """;
        const string noCoverage = """
            {"files":{"Example.cs":{"source":"class Example {}","mutants":[{"status":"NoCoverage"}]}}}
            """;
        const string empty = """
            {"files":{"Example.cs":{"source":"class Example {}","mutants":[]}}}
            """;
        const string reasonedIgnored = """
            {"files":{"Example.cs":{"source":"// Stryker disable once all: the API normalizes both forms\nclass Example {}","mutants":[{"status":"Killed"},{"status":"Ignored","statusReason":"Equivalent boundary mutant: the API normalizes both forms."}]}}}
            """;
        const string rangedDirective = """
            {"files":{"Example.cs":{"source":"// Stryker disable all: broad region\nclass Example {}\n// Stryker restore all","mutants":[{"status":"Killed"},{"status":"Ignored","statusReason":"broad region"}]}}}
            """;

        VerifyStrykerConfiguration(File.ReadAllText("stryker-config.json"));
        VerifyMutationDiffTaskConfiguration(
            File.ReadAllText(Path.Combine(".config", "mise", "conf.d", "20-csharp.toml")));
        VerifyGitRefNamespaceConfiguration();
        VerifyStrykerConfiguration(validConfiguration);
        VerifyOnlyExpectedBuildDiagnostic("PolicyProbe.cs(1,1): error RS0030: banned API", "RS0030");
        ExpectFailure(() => VerifyOnlyExpectedBuildDiagnostic(
            "PolicyProbe.cs(1,1): warning RS0030: banned API",
            "RS0030"));
        ExpectFailure(() => VerifyOnlyExpectedBuildDiagnostic(
            "PolicyProbe.cs(1,1): error SA1633: unrelated StyleCop default",
            "SA1404"));
        ExpectFailure(() => VerifyOnlyExpectedBuildDiagnostic(
            "PolicyProbe.cs(1,1): error SA1404: expected\nPolicyProbe.cs(2,1): error SA1633: unrelated",
            "SA1404"));
        ExpectFailure(() => VerifyStrykerConfiguration(
            """{"stryker-config":{"coverage-analysis":"perTest","reporters":["json"]}}"""));
        ExpectFailure(() => VerifyStrykerConfiguration(
            """{"stryker-config":{"coverage-analysis":"off","reporters":["cleartext"]}}"""));
        ExpectFailure(() => VerifyMutationDiffTaskConfiguration(
            "[tasks.\"csharp:mutants:diff\"]\nrun = \"git diff --quiet\""));
        VerifyStrykerRun(killed, "ordinary output", true);
        VerifyStrykerRun(survived, "ordinary output", true);
        VerifyStrykerRun(reasonedIgnored, "[03:00:00 ERR] unrelated tool error text", true);
        ExpectFailure(() => VerifyStrykerRun(rangedDirective, "ordinary output", true));
        VerifyStrykerDirectivePolicy("Example.cs", "// Stryker  disable once Arithmetic: equivalent boundary");
        foreach (string compactDirective in new[]
        {
            "// Stryker disableArithmetic: hidden range",
            "// Strykerdisable Arithmetic: hidden range",
            "// Stryker restoreArithmetic",
            "/* Strykerdisable all: hidden range */",
        })
        {
            ExpectFailure(() => VerifyStrykerDirectivePolicy("Example.cs", compactDirective));
        }
        VerifyStrykerRun(empty, "ordinary output", false);
        VerifyNoContainingGitRef(
            mergeBase,
            "refs/heads/main\nrefs/remotes/origin/main\nrefs/tags/v1.0.0\n");
        ExpectFailure(() => VerifyNoContainingGitRef(
            mergeBase,
            $"refs/heads/review-{mergeBase}-shadow\n"));
        ExpectFailure(() => VerifyNoContainingGitRef(
            mergeBase,
            $"refs/remotes/origin/{mergeBase}\n"));
        ExpectFailure(() => VerifyNoContainingGitRef(
            mergeBase,
            $"refs/tags/release-{mergeBase}\n"));
        ExpectFailure(() => VerifyStrykerRun(noCoverage, "ordinary output", true));
        ExpectFailure(() => VerifyStrykerRun(empty, "ordinary output", true));
        ExpectFailure(() => VerifyStrykerRun(killed, "Arithmetic not recognized as a mutator at 3:2", true));
        ExpectFailure(() => VerifyStrykerRun(killed, "Invalid Stryker comments at 5:1", true));
        ExpectFailure(() => VerifyStrykerRun(
            killed,
            "Parsing Stryker comments at 7:4 took too long to parse and was ignored.",
            true));
        ExpectFailure(() => VerifyStrykerRun("{}", "ordinary output", true));
        ExpectFailure(() => VerifyStrykerRun(
            """{"files":{"Example.cs":{"source":"class Example {}","mutants":[{"status":"Pending"}]}}}""",
            "ordinary output",
            true));
        ExpectFailure(() => VerifyStrykerRun(
            """{"files":{"Example.cs":{"source":"class Example {}","mutants":[{"status":"FutureStatus"}]}}}""",
            "ordinary output",
            true));
        ExpectFailure(() => VerifyStrykerRun(
            """{"files":{"Example.cs":{"source":"class Example {}","mutants":[{"status":"Killed"},{"status":"Ignored","statusReason":""}]}}}""",
            "ordinary output",
            true));
        ExpectFailure(() => VerifyStrykerRun(
            """{"files":{"Example.cs":{"source":"class Example {}","mutants":[{"status":"Killed"},{"status":"Ignored","statusReason":"  Ignored via code comment  "}]}}}""",
            "ordinary output",
            true));
        ExpectFailure(() => VerifyStrykerRun(
            """{"files":{"Example.cs":{"source":"class Example {}","mutants":[{"status":"Killed"},{"status":"Ignored","statusReason":"Ignored via code comment."}]}}}""",
            "ordinary output",
            true));
    }

    private static void ExpectFailure(Action action)
    {
        try
        {
            action();
        }
        catch (InvalidDataException)
        {
            return;
        }

        throw new InvalidDataException("A standards-verifier negative self-test unexpectedly passed.");
    }
}
