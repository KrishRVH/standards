# C99 Contract Decisions

Status: accepted contract evidence for the C standards template, 2026-08-03.

This record separates the language contract from operating-system and C-library
contracts. It is not a claim of ISO, POSIX, CERT, MISRA, or CWE conformance. The
public C99 source used below is WG14 N1256, the committee draft incorporating
the published C99 technical corrigenda; the published ISO standard remains the
normative text.

## Authority order

When authorities disagree, apply them in this order:

1. Declared language and platform contract.
2. Normative API and runtime contracts.
3. Observable behavior and regression tests.
4. Compiler and linker correctness diagnostics.
5. Sanitizers and proven high-signal static-analysis findings.
6. Advisory diagnostics and heuristic analysis.
7. Formatting and stylistic preference.

A lower-ranked authority cannot silently override a higher-ranked one. In
particular, formatting cannot determine semantics, a checker cannot redefine a
platform contract, and a warning is not repaired until its represented
execution path is understood.

Enforcement: profile-specific compilation and standards regression tests cover
the executable parts of these decisions. The ordering itself is an agent and
review rule.

## Language and execution contract

The default language profile is hosted ISO C99 syntax and semantics, with
compiler extensions disabled. `-std=c99` and `C_EXTENSIONS OFF` select a C
language dialect; they do not select POSIX, Win32, a libc, an object-file ABI,
or a large-file ABI.

Freestanding execution is a different contract. C99 leaves the startup
function and most library availability implementation-defined for a
freestanding implementation. It is therefore unsupported by the default
profile and must be introduced as a separately named target with its own
runtime contract and tests.

The platform/API profiles are:

| Profile      | Contract                                                            | Required profile definitions                                                                         | Limits                                                                                                                                                 |
| ------------ | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `iso-hosted` | Hosted ISO C99 library only                                         | None beyond `-std=c99`                                                                               | POSIX and Win32 APIs are rejected as undeclared dependencies.                                                                                          |
| `posix-2008` | Hosted C99 plus POSIX.1-2008 interfaces                             | `_POSIX_C_SOURCE=200809L`; `_FILE_OFFSET_BITS=64` on supported libc targets that implement the macro | `CLOCK_MONOTONIC` also requires the POSIX Monotonic Clock option and a checked runtime call. Large-file behavior is libc/ABI-specific.                 |
| `win32`      | Hosted C99 plus the declared Microsoft CRT and Windows 10 API floor | `_WIN32_WINNT=0x0A00`; `WINVER=0x0A00` selected by the target                                        | `_fseeki64`, `_ftelli64`, and `QueryPerformance*` are not ISO C or POSIX. The MinGW job is compile-only; native Windows support requires native tests. |

Enforcement: the ISO and POSIX profiles must be distinct compile fixtures. A
source using POSIX interfaces must fail the `iso-hosted` fixture and compile in
the supported `posix-2008` fixture. A platform combination that is not tested
must be described as unverified rather than inferred from a preprocessor
branch.

### Feature-test macro placement and ABI

POSIX requires `_POSIX_C_SOURCE` to be defined before any header is included.
glibc imposes the same ordering on its feature-test macros and permits either a
source definition or a compiler `-D` definition. The build profile is the
canonical declaration for this template: apply definitions to the target that
uses the APIs, not globally. This keeps the source independently auditable and
prevents the profile from leaking into dependencies.

Use target-private definitions when every affected type remains inside the
target. If a public header exposes `off_t` or any type whose declaration changes
with a feature macro, either remove that platform type from the public API or
propagate the exact macro contract to consumers. Every translation unit that
shares an ABI-visible declaration must see the same definitions.

On glibc, `_FILE_OFFSET_BITS=64` changes the 32-bit large-file ABI: `off_t`
becomes 64-bit and interfaces such as `fseeko` are redirected to their 64-bit
variants. It has no effect on a 64-bit glibc ABI. In musl 1.2.5, `off_t` is
already a 64-bit signed type and the public feature headers do not give
`_FILE_OFFSET_BITS` this redirection role. Therefore `_FILE_OFFSET_BITS=64` is
an implementation-specific large-file contract, not a POSIX or C99 rule.

