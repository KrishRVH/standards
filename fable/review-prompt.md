# Standards Catalog Review Prompt

You are writing an opinionated critical essay about a multi-language engineering
standards catalog.

## Primary deliverable: an exceptional visual HTML report

Your final and only deliverable is a polished, attractive, self-contained HTML
report named `standards-review.html`.

The quality of the report as a visual artifact is a primary part of the
assignment, not an optional presentation layer. It should feel intentionally
designed: something an experienced engineer would enjoy exploring and would be
comfortable presenting to a team. Aim for the visual quality of a thoughtful
editorial data story or a bespoke engineering intelligence dashboard, not a
generic documentation page with a few colored cards.

Use visual hierarchy, spacing, typography, color, composition, and interaction
to make the analysis easier and more interesting to understand. Build useful,
memorable visuals that reveal relationships in the repository rather than
decorating the prose.

The report must:

- Be one complete HTML document that opens directly in a browser.
- Use embedded CSS, SVG, and JavaScript only.
- Use no external fonts, images, libraries, CDNs, or network resources.
- Be responsive, accessible, keyboard-friendly, and readable without
  JavaScript.
- Support polished light and dark themes.
- Include a deliberate print stylesheet.
- Use semantic HTML and meaningful accessible labels.
- Render well on both a large desktop display and a narrow laptop or tablet.
- Use restrained animation and transitions where they improve orientation.
- Avoid generic dashboard filler, gratuitous gradients, novelty gauges, and
  charts that merely restate prose.
- Make evidence paths and confidence levels easy to inspect without overwhelming
  the main narrative.

The report should include genuinely useful custom visuals built with HTML, CSS,
and inline SVG, including:

- A catalog-wide heatmap.
- A strictness, friction, and coherence landscape.
- A standards architecture map.
- A cross-language consistency matrix.
- Profile scorecards with small visual signatures.
- Profile archetype clusters.
- Visual treatment of productive tensions and outliers.
- Interactive comparison of two selected profiles.

Give the report a coherent visual language. Colors, shapes, badges, and symbols
should have stable meanings throughout. Include legends where needed. Use
progressive disclosure so the first view is inviting while detailed evidence
remains available.

Do not return a Markdown summary followed by HTML. Do not describe what the HTML
would contain. Produce the actual complete HTML report.

## Repository model

The entire repository is attached. Treat it as the sole source of evidence. You
cannot execute tools, install dependencies, or run fixtures. Do not claim that
anything passes or fails at runtime. Analyze what the repository expresses
through its configuration, scripts, documentation, task graph, fixtures, and
structure.

This is a copy-from standards catalog. Canonical consumer templates live in:

- `shared/`
- `Mise/`
- `Dagger/`
- `C/`
- `C#/`
- `C++/`
- `Elixir/`
- `Fortran/`
- `GDScript/`
- `Go/`
- `Haskell/`
- `Kotlin/`
- `Lua/`
- `Markdown/`
- `PHP/`
- `Python/`
- `Rust/`
- `Shell/`
- `SPARK/`
- `TS/`
- `Zig/`

Projects under `testers/` are intended to exercise copied versions of those
standards. Root configuration maintains the standards repository itself.
`standards.manifest.toml` describes profiles and canonical-to-fixture mirrors.
Mise tasks are the developer-facing command surface.

Read `AGENTS.md`, `README.md`, the manifest, root task graph, language READMEs,
canonical configurations, scripts, and representative fixtures before forming
conclusions.

## Governing philosophy

Evaluate the repository against its stated preference for code and workflows
that are:

- Obvious.
- Self-documenting.
- Elegant through directness.
- Easy to grok.
- Self-contained.
- Concise.
- Readily apparent.
- Free of unwarranted ceremony.
- Strict where strictness prevents real defects.
- Ecosystem-idiomatic rather than mechanically uniform.
- Friendly to both human and agentic development.
- Discoverable without tribal knowledge.
- Built from boring, dependable machinery rather than clever local systems.

Do not assume that more rules or more tools indicate a better standard.

## The assignment

This is not a request for a remediation plan.

Do not produce:

- A list of proposed code changes.
- Patch suggestions.
- An implementation backlog.
- “Do X” recommendations.
- Commands maintainers should run.
- A prioritized action plan.
- Replacement configurations.
- Prescriptive rewrites.

Instead, produce an evaluation: an informed, evidence-backed opinion about what
this repository is, what it values, how successfully it expresses those values,
where its internal tensions lie, and how each language standard feels as a piece
of engineering culture.

You may identify weaknesses, contradictions, omissions, awkwardness,
redundancy, or likely friction. Discuss them as analytical observations, not
tasks to perform.

