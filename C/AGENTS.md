# C Agent Contract

This template targets hosted ISO C99. Read `README.md`, `diagnostics.toml`, and
`docs/decisions.md` before changing the language, platform, build, or diagnostic
contract. Formatting and analyzer output are evidence inputs, not permission to
change behavior.

## Authority and profiles

Resolve conflicts in this order:

1. Declared language and platform contract.
2. Normative API and runtime contracts.
3. Observable behavior and regression tests.
4. Compiler and linker correctness diagnostics.
5. Sanitizers and proven high-signal static-analysis findings.
6. Advisory diagnostics and heuristic analysis.
7. Formatting and stylistic preference.

A lower authority never silently overrides a higher one. The default language
is strict hosted C99, not GNU99. Declare `iso-hosted`, `posix-2008`, or `win32`
per target; do not infer an OS API from `-std=c99`. Freestanding execution is
unsupported until a project adds a named runtime profile and tests.

Enforcement: CMake target properties and the ISO/POSIX compile and runtime
fixture are hard gates. Authority resolution is a review rule.

## Correction protocol

For a standards correction:

1. Run the existing behavioral tests before editing.
2. Identify the exact diagnostic or violated contract.
3. Classify its authority and severity using `diagnostics.toml`.
4. Make a minimal reproducer when the issue or path is not obvious.
5. Make the smallest semantics-preserving correction.
6. Rerun every gate that passed before the correction.
7. Add a regression test for an actual defect.
8. Avoid unrelated formatting, renaming, and refactoring.
9. Report every deliberately ignored result and suppression.
10. Preserve or explicitly revise the platform profile.
11. Compare behavior, generated output, and performance when the change can
    affect them.

Record this evidence for every nontrivial source correction:

```text
Diagnostic or failure:
Violated contract:
Concrete execution path or counterexample:
Why the state is possible:
Minimal repair:
Behavioral impact:
Portability impact:
Performance impact:
Regression test:
Alternative fixes rejected:
```

Enforcement: review rule. The regression suite proves that missing tools,
databases, and expected-negative failures cannot be reported as passes.

## Contracts and validation

- Validate bytes, files, environment, network data, and other trust-boundary
  inputs according to their actual grammar and range.
- State public API rules for null, empty, overlapping, aliased, and zero-length
  inputs. Validate caller-controlled states the API permits.
- Keep internal preconditions explicit. Use an assertion for a programmer-only
  invariant when aborting is the project contract; use explicit internal-error
  handling when the operation must remain recoverable.
- Do not add checks for states excluded by the declared contract. At hosted
  startup, `argv[i]` is a string pointer for `0 <= i < argc`; a null test in
  that loop is noise. C99 permits `argc == 0`, so guard `argv[0]` and use a
  fallback program name.
- Do not attempt portable recovery from arbitrary process-memory corruption.
  Validate the real external boundary instead.

Enforcement: argument and profile behavior fixtures plus review. Static-analysis
paths cannot redefine the hosted startup contract.

## Integer and size arithmetic

- Check allocation, offset, and indexing addition or multiplication before
  evaluating it. For multiplication, use `count > SIZE_MAX / element_size`
  after handling a zero divisor.
- Use `size_t` for object sizes and array counts, `ptrdiff_t` for pointer
  differences, fixed-width integers for serialized widths, and the API's
  declared signed type at platform boundaries.
- Signed overflow is forbidden. State counter-overflow behavior; do not assume
  input or uptime makes it impossible.
- Before shifting, prove the count is nonnegative and less than the promoted
  left operand's width. Prove that a signed left shift is representable or use
  an appropriate unsigned representation.
- Avoid lossy and sign-changing conversions unless a checked range proves the
  destination represents the value. A cast records that proof; it does not
  create it.
- Compare without overflow. Prefer direct ordered comparisons over subtracting
  two values merely to compare them.

Enforcement: compiler conversion/shift warnings, checked-allocation behavior
fixture, and UBSan. Generic multiplication overflow is also a review rule
because the selected analyzer does not prove it reliably.

## Pointers, arrays, and ownership

- Document whether each pointer is borrowed, transferred, retained, or returned
  as owned. Define cleanup responsibility on every success and failure path.
- Keep pointer arithmetic within one array object (or one-past it), preserve
  alignment, and do not dereference a zero-length buffer merely to obtain a
  value.
- After storage moves or is freed, invalidate every borrowed pointer into it.
- For a resize, keep the original pointer until success. A failed `realloc`
  must not lose the old allocation.
- Use `const` to state non-mutation through that access path. It does not prove
  lifetime, exclusivity, or ownership.

Enforcement: direct analyzer double-free, use-after-free, leak, mismatch, and
header fixtures; ASan; review of public contracts.

## Allocation and destructible state

- Define zero-size allocation semantics at the project boundary rather than
  depending on whether the allocator returns null or a unique pointer.
- Initialize outputs before a fallible operation to a state their destructor
  accepts.
