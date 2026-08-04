# Published-library overlay

Read this overlay before publishing a package whose public surface includes
Effect, Schema, services, or layers. The
[enforcement map](../enforcement.md) owns mandatory wording.

## Public compatibility

Treat serialized tags, persisted events, generated API discriminants, and
published Schema identifiers as protocol identifiers with an explicit
compatibility policy. A private `Data.TaggedError` name is not automatically a
permanent wire commitment. Document whether Effect and platform packages are
peer dependencies or implementation dependencies and test the supported
version range rather than only the newest installation.

## Runtime neutrality

A library exports Effects, layers, services, and adapters; it does not install
process signal handlers or create a hidden global runtime. Keep Bun APIs behind
an explicitly Bun-specific entrypoint. Portable entrypoints should compile and
run without Bun globals.

If a layer owns a resource, its public type and construction still expose
Scope/lifetime accurately. Do not acquire long-lived resources during module
evaluation.

## Consumer verification

Build declarations and test them from a tiny external consumer using the
package exports rather than source-relative imports. Verify the declared
minimum and current supported dependency versions, ESM resolution, tree-shaken
or side-effect-free imports where promised, and the portable/Bun entrypoint
split. Keep intentionally invalid compatibility fixtures outside the normal
compilation unit.