Source-local declarations remain acceptable for a deliberately standalone,
self-declaring source. Such a source must reject a conflicting predefinition;
a source-local `#ifndef` block silently accepts values such as
`_FILE_OFFSET_BITS=32` and is not a complete contract check. Omitting a source
block is safe only when the selected build target demonstrably supplies the
equivalent definitions before all system headers.

`_TIME_BITS=64` is not enabled by this generic profile. Its availability and
interaction with `_FILE_OFFSET_BITS` are libc-version-specific and require a
separately bounded target before use.

## Hosted `argc` and `argv`

C99 5.1.2.2.1 requires `argc` to be nonnegative and `argv[argc]` to be a null
pointer. Only when `argc` is greater than zero does it guarantee that
`argv[0]` through `argv[argc - 1]` point to strings. Consequently:

- `argc == 0` is a permitted hosted startup state.
- At initial hosted startup, `argv[i]` is a non-null string pointer whenever
  `0 <= i && i < argc`; a null check inside that loop does not validate a
  possible state under the declared contract.
- `argv[0]` must not be evaluated unless `argc > 0`. Usage/error paths need a
  fallback program name for `argc == 0`.
- A separately callable public parser does not automatically inherit `main`'s
  startup contract. Its pointer/count preconditions must be documented and
  validated at that public boundary.

Ordinary portable C cannot recover meaningfully from corruption that violates
the process-startup contract. Checks belong at trust boundaries and public API
boundaries, not around states already excluded by the active contract.

Enforcement: the argument-contract regression exercises an `argc == 0` entry
path.
The non-null guarantee inside `i < argc` is an agent/review rule; no checker is
allowed to force a redundant test.

## POSIX profile interfaces

`struct timespec`, `clock_gettime`, `CLOCK_MONOTONIC`, `off_t`, `fseeko`, and
`ftello` are outside the ISO C99 API surface used by this project. POSIX.1-2008
defines them subject to feature visibility and option requirements:

- `fseeko` has the positioning behavior of `fseek` but uses `off_t`.
- `ftello` returns the current byte offset as `off_t`, or `(off_t)-1` on
  failure.
- `clock_gettime` returns zero on success and `-1` with `errno` on failure.
- `CLOCK_MONOTONIC` is available when the Monotonic Clock option is supported;
  namespace exposure alone does not prove runtime support.

Code must check `clock_gettime`; casting its result to `void` can turn a timer
failure into a plausible but fabricated timestamp. On glibc, `clock_gettime`
has been in libc since 2.17; older glibc systems may require `-lrt`. That linker
detail is part of the supported runtime range, not part of C99 or POSIX source
semantics.

Enforcement: POSIX compile/link fixtures verify declaration exposure on every
claimed libc/compiler combination. A behavioral fixture must cover timer
failure handling where the platform permits injection; otherwise return-value
handling is a mandatory review rule.

## Standard I/O decisions

### Read contract

C99 `fread` returns the number of complete elements read, which can be smaller
than requested on end-of-file or a read error. If either `size` or `nmemb` is
zero, it returns zero without changing the array or stream state.

For a declared operation that reads one previously measured, seekable
regular-file snapshot or rejects it, one exact-size `fread` followed by an
equality check is the clearer expression. A short first call is already grounds
to reject this operation; retrying without classifying and clearing an error
does not improve correctness. A stream protocol or a caller that accepts
incremental data has a different contract and normally needs a loop.

A prior measurement does not create an atomic snapshot. The file can grow,
shrink, or be replaced between measurement and reading. The implementation must
explicitly choose whether to reject a short read, reject any size change, retry
a bounded snapshot, or consume a stream. A loop is not evidence that the race
disappeared.