- Make destructors idempotent where that simplifies error paths, resetting
  released fields to a zero/destructible state.
- Centralize cleanup when it prevents duplicated ownership transitions.
  Disciplined `goto cleanup` is allowed when it makes those transitions clearer.

Enforcement: allocation and ownership runtime fixtures, direct analyzer, ASan,
and review.

## Strings and byte buffers

- Distinguish null-terminated text from counted byte sequences in names and
  APIs. Require a terminator only for an API that consumes a C string.
- State encoding assumptions. Do not imply UTF-8, locale text, or arbitrary
  bytes are interchangeable.
- Pass character-classification functions either `EOF` or a value converted
  through `unsigned char`; a negative plain `char` is outside their contract.
- State whether truncation is rejected, reported with required size, or an
  intentional result. Silent truncation is not a defensive policy.

Enforcement: selected string analyzer checks and review of API contracts.

## I/O and resources

- Check and propagate a result when failure changes the required operation.
  Required output is complete only after its owning `fflush`, `ferror`, or
  `fclose` boundary reports success, as applicable.
- Define whether an input is a stream, a regular-file snapshot, or a changing
  file. A short read is normal for streams; an exact-size snapshot reader may
  reject one short `fread` without retrying.
- One measurement followed by one read is not atomic. Choose and test whether
  size changes are rejected, retried, or accepted as streaming input.
- Preserve the primary error when cleanup also fails. On an already-failing
  cleanup path, an ignored close result can be best effort only with a nearby
  reason.
- Keep a fatal diagnostic cohesive. Splitting `fprintf` into several writes
  adds partial-output and interleaving points without handling failure.
- A cast to `void` acknowledges a value; it is not error handling.

Enforcement: return-result clang-tidy policy, short-read fixture, compiler
format diagnostics, and review of the operation's ownership boundary.

## Undefined and implementation-defined behavior

Do not depend on signed overflow, invalid shifts, uninitialized or trap values,
misaligned access, lifetime-ended objects, strict-aliasing/effective-type
violations, mismatched variadic arguments, unsequenced side effects, or pointer
relational comparisons outside one array. Avoid logic that depends on an
unspecified evaluation order.

Document and bound every implementation-defined dependency: integer widths and
representations, right shift of negative values, enum representation, bit-field
layout, padding, endianness, object layout, and file-size types. Use `memcpy` or
an explicit byte representation for type transfer; union punning is allowed
only under a named compiler/platform contract. `volatile` describes observable
access, not atomicity, thread safety, ordering between threads, or device-memory
portability.

Enforcement: compiler diagnostics, direct analyzer fixtures, sanitizers, and
profile tests. Representation/layout assumptions not covered by a named test
remain review rules and cannot be advertised as portable.

## Control flow and portability

- Brace every control-flow body. Mark deliberate fallthrough with the
  compiler-supported annotation/comment selected by the project.
- Handle relevant enum cases explicitly; do not add a default merely to silence
  a checker when omission would reveal a future enumerator.
- Prefer simple statements over expressions whose correctness depends on
  sequencing or implicit conversions.
- Isolate POSIX and Win32 code behind named targets or small platform modules.
  Keep feature-test macros effective before system headers and consistent
  across ABI-sharing translation units.
- Declare endian, width, file-size, and runtime assumptions. Test every claimed
  compiler/platform combination or call it unverified.

Enforcement: braces analyzer, compiler switch/fallthrough/comma warnings,
target-scoped profile definitions, and support-matrix review.

## Exceptions and suppressions

Use the narrowest supported form and put the represented invariant beside it:

```c
fprintf(stderr, "fatal: %s\n", path); // NOLINT(cert-err33-c): best effort;
                                      // primary failure already selected.
```

For compiler false positives, prefer a target-scoped flag adjustment or a
small adapter. If a pragma is unavoidable, name the exact diagnostic, bound it
to the smallest region, restore the state immediately, and include a reason
and tracking identifier when practical. `NOLINT`, wildcard `NOLINT`, file-wide
suppressions, and global warning disables are prohibited.

Enforcement: direct positive/negative ignored-result fixtures and review.

## Prohibited standards-pass behavior

Agents must not:

- rewrite code merely to make a warning disappear;
- cast return values to `void` mechanically;
- split one operation into several without a behavioral reason;
- add null checks for states excluded by the active contract;
- remove feature-test macros while retaining dependent APIs unless the target
  demonstrably supplies the equivalent contract;
- change strict C99 to a GNU or newer-language dialect;
- disable a warning globally to solve one local case;
- add broad suppressions;
- treat formatter output as inherently preferable;
- refactor unrelated code during a standards correction;
- claim ISO, POSIX, CERT, MISRA, CWE, or other compliance from tool names;
- accept a skipped hard gate; or
- weaken a passing compiler/platform gate without evidence and explicit
  approval.

Enforcement: review protocol and adversarial regression coverage.
