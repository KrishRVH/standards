# Python Standards Tester

One typed package with example and Hypothesis property tests exercises the
Python standards profile, including its copied mise wiring and drift-checked
Dagger wrapper. The fixture covers the default strict static analysis, branch
coverage, wheel and source distribution builds, and the mutmut mutation sweep
gated by the committed `.mutmut-floor` ratchet. Contract tests drive the
token-aware suppression policy and isolated mutation-report validator through
their real process boundaries. Cases cover malformed reports, module
shadowing, unknown Ruff codes, a round-tripped recurring-decimal floor, and an
Interrogate summary that rounds 1,999 documented objects out of 2,000 to
100 percent while still missing one. Pinned Ruff and Bandit probes prove that
only mutmut's generated root tree is excluded while nested `mutants/` source
directories remain checked. Process tests prove that cold and incremental
mutation runs share one fail-fast transaction lock, clean it up on soft
termination only after the complete child process group exits, escalate past a
TERM-resistant descendant before cleanup, retain stale hard-kill evidence, and
propagate every gate status. The suppression fixture also proves that the
default scan includes root Python modules while pruning ignored generated and
dependency trees.

Real Python projects can run `mise run py:deep` when they want the heavier
analyzer profile.