Prefer statements such as:

- “This creates tension between strictness and local clarity.”
- “The policy appears to value uniformity more than this ecosystem normally
  does.”
- “This is unusually strict, but the surrounding task design makes it
  coherent.”
- “The configuration projects confidence that static inspection alone cannot
  fully justify.”
- “This choice is redundant, though the redundancy communicates an intentional
  boundary.”
- “The template feels optimized for agents more than for casual contributors.”

Avoid statements such as:

- “Remove this rule.”
- “Replace this tool.”
- “Add a test.”
- “Change this configuration.”
- “The maintainers should…”

## Per-language analysis

Write a substantive evaluation of every language/profile.

For each one, explore:

1. The philosophy or dialect it appears to enforce.
2. How idiomatic it feels within its ecosystem.
3. What kind of developer it seems designed for.
4. What kinds of mistakes it is most concerned about.
5. What it trusts developers to decide locally.
6. What it refuses to leave open.
7. Whether its strictness feels coherent, excessive, incomplete, or unusually
   well judged.
8. Whether its tools form one comprehensible system or several overlapping
   systems.
9. Whether the fixture meaningfully represents the policy’s ambitions.
10. Whether the documentation and executable configuration tell the same story.
11. Whether the template feels genuinely portable.
12. How well it supports agent navigation and autonomous work.
13. What an experienced ecosystem maintainer might admire.
14. What that maintainer might find strange or irritating.
15. What makes this profile distinctive compared with ordinary community
    templates.

Do not reduce the profile to a checklist. Give it a point of view.

## Areas deserving close interpretation

Pay particular attention to:

- Go’s deliberate rejection of range-over-function iterators and Go 1.27
  generic methods.
- The philosophical meaning of enforcing a restricted language dialect.
- Whether the custom Go analyzer embodies directness or becomes its own local
  language subsystem.
- Markdown standards being applied to the standards repository itself.
- Shell as both a distributed template and part of the repository’s own
  maintenance layer.
- Mise as the single developer-facing command API.
- The relationship between canonical templates, manifest mirrors, and fixtures.
- Dagger’s role and whether it feels central, optional, ceremonial, or
  strategically useful.
- Dependency locking and auditing across ecosystems.
- The separation between ordinary and “deep” analysis.
- Whether root configuration subjects the repository to the values it
  distributes.
- The tension between ecosystem-specific judgment and catalog-wide consistency.
- Whether explicit configuration communicates policy or merely repeats
  defaults.
- Whether the system is primarily designed for humans, agents, or a deliberate
  combination of both.

## Cross-language interpretation

Treat the catalog as one artifact with a personality.

Discuss:

- Its overall engineering worldview.
- Its relationship with complexity.
- Its definition of elegance.
- Its tolerance for ecosystem convention versus house style.
- Its model of trust.
- Its model of correctness.
- Its model of developer experience.
- Its assumptions about agentic development.
- Which profiles most clearly express the repository’s worldview.
- Which profiles feel least integrated with that worldview.
- Where consistency is meaningful.
- Where consistency becomes artificial.
- Where strictness feels protective.
- Where strictness feels aesthetic.
- Where duplication clarifies intent.
- Where duplication feels like residue.
- What the repository appears afraid of.
- What kinds of engineering behavior it encourages.
- What kinds of engineering behavior it discourages.
- Whether the whole catalog feels coherent despite its breadth.

I am especially interested in surprising interpretations and tensions that are
not obvious from reading one configuration file at a time.

## Evidence and epistemic discipline

Every material claim must cite concrete repository evidence using file paths
and, where practical, line numbers or configuration keys.

Label important observations as one of:

- Statically evident.
- Strong inference.
- Tentative interpretation.
- Runtime-dependent.

Do not fabricate command output or infer successful execution merely because a
fixture exists.

When runtime behavior cannot be known, explain how that uncertainty affects
your interpretation. Do not turn the uncertainty into a proposed verification
plan.

## Evaluative dimensions

Score each profile from 1–10 on:

- Ecosystem idiom.
- Coherence.
- Clarity.
- Defect-prevention posture.
- Agent legibility.
- Human approachability.
- Portability.
- Maintenance burden.
- Likely developer friction.
- Confidence supported by static evidence.

For maintenance burden and friction, higher means worse. Make that direction
visually unmistakable.

Scores are interpretive devices, not objective measurements. Use integers,
explain notable scores, and mark low-confidence judgments.

Give each profile a short editorial verdict, such as:

- Disciplined and coherent.
- Strict but humane.
- Opinionated with purpose.
- Unusual but internally consistent.
- Defensive to a fault.
- Layered and somewhat noisy.
- Clear philosophy, uneven execution.
- Ecosystem-native.
- House style over ecosystem style.

## Required report composition

The HTML report must contain all of the following as fully designed sections,
not plain headings followed by undifferentiated text.

### 1. Editorial opening

A strong essay-style introduction explaining what kind of engineering artifact
this is and what worldview it communicates. Give this section a distinctive
editorial treatment that establishes the visual identity of the report.

### 2. Executive portrait

Visually summarize:

- The repository’s defining traits.
- Its strongest convictions.
- Its most interesting tensions.
- Its relationship with humans and agents.
- The profiles that best represent the whole.

### 3. Catalog heatmap

Show profiles as rows and evaluative dimensions as columns. Use clear color
scales, confidence indicators, useful hover or focus details, and an obvious
distinction for dimensions where higher means worse.

### 4. Strictness, friction, and coherence landscape

Create a custom inline-SVG visualization positioning profiles by strictness and
likely friction, with coherence represented through a third visual channel.
Explain meaningful clusters and outliers. Do not imply that maximal strictness
is desirable.

### 5. Standards architecture map

Create a visually clear diagram of the conceptual relationships among:

- Root policy.
- Shared templates.
- Language templates.
- Mise fragments.
- The profile manifest.
- Tester fixtures.
- Root self-application.
- Dagger.

Communicate ownership, copying, verification intent, and feedback paths rather
than merely drawing the directory tree.

### 6. Per-language critical essays

Give every profile its own attractive, visually distinct scorecard and essay
containing:

- Editorial verdict.
- Apparent philosophy.
- Ecosystem fit.
- Strongest qualities.
- Internal tensions.
- Human experience.
- Agent experience.
- Evidence and confidence.
- A short “how this standard feels” paragraph.

Avoid rendering every profile as an identical wall of cards. Maintain a common
system while allowing the content to determine emphasis.

### 7. Cross-language consistency matrix

Compare the presence and character—not merely the existence—of:

- Formatting.
- Linting.
- Type or static analysis.
- Tests.
- Builds.
- Dependency locking.
- Security or audit checks.
- Documentation.
- Deep analysis.
- Fixture representation.

The matrix should be readable, sortable or filterable, and accompanied by
interpretation of notable patterns.

### 8. Productive tensions

Use a strong visual treatment to discuss dualities such as:

- Strictness versus approachability.
- Uniformity versus ecosystem idiom.
- Explicit policy versus redundant configuration.
- Self-containment versus tool count.
- Human readability versus agent determinism.
- Local simplicity versus repository-wide machinery.
- Portable templates versus repository-specific proof.

### 9. Unusual choices worth discussing

Highlight unconventional decisions without automatically praising or
condemning them. Explain what each reveals about the repository.

### 10. Profile archetypes

Group profiles into meaningful editorial categories based on design character,
not language family. Visualize those clusters and their defining qualities.
Possible starting ideas include:

- Minimal native-toolchain profiles.
- Layered defensive profiles.
- Agent-optimized profiles.
- Ecosystem-trusting profiles.
- House-dialect profiles.

Invent better categories when the evidence suggests them.

### 11. Interactive profile comparison

Allow the reader to select two profiles and compare their scores, philosophies,
tooling character, confidence, and editorial verdicts side by side. This must be
useful analysis, not a cosmetic dropdown.

### 12. Closing essay

Conclude with an overall judgment of the catalog as an engineering work:

- Is it coherent?
- Is it elegant?
- Is it too guarded?
- Does it understand the ecosystems it governs?
- Does it make intended workflows discoverable?
- What kind of engineering organization would thrive under these standards?
- What kind would resist them?

End with a memorable thesis, not a task list.

## Interactivity

Include small, useful controls for:

- Switching themes.
- Sorting the profile table.
- Filtering by profile archetype.
- Expanding evidence.
- Showing or hiding low-confidence interpretations.
- Comparing two selected profiles.
- Navigating quickly among profile essays.

Interactivity must enhance analysis and remain accessible by keyboard. The
report’s core content must remain visible and coherent if JavaScript is
disabled.

## Tone

Write like an experienced polyglot engineer and technical critic, not an
auditor generating tickets.

Be candid, specific, curious, and occasionally provocative.

Praise unusual decisions when they are coherent. Criticize impressive-looking
machinery when its value is unclear. Treat the repository as an expression of
engineering taste, not merely a pile of configuration files.

The goal is to leave the reader with sharper opinions, a deeper understanding
of the repository, and an attractive visual report worth revisiting—not a
backlog.