### Output and cleanup contract

C99 gives different meanings to different failures; one universal
"check every return immediately" rule is incorrect.

| Context                                         | Required policy                                                                                     | Acceptable intentional exception                                                                                                        |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Output is part of the program's required result | Detect and propagate failure at the operation or at the owning `fflush`/`ferror`/`fclose` boundary. | None without changing the public operation contract.                                                                                    |
| Fatal diagnostic after a primary failure        | Preserve one cohesive best-effort diagnostic and the primary failure status.                        | One documented helper or narrow local suppression may intentionally ignore the diagnostic write result when no useful recovery remains. |
| Cleanup after an earlier failure                | Release the resource and preserve the primary error.                                                | A narrowly annotated ignored cleanup result is allowed when reporting it cannot change the outcome.                                     |
| Normal successful close/flush                   | Treat failure as operation failure when buffered output or durable handoff matters.                 | Only when the API explicitly defines close as best effort.                                                                              |

`fprintf` returns the number of characters transmitted or a negative value on
an output or encoding error. A conversion argument that does not have the
required type is undefined behavior. `fflush` attempts to deliver buffered
output and reports an output error with `EOF`; `ferror` reports the stream's
sticky error indicator. `fclose` also flushes output and can report `EOF`, but
the stream becomes disassociated whether close succeeds or fails. That last
rule makes an ignored close result defensible on some already-failing cleanup
paths, but not on a success path whose output is required.

Splitting one `fprintf(stderr, ...)` diagnostic into several `fputs`/`fputc`
operations adds failure and interleaving points without handling any of them.
Scattered `(void)` casts acknowledge discarded values but do not handle
failure. The checker policy must be suppressed or wrapped at the narrow policy
boundary rather than changing the behavior to appease it.

Enforcement: format-type mistakes are hard compiler diagnostics. Required
output and snapshot behavior need regression tests. Best-effort diagnostic and
cleanup exceptions require a reason adjacent to the helper or narrow
suppression; broad suppressions and mechanical `(void)` casts fail review.

## C behavior taxonomy

C99 distinguishes:

- **Undefined behavior:** the standard imposes no requirements.
- **Unspecified behavior:** two or more possibilities are allowed and the
  implementation need not document which occurs.
- **Implementation-defined behavior:** the implementation chooses and must
  document its choice.

"Erroneous behavior" is not a normative C99 behavior category and is used here
only as an ordinary description of a defect.

Reachable undefined behavior and constraint violations are hard failures.
Externally observable dependence on unspecified behavior is a hard failure
unless the contract proves every permitted outcome equivalent. An
implementation-defined choice is permitted only when the selected profile
documents, bounds, and tests that choice. Annex J of N1256 is an informative
index, not a substitute for the governing clauses.

This policy applies especially to signed overflow, invalid shifts, effective
type and aliasing, alignment, object lifetime, uninitialized reads, sequencing,
format arguments, pointer comparisons, integer representations, layout,
endianness, union access, and `volatile`. A heuristic warning about one of
these remains lower authority until a reachable path and violated contract are
established.

Enforcement: seeded compiler, sanitizer, analyzer, and behavior fixtures cover
the defect classes they claim. Remaining cases are explicit review rules and
must not be advertised as automatically proved.

## Tooling decisions

### Compiler and CMake policy

Warning flags are private to owned targets and classified separately for
upstream Clang's GNU frontend and GCC. An unknown compiler fails configuration
unless the caller explicitly selects `PROJECT_ALLOW_UNVERIFIED_COMPILER=ON`,
which disables the strict warning policy and creates no support claim. MSVC,
clang-cl, AppleClang, and CompCert are not strict profiles because this template
does not continuously configure, build, and run them. Microsoft documents C11
and C17 `/std:c*` modes but no selectable strict C99 mode; `/W4` alone was not
evidence of this project's language contract.

