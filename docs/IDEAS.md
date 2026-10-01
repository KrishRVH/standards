# Ideas

Catalog-wide proposals that are worth doing but not yet worth their churn. Each
entry states the problem, the proposal, and its tradeoff. Delete an entry when
it lands or is rejected; git keeps the history.

## Profile docs that survive copying

**Problem.** A profile's `AGENTS.md` is a fragment merged into a project's root
agent guide, but it links to the profile's `README.md`, for example the TS
upgrade workflow and the Rust and Python mutation-lock recovery. After the
merge, those links resolve to the adopter's own README, so an agent in the
adopting repository cannot reach the operational guidance and nothing fails to
say so. Python, Rust, Shell, Swift, TS, Go, and C# carry such links.

**Proposal.** Move the operational sections each `AGENTS.md` links to into a
copied `docs/<lang>-standards.md` per profile, point the links there, and keep
`README.md` as the catalog's adoption page. TS already ships its Effect guides
under `docs/effect/`.

**For.** Links keep working after copying; README becomes purely
catalog-facing, so adopters never weigh copying it over their own.

**Against.** About seven profiles change at once: README splits, new mirror
entries, re-pointed links, and adjusted documentation tests. Each profile then
maintains two documents with a boundary between adoption and operation, and
adopters carry one more file.

**Alternatives.** Link to the catalog on GitHub, which works anywhere but needs
network and shows the catalog's latest version rather than the copied one; or
inline the must-know facts into each `AGENTS.md`, which costs context on every
turn.
