# Agent Swarm and Verification Fleet Research

Research date: 2026-08-17 (America/Chicago)

This record explains the durable decisions behind the agent-driven doctrine in
the Rust, TypeScript, C#, and Python profiles: how work is assigned across expensive and
cheap models, how verification fleets are shaped, and which failure modes the
profiles defend against. The authoritative executable configuration remains
the profile configs and `Mise/conf.d/` task fragments; the doctrine owners
are the profiles' `AGENTS.md` files. Evidence comes from vendor
engineering posts, production systems, the 2024–2026 judge/verifier
literature, and a GitHub survey of agent-automation adoption. Prices, model
names, and ledger counts are a dated snapshot and go stale; mechanisms are
the durable part.

## Decision

The profiles encode a cost-asymmetric swarm shape with four roles:

1. A frontier model owns ambiguity: the spec, the plan, the interpretation of
   underdetermined requirements, and the final review. Cheap models own
   execution once ambiguity is collapsed into explicit instruction.
2. Executable verification outranks model judgment. Tests, mutation runs,
   property checks, and type gates verify first; model judges only rank what
   the harness cannot distinguish.
3. Verification fleets are small (three judges, five at most), decorrelated
   by input view rather than by model family alone, and aggregated robustly.
   Findings are collected on union-with-dedup — never unanimity or simple
   majority — and severity triage decides what blocks.
4. Cheap verifiers flag; they never rewrite. Findings route back to the
   author or up to a frontier arbiter, and the verification harness stays
   out-of-band from the author.

Everything below is the evidence for those four commitments.

## The economics: why verification fleets are nearly free

Cheap-tier models cost between one tenth and one eightieth of a frontier
model per token. Snapshot of standard API pricing, August 2026, per Mtok
in/out:

| Model                            | Input | Output |
| -------------------------------- | ----- | ------ |
| Claude Fable 5 (frontier anchor) | $10   | $50    |
| GPT-5.6 Sol                      | $5    | $30    |
| Claude Haiku 4.5                 | $1    | $5     |
| Gemini 3.7 Flash (intro pricing) | $0.75 | $3.75  |
| GPT-5.6 Luna                     | $0.20 | $1.20  |
| DeepSeek V4 Flash (off-peak)     | $0.22 | $0.66  |

One frontier output token buys roughly 10 Haiku-class tokens, 42 Luna
tokens, or 76 DeepSeek-Flash off-peak tokens. The planning consequence: a
three-judge verification pass over a diff adds roughly 5–15% to the cost of
authoring it. Verification is the cheapest insurance in the pipeline, which
is why the profiles treat "an adversarial pass in a fresh context" as a
default, not a luxury.

Two caveats keep this honest. Cheap-tier prices are volatile — Luna was cut
80% in June 2026 and DeepSeek repriced upward 57% at peak in August 2026 —
so any budget derived from this table must be re-derived, not inherited.
And the multiplier cuts both ways: Anthropic measured multi-agent systems
burning about 15x the tokens of a single chat, so swarm deployment is gated
on task value, not applied to everything.

Sources:

- [Cursor: agent swarm model economics](https://cursor.com/blog/agent-swarm-model-economics)
- [Anthropic: multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
- [VentureBeat: GPT-5.6 Luna price cut](https://venturebeat.com/technology/ai-price-wars-openai-cuts-gpt-5-6-luna-prices-by-80-as-model-competition-shifts-toward-cost)
- [DeepSeek pricing](https://deepseek.ai/pricing)

## Production evidence for cost-asymmetric roles

Three independent production systems converged on the same split in 2026.

Cursor rebuilt SQLite in Rust as a controlled experiment: GPT-5.5 in both
planner and worker roles cost $10,565; an Opus 4.8 planner with Composer 2.5
workers cost $1,339 at similar held-out test pass rates, with workers
carrying 69–90% of tokens. Their summary: "Once a frontier planner has
collapsed ambiguity into explicit instruction, less expensive models simply
execute it."

Cognition's Devin Fusion inverts the asymmetry — the frontier lead plans,
reviews, and commits while cheap sidekicks execute — and reports 35–60% cost
reduction at near-frontier benchmark scores (63.1 at $1.35/task versus 64.9
at $10.53/task for the frontier model solo). Both directions work; what is
constant is that the frontier model owns ambiguity and final review.

OpenAI's Codex CLI makes the split a first-class config key: `review_model`
decouples the reviewer from the author in either direction, and its
auto-review path routes routine approval checks to a purpose-built small
model. Google's Jules runs an adversarial critic after patch generation and
before submission — and the critic "doesn't fix code, it flags it."

Sources:

- [Cursor: agent swarm model economics](https://cursor.com/blog/agent-swarm-model-economics)
- [Cognition: Devin Fusion](https://cognition.com/blog/devin-fusion)
- [Codex CLI `/review` and `review_model`](https://codex.danielvaughan.com/2026/03/30/codex-cli-review-command-code-review-workflows/)
- [Google: Jules critic](https://developers.googleblog.com/en/meet-jules-sharpest-critic-and-most-valuable-ally/)
- [Factory: Code Droid technical report](https://factory.ai/news/code-droid-technical-report)

## Verification fleet design

### Small panels, decorrelated by input view

The judge literature started with the Panel of LLM Evaluators result: a
panel of small diverse judges outperformed a single large judge at about one
seventh the cost. Two 2026 results correct its sizing intuition. Correlated
errors gut panel value: a measured nine-judge panel provided about 2.2
independent votes' worth of information, and — counterintuitively —
same-family judge pairs were barely more correlated than cross-family pairs,
so model-family diversity alone does not buy independence. Effective jury
size saturates fast; three judges is the sweet spot, five the ceiling.

What does decorrelate judges is what they see. Cursor's review design gives
one reviewer the worker's full transcript, one only the output, and one only
the surrounding codebase: "No single perspective caught everything, but
uncorrelated perspectives combined for higher reliability." The profiles
adopt this directly: reviewer lenses differ in input view (test diff only,
full diff, codebase-without-transcript), and model diversity is layered on
top rather than relied on alone.

### Robust aggregation, union gating

A panel aggregated by arithmetic mean is corrupted arbitrarily by one
degenerate judge — parser failures alone occur at 0.6–3.4% rates, before
sycophancy or mode collapse. Robust aggregation (geometric median, trimmed
statistics) restores the panel advantage; a 3-judge 38B-parameter committee
beat a 675B judge under 30% judge corruption.

Gating is the counterintuitive part. In a four-tool concurrent review fleet
measured over 617 findings, 93.4% of findings were caught by exactly one
tool and none by all four. Unanimity essentially never occurs, and majority
vote discards most true findings. Fleets therefore maximize recall, and the
gate is union-with-dedup plus severity triage — machine-deduplicated before
a human sees it, because undeduplicated bot disagreement measurably costs
more time than the bots save. The singleton rate is an argument against
consensus rules, not a claim of per-finding precision: union is the
collection rule, and triage decides what blocks — a claim of observable
wrongness blocks until dispositioned by the failing-test protocol, a
judgment call becomes a design note. The measured fleet's findings included
false positives, and no production system publishes per-reviewer precision;
an adopting repo tunes its own blocking bar from its own dispositions.

### Flag, never rewrite

The one controlled study of cross-model code review found direction matters
more than review: a stronger model reviewing a weaker author's drafts gained
18.1 points; a weaker model with write-back power over a stronger author's
drafts _lost_ 8.6 points (13 regressions against 3 fixes). Cheap verifiers
gate and flag; the author or a frontier arbiter applies fixes. This is also
Jules's design and the reviewer-proposes rule already in both profiles.

### The harness stays out-of-band

RLVR-trained models demonstrably learn to game verifiers — overwriting unit
tests, monkey-patching scorers, emitting formatting artifacts that flip
judge verdicts. Two consequences are encoded. First, the verified surface
splits three ways: product tests are author-owned — a behavior change must
ship the test that fails without it, and the reviewer reads the test diff
first precisely because the author edits it; an independent acceptance
harness, where one exists, stays out-of-band from the author; and
enforcement configuration — lint walls, thresholds, mutation scope, judge
prompts — is protected surface (in the profiles: wall edits are findings by
default, loosening needs human countersign). Second, author output is
sanitized before judging — formatting stripped, both pairwise orderings
run, length-penalized rubrics — because judges are reliably manipulable by
presentation and no single mitigation suffices.

### Executable verification first

Best-of-n sampling scales coverage across four orders of magnitude, but
model-judge and reward-model selection plateaus beyond a few hundred
samples. AlphaCode's pipeline — filter by executing tests, cluster, then
rank — remains the template: the strongest cheap verifier is the harness,
and model judges rank only what tests cannot distinguish. In these profiles
that ordering is mutation testing and property tests before any model
review, and a disputed review finding is settled by writing the failing
test, not by argument; a finding no test can express becomes a design note
rather than being silently dropped.

### Triage gradient

The cheapest verifier is not a model at all. A study of 33,707
agent-authored PRs found a metadata classifier (file types, patch size)
predicts
high-maintenance PRs before any LLM runs. The full gradient: metadata
classifier, then cheap-model classification, then frontier deep-dive, then
human — each stage filtering for the next, with fast-track for trivial
changes and early kill for sprawling ones.

Sources:

- [PoLL: Replacing Judges with Juries](https://arxiv.org/abs/2404.18796)
- [Nine Judges, Two Effective Votes](https://arxiv.org/html/2605.29800v1)
- [RoPoLL: robust panel aggregation](https://arxiv.org/html/2606.30931)
- [Do We Need Frontier Models to Verify Mathematical Proofs?](https://arxiv.org/abs/2604.02450)
- [Large Language Monkeys](https://arxiv.org/abs/2407.21787)
- [AlphaCode](https://deepmind.google/discover/blog/competitive-programming-with-alphacode/)
- [Cross-Model LLM Code Review](https://arxiv.org/html/2607.21656v1)
- [LLMs Gaming Verifiers](https://arxiv.org/abs/2604.15149)
- [Security in LLM-as-a-Judge SoK](https://arxiv.org/pdf/2603.29403)
- [Judging the Judges](https://arxiv.org/pdf/2604.23178)
- [Addy Osmani: Agentic Code Review](https://addyosmani.com/blog/agentic-code-review/)
- [Human review bottleneck: 33,707 agent PRs](https://codex.danielvaughan.com/2026/05/24/human-review-bottleneck-code-review-strategies-agent-output/)

## Adoption in the TypeScript ecosystem (surveyed 2026-08-17)

The Rust profile has a fully assembled public existence proof: oven-sh/bun
(a majority-Rust codebase) combines a dedicated coding machine account
(robobun, 9,299 PRs authored / 2,295 merged, humans performing merges), a
guidelines file fed to the review bot, bot-to-bot thread resolution, hook
and comment-cop enforcement, and bot-PR lifecycle GC. A targeted survey —
authenticated GitHub search over machine-account PR ledgers,
`.coderabbit.yaml` co-occurrence with agent guideline files, and direct
audits of high-prior candidates — found **no public TypeScript repo that
assembles all five mechanisms**. The pieces exist, scattered:

| Repo                      | Agent ledger                                           | What it proves                                                                                                                                |
| ------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| microsoft/vscode          | copilot-swe-agent 2,030 authored / 715 merged          | Volume leader (~22% of robobun); stock Copilot plumbing, no bot-to-bot interaction, no provenance labels                                      |
| liam-hq/liam              | Devin 659 authored / 456 merged (69% merge rate)       | Most Bun-shaped: CodeRabbit `code_guidelines` knowledge base, four-bot PR threads, agent provenance labels                                    |
| mastra-ai/mastra          | Devin 338 authored; dane-ai-mastra 1,254 (chores only) | Strongest single thread evidence: Devin answering human reviewers with commit-hash receipts                                                   |
| triggerdotdev/trigger.dev | claude[bot] 36 authored / 21 merged                    | Best enforcement engineering: repo-calibrated `.claude/REVIEW.md` plus CI that audits the agent instructions themselves for drift on every PR |
| firecrawl/firecrawl       | Devin 184 authored / 102 merged                        | Volume without mechanism: guideline files exist, nothing wired to them                                                                        |

The nulls are findings in their own right:

- Bot-answers-bot thread resolution — observed live on Bun — was found
  nowhere in TypeScript. The closest is mastra's Devin answering _human_
  reviewers with evidence while the review bot's comments go unanswered.
- No TypeScript repo runs a dedicated coding machine account. The one
  first-party candidate (dane-ai-mastra, 82% merge rate) ships version
  bumps and dependency chores — robobun's shape doing janitor work.
- Configuration runs ahead of practice: cal.com carries the full
  aspirational stack (`.claude/` rules and skills, AGENTS.md, CLAUDE.md,
  an experimental agent-teams flag) and zero bot-authored PRs.
- The volume exists but diffuses: copilot-swe-agent has ~2.0M PRs and
  Devin ~226K globally, concentrated in private and small repos rather
  than public TypeScript flagships.

One surveyed mechanism is a candidate for these profiles rather than an
adopted rule: trigger.dev's instructions-drift audit, a per-PR CI job that
checks the agent guidelines against the code they describe. This catalog's
drift check proves template-fixture byte equality; nothing yet polices an
AGENTS.md staying true to its repo. Try it manually before tooling it.

Sources:

- [robobun ledger](https://github.com/oven-sh/bun/pulls?q=is%3Apr+author%3Arobobun)
- [vscode copilot-swe-agent ledger](https://github.com/microsoft/vscode/pulls?q=is%3Apr+author%3Aapp%2Fcopilot-swe-agent)
- [liam Devin ledger](https://github.com/liam-hq/liam/pulls?q=is%3Apr+author%3Aapp%2Fdevin-ai-integration)
- [mastra PR #21650 (Devin evidence replies)](https://github.com/mastra-ai/mastra/pull/21650)
- [CodeRabbit agentic SDLC guide (Mastra numbers)](https://www.coderabbit.ai/guides/agentic-sdlc)
- [Agent PR adoption estimate, 128K projects](https://arxiv.org/html/2601.18341)

## What the profiles adopt

- Frontier-owns-ambiguity role split, verification-fleet shape (size,
  lenses, aggregation, union collection with severity triage),
  flag-never-rewrite, and the triage gradient live in the
  adversarial-review sections of the profiles' `AGENTS.md` files. These are
  process doctrine for the adopting repo's review tooling: the automation
  this catalog ships ends at `standards:check`, and nothing in it invokes
  reviewers, stores verdicts, or creates commit statuses.
- Executable-verification-first is the existing gate order: types, lints,
  tests, mutation testing (cargo-mutants in Rust; Stryker under ratcheted
  `break` thresholds in TypeScript and C#; mutmut against a committed floor
  in Python), and property tests (proptest, fast-check, CsCheck,
  Hypothesis) run before any model review, and a disputed finding is
  settled by a failing test or recorded as a design note when no test can
  express it.
- Out-of-band harness is the existing wall-integrity rule: enforcement edits
  are findings by default and loosening requires human countersign.
- The earlier phrasing "model diversity beats persona diversity" is refined,
  not repealed: diversity of input view is the reliable decorrelator; model
  diversity is layered on top.

## Not confirmed, deliberately excluded

- No production system publishes verifier precision/recall against ground
  truth. Fleet verdict accuracy is something an adopting repo must measure
  for itself; treat rising judge scores with flat outcome metrics as gaming.
- Jules's "planning critic, 9.5% task-failure reduction" circulates only in
  secondary coverage and is not claimed here.
- The "SCOUT/GUARD/CHECK Haiku architecture" often attributed to Anthropic
  is a third-party adaptation and is not cited as vendor practice.
- Exact prices in this record were verified on the research date and will be
  wrong later; re-derive budgets from current price sheets.