The warning regression first asserts the exact flag tokens in each CMake
compilation database. For ordinary warnings it then observes the named warning
with exit status 0 using only the enabling flag and its documented companion,
and separately proves blanket `-Werror` promotion. The three C99 constraint
diagnostics test their exact `-Werror=...` flags directly. This distinction is
necessary because GCC documents that `-Werror=foo` also implies `-Wfoo` and
therefore cannot prove another flag enabled the warning. Clang 22 accepts
`-Wold-style-definition` without diagnosing the seeded K&R definition, so GCC
keeps that flag while Clang uses the active
`-Wdeprecated-non-prototype`. GCC's optimization-dependent null-dereference
warning is exercised in a separate Release preset rather than claimed from the
Debug gate.

`-Wall`, `-Wextra`, `-Wpedantic`, and `-Wconversion` are warning groups, and
blanket `-Werror` also promotes default-on diagnostics. The exact pinned
invocations are therefore resolved with Clang `diagtool show-enabled` and GCC
`-Q --help=warnings`; line counts and SHA-256 contracts fail on any expansion,
removal, severity change, or option change. The compact hashes keep 1,694 lines
of Clang diagnostic internals out of agent context while making drift
deterministic; reviewers can regenerate the full output and inspect `diagtool
tree` before accepting an update. Representative fixtures prove every explicit
flag's intended defect class, but the project does not pretend that every
compiler-internal member has an independent behavioral fixture.

The language properties are applied to each target. Public `c_std_99` usage
requirements tell consumers the header's minimum language feature; private
warning flags and private platform definitions do not leak into dependencies.
Every owned compiled target must pass through `project_apply_common`; a final
recursive directory assertion rejects a target that does not, including an
omission below an owned `add_subdirectory`. That helper alone opts the
target into `EXPORT_COMPILE_COMMANDS`, a target property introduced in CMake
3.20. It rejects interface and other noncompiled targets because this template
does not define header-only warning or platform-macro propagation. The
dedicated analyzer database therefore excludes third-party targets without
guessing from source paths. After `add_subdirectory`, the narrow
`project_exclude_c_standards_directory(path, reason)` marker can exempt a
reviewed third-party directory after it is added. The reason is mandatory and
reported at configure time; a directory cannot exempt itself, and the
exception cannot exempt one owned target. This is the concrete reason the
minimum remains 3.20 rather than being lowered or raised.

Before a named stage builds, `c-build.sh` verifies the configured compiler path,
family and version, build type, platform name and exact feature-macro set,
`PROJECT_WERROR` plus every required warning flag on every compile command, and
sanitizer cache plus instrumentation.
It rejects a supposedly ISO database containing POSIX or Win32 feature macros.
These executable checks prevent a changed preset from retaining a strong label
while silently using a different tool or weaker profile.

The native sanitizer job combines ASan and UBSan because Clang officially
supports both in one invocation and the seeded defects prove independent
signals. `-fno-sanitize-recover=all` is essential because recovering UBSan can
report signed overflow and still exit successfully. MemorySanitizer is not a
default because all linked code must be instrumented and initialized;
ThreadSanitizer is not a default for a nonconcurrent sample; fuzzing has no
declared input surface. GCC's static analyzer, 32-bit, and musl jobs remain
project-specific extensions rather than prestige gates.

The MinGW profile does not force `-static` without a package-consumer or native
runtime contract. The exploratory cross profile uses the selected MinGW-w64
toolchain's default linkage. Static CRT/runtime packaging varies by toolchain
and CRT choice and remains unsupported until a named deployment profile can
compile, package, and execute a representative consumer.

### Direct clang-tidy policy

clangd remains an editor facility. Its official documentation states that not
all clang-tidy checks work within clangd, and its default strict fast-check
filter further limits editor execution. The hard gate therefore verifies a
nonempty compilation database and uses the official `run-clang-tidy` driver.
It checks the pinned tool versions, Clang resource headers, configuration
validity, all database translation units, project headers, parallel exit status,
and a committed 25-check resolved set. The driver receives each C translation
unit explicitly. The gate requires its selected count to equal the database
entry count, rejecting duplicate source entries whose competing commands the
driver would otherwise deduplicate and choose between ambiguously. Missing
inputs, zero selected C units, or tools are hard errors.
The pinned conda `clang-tools` package supplies clang-tidy and the parallel
driver but not a complete Clang resource-header tree, so the gate pairs it with
the same-version pinned LLVM Clang resource directory and verifies
`include/stddef.h` before analysis.

The standard-library model includes POSIX contracts, but it cannot expose a
POSIX name by itself: the compiler command still must select the `posix-2008`
profile before a POSIX declaration exists. ISO-only compilation remains the
higher-ranked namespace gate, while the POSIX model becomes relevant only for
a translation unit whose declared profile exposes those calls.

Broad wildcard families are disabled. Under clang-tidy 22.1.8 they resolve to
296 checks:
102 `bugprone`, 41 `cert`, 128 analyzer, 19 `performance`, five `portability`,
and one readability check. Many were C++, Objective-C, or platform-specific.
Hard checks are explicit and limited to top-level checks with seeded
evidence. The additional analyzer-core names in the 25-check resolution are
dependencies of those top-level path checks, not independent compliance
claims. Plausible but unseeded bugprone and platform-API findings run in a
separate zero-baseline advisory ratchet. A tool upgrade cannot silently add a
hard check.

The check-specific options are policy, not incidental defaults.
`clang-analyzer-core.BitwiseShift:Pedantic=true` reports ISO-undefined shifts
even where a compiler commonly supplies an extension. The Stream check stays
non-pedantic because LLVM defines that mode to assume commonly unchecked stream
operations do not fail; the explicit I/O ownership policy and fixtures decide
where failure handling is required. POSIX standard-library modeling is
advisory and cannot expose declarations absent from the compiler profile.
`cert-err33-c.AllowCastToVoid=false` makes mechanical discarded-result casts
visible. The checker does not decide the repair: required results are handled
at the operation or ownership boundary, while one cohesive best-effort fatal
diagnostic may use a check-specific, reasoned suppression. The hard analyzer
caught the seeded double free, use after free, path leak, null dereference,
uninitialized return, invalid shift, mismatched cleanup as an unclosed stream,
and header defect. It did not reliably prove generic allocation multiplication
overflow or conditional signed overflow; behavior helpers and UBSan own those
claims.

CTest is invoked with `--no-tests=error`, and every native test preset carries
the same policy. A configuration that accidentally removes all registered
tests therefore fails instead of printing “No tests were found” and passing.
The sample arithmetic API also demonstrates its own integer policy: it checks
representability before addition, rejects a null output pointer, and preserves
the output on failure. Boundary tests cover `INT_MIN` and `INT_MAX`; unchecked
`int` addition would admit reachable signed-overflow undefined behavior.

### Formatter policy

The clang-format 22.1.8 policy uses four-column continuation indentation,
disallows the all-arguments and all-parameters next-line shortcuts, and assigns
a high penalty to isolating C return types. Bracket alignment remains enabled
to keep function-pointer declarations cohesive, while separate definition
blocks preserve readable boundaries between C definitions.

Only options valid for the pinned major version remain. The representative
golden fixture is compared byte-for-byte and formatted twice to prove stability.
Formatting never establishes behavior preservation.

## Primary-source ledger

| Source and applicable version                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Decision supported                                                                                                                                                              | Limitation or uncertainty                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [WG14 N1256, C99 plus TC1-TC3](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1256.pdf), clauses 3.4, 4, 5.1.2, 5.1.2.2.1, 7.19.3, 7.19.5.1-.2, 7.19.6.1, 7.19.8.1, 7.19.10.3, and 7.23                                                                                                                                                                                                                                                                                                                           | Hosted/freestanding separation; `argc`/`argv`; behavior categories; stream state; `fclose`, `fflush`, `fprintf`, `fread`, `ferror`; ISO C99 time API surface                    | Public committee draft, not the paywalled published ISO text. It incorporates the published C99 corrigenda and supplies the clause numbering used here.                                                    |
| [WG14 C99 issue log](https://www.open-std.org/jtc1/sc22/wg14/issues/c99/log.html)                                                                                                                                                                                                                                                                                                                                                                                                                                    | Check for published defect-report corrections affecting the cited C99 conclusions                                                                                               | No accepted correction found that changes the initial hosted-startup or I/O conclusions above. Later questions about recursive calls to `main` do not weaken the initial-startup guarantee used here.      |
| [POSIX.1-2017, General Concepts: conformance](https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap02.html)                                                                                                                                                                                                                                                                                                                                                                                              | `_POSIX_C_SOURCE=200809L` before any header selects the Issue 7 namespace; POSIX is an additional API contract                                                                  | Issue 7/2018 edition; a project claiming a newer POSIX edition needs a new profile and tests.                                                                                                              |
| [POSIX.1-2017 `clock_gettime`](https://pubs.opengroup.org/onlinepubs/9699919799/functions/clock_getres.html)                                                                                                                                                                                                                                                                                                                                                                                                         | Return/error contract and conditional `CLOCK_MONOTONIC` support                                                                                                                 | Runtime availability depends on the Monotonic Clock option.                                                                                                                                                |
| [POSIX.1-2017 `fseek`/`fseeko`](https://pubs.opengroup.org/onlinepubs/9699919799/functions/fseek.html), [`ftell`/`ftello`](https://pubs.opengroup.org/onlinepubs/9699919799/functions/ftell.html), and [`<sys/types.h>`](https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/sys_types.h.html)                                                                                                                                                                                                                 | `off_t` positioning interfaces are POSIX, not ISO C99; their exact return contracts                                                                                             | Maximum representable file offset remains implementation-dependent.                                                                                                                                        |
| [GNU C Library 2.43 manual: feature-test macros](https://sourceware.org/glibc/manual/2.43/html_node/Feature-Test-Macros.html)                                                                                                                                                                                                                                                                                                                                                                                        | Macro ordering, `_POSIX_C_SOURCE`, and `_FILE_OFFSET_BITS=64` redirection/ABI behavior                                                                                          | glibc-specific; 32-bit and 64-bit ABIs differ.                                                                                                                                                             |
| [GNU C Library manual: getting the time](https://sourceware.org/glibc/manual/2.43/html_node/Getting-the-Time.html)                                                                                                                                                                                                                                                                                                                                                                                                   | `clock_gettime` linker-history boundary at glibc 2.17                                                                                                                           | Applies to glibc, not every POSIX libc.                                                                                                                                                                    |
| [musl 1.2.5 `features.h`](https://git.musl-libc.org/cgit/musl/tree/include/features.h?h=v1.2.5), [`alltypes.h.in`](https://git.musl-libc.org/cgit/musl/tree/include/alltypes.h.in?h=v1.2.5), [`stdio.h`](https://git.musl-libc.org/cgit/musl/tree/include/stdio.h?h=v1.2.5), and [`time.h`](https://git.musl-libc.org/cgit/musl/tree/include/time.h?h=v1.2.5)                                                                                                                                                        | Strict-mode namespace exposure and musl's 64-bit `off_t`; no glibc-style `_FILE_OFFSET_BITS` redirection in these public headers                                                | Official implementation source rather than a general promise for every future musl release; the tested profile must pin or bound its range.                                                                |
| [Microsoft `_fseeki64`](https://learn.microsoft.com/en-us/cpp/c-runtime-library/reference/fseek-fseeki64?view=msvc-170), [`_ftelli64`](https://learn.microsoft.com/en-us/cpp/c-runtime-library/reference/ftell-ftelli64?view=msvc-170), [`QueryPerformanceCounter`](https://learn.microsoft.com/en-us/windows/win32/api/profileapi/nf-profileapi-queryperformancecounter), and [`QueryPerformanceFrequency`](https://learn.microsoft.com/en-us/windows/win32/api/profileapi/nf-profileapi-queryperformancefrequency) | Microsoft CRT/Win32 interfaces and their return contracts must live in a Win32 profile                                                                                          | Documentation targets current MSVC/Windows SDK behavior. A support claim still requires a native tested compiler/runtime and declared OS floor.                                                            |
| [Microsoft `main` arguments](https://learn.microsoft.com/en-us/cpp/c-language/arguments-to-main?view=msvc-170)                                                                                                                                                                                                                                                                                                                                                                                                       | Microsoft documents a stronger `argc >= 1` runtime guarantee                                                                                                                    | This implementation extension cannot replace C99's weaker cross-profile guarantee that permits zero.                                                                                                       |
| [Microsoft: using the Windows headers](https://learn.microsoft.com/en-us/windows/win32/winprog/using-the-windows-headers)                                                                                                                                                                                                                                                                                                                                                                                            | `_WIN32_WINNT` and `WINVER` select conditionally declared Windows APIs; `0x0A00` selects the Windows 10 floor                                                                   | Header exposure does not prove runtime behavior or native compiler support; this template's MinGW job is compile/link only.                                                                                |
| [Microsoft `GetSystemTimePreciseAsFileTime`](https://learn.microsoft.com/en-us/windows/win32/api/sysinfoapi/nf-sysinfoapi-getsystemtimepreciseasfiletime)                                                                                                                                                                                                                                                                                                                                                            | A version-gated Win32 declaration and Kernel32 link provide a concrete cross-build API-profile probe                                                                            | The API floor is Windows 8, while the profile deliberately selects Windows 10; compile/link still does not prove target execution.                                                                         |
| [Clang 22.1.0 diagnostics reference](https://releases.llvm.org/22.1.0/tools/clang/docs/DiagnosticsReference.html) and [Clang command guide](https://releases.llvm.org/22.1.0/tools/clang/docs/CommandGuide/clang.html)                                                                                                                                                                                                                                                                                               | Clang-specific warning meanings and strict `-std=c99` driver behavior                                                                                                           | Diagnostic availability and exact wording are bounded to the pinned 22.1.8 tool and regression fixtures.                                                                                                   |
| [GCC 15.2 warning options](https://gcc.gnu.org/onlinedocs/gcc-15.2.0/gcc/Warning-Options.html)                                                                                                                                                                                                                                                                                                                                                                                                                       | GCC-specific warning levels, optimizer dependencies, and `-Werror` behavior                                                                                                     | GCC warning implementations can change; the supported version is pinned and seeded independently.                                                                                                          |
| [LLVM 22.1 clang-tidy guide](https://releases.llvm.org/22.1.0/tools/clang/tools/extra/docs/clang-tidy/index.html), [check catalog](https://releases.llvm.org/22.1.0/tools/clang/tools/extra/docs/clang-tidy/checks/list.html), and [`cert-err33-c`](https://releases.llvm.org/22.1.0/tools/clang/tools/extra/docs/clang-tidy/checks/cert/err33-c.html)                                                                                                                                                               | Compilation database/direct parallel execution, explicit check selection, suppression syntax, and `AllowCastToVoid`                                                             | Analyzer path models remain heuristic; tool names do not establish CERT compliance.                                                                                                                        |
| [LLVM 22.1 `clang-analyzer-unix.Stream` alias](https://releases.llvm.org/22.1.0/tools/clang/tools/extra/docs/clang-tidy/checks/clang-analyzer/unix.Stream.html) and [official analyzer checker reference](https://clang.llvm.org/docs/analyzer/checkers.html)                                                                                                                                                                                                                                                        | `BitwiseShift:Pedantic`, `Stream:Pedantic`, and `StdCLibraryFunctions:ModelPOSIX` semantics; exact option defaults were also inspected in the installed 22.1.8 checker metadata | The detailed online analyzer reference follows current LLVM; the pinned config validation, seeded behavior, and installed 22.1.8 metadata bound this repository's actual claim.                            |
| [clangd features](https://clangd.llvm.org/features) and [clangd configuration](https://clangd.llvm.org/config#clangtidy)                                                                                                                                                                                                                                                                                                                                                                                             | Not every clang-tidy check works in clangd; the default fast-check policy is intentionally bounded                                                                              | Current online clangd documentation is not versioned at the 22.1 patch level; clangd remains informational and never substitutes for the direct hard gate.                                                 |
| [LLVM 22.1 clang-format options](https://releases.llvm.org/22.1.0/tools/clang/docs/ClangFormatStyleOptions.html)                                                                                                                                                                                                                                                                                                                                                                                                     | Version-valid option names, deprecations, bracket/argument/return-type interactions                                                                                             | Readability choices remain project policy and are accepted only through the local golden corpus.                                                                                                           |
| [Clang AddressSanitizer](https://clang.llvm.org/docs/AddressSanitizer.html) and [UndefinedBehaviorSanitizer](https://clang.llvm.org/docs/UndefinedBehaviorSanitizer.html)                                                                                                                                                                                                                                                                                                                                            | Supported instrumentation, exit/failure controls, and combined native profile                                                                                                   | Sanitizers observe executed paths only and do not prove absence of defects. Platform/runtime support varies.                                                                                               |
| [CMake 4.4 `C_STANDARD`](https://cmake.org/cmake/help/v4.4/prop_tgt/C_STANDARD.html), [`C_EXTENSIONS`](https://cmake.org/cmake/help/v4.4/prop_tgt/C_EXTENSIONS.html), [`target_compile_options`](https://cmake.org/cmake/help/v4.4/command/target_compile_options.html), and [`target_compile_definitions`](https://cmake.org/cmake/help/v4.4/command/target_compile_definitions.html)                                                                                                                               | Target-scoped dialect, warnings, and platform definitions; private/public propagation                                                                                           | CMake feature selection cannot by itself prove compiler conformance or runtime API availability.                                                                                                           |
| [CMake 4.4 `EXPORT_COMPILE_COMMANDS`](https://cmake.org/cmake/help/v4.4/prop_tgt/EXPORT_COMPILE_COMMANDS.html), [CTest `--no-tests`](https://cmake.org/cmake/help/v4.4/manual/ctest.1.html#cmdoption-ctest-no-tests), and [test-preset execution options](https://cmake.org/cmake/help/v4.4/manual/cmake-presets.7.html#test-preset)                                                                                                                                                                                 | Per-target compilation-database membership and explicit no-test failure behavior                                                                                                | The target property was introduced in CMake 3.20. A compilation database still proves only the targets deliberately opted into it, so the directory assertion separately proves owned-target registration. |
| [Microsoft C language conformance](https://learn.microsoft.com/en-us/cpp/overview/visual-cpp-language-conformance?view=msvc-170) and [`/std` C modes](https://learn.microsoft.com/en-us/cpp/build/reference/std-specify-language-standard-version?view=msvc-170)                                                                                                                                                                                                                                                     | No strict C99 `/std:c99` profile exists to substantiate an MSVC strict profile                                                                                                  | Current MSVC may accept many C99 features; acceptance is not this template's tested strict profile.                                                                                                        |
| [MinGW-w64 pre-built toolchains](https://www.mingw-w64.org/downloads/) and [official CMake cross-build example](https://www.mingw-w64.org/build-systems/cmake/)                                                                                                                                                                                                                                                                                                                                                      | MinGW-w64 supplies Windows headers/libraries alongside multiple compiler and CRT combinations; a CMake toolchain can establish a compile/link cross target                      | The local GCC 13/MSVCRT compile-only result does not establish native execution, UCRT behavior, or MSVC compatibility.                                                                                     |
