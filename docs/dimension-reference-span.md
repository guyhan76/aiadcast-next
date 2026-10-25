# Dimension reference span — local preparation

Base: c88099a (production diagnostic UI); recommendation e3b5900 is excluded.
Parent directly compared the user images: the generated 266mm arrow covered a
short segment beside a hinge, while the designated correct reference covered
the full long edge from its upper endpoint to the hinge-adjacent endpoint. This
worker could not download the Library pixels and relies on that explicitly
reported visual comparison, not OCR geometry or a physical measurement claim.

Existing transport is retained: the primary image plus up to nine additional
images reach the image-edits multipart request in order. Client source hashes,
roles and references survive request normalization; server checks count, bytes,
hashes and the 10MB combined input limit. No new photo analysis call is added.

The server now derives a prompt-only span contract for AI main/inset dimensions:
input values/units are numeric authority; unambiguous same-product reference
annotations establish component, both endpoints, entire extent and perspective.
Design-only references cannot establish measurement geometry. Main/inset placement
remains explicit. Generic axis names must not override clearly annotated reference
intervals. No laptop-specific interpretation or forced body-depth mapping is used.

Conflicting values (after unit conversion), conflicting endpoints, hidden edges
or ambiguity must not be resolved with a guessed short arrow or changed number.
The prompt explicitly prioritizes omission of an unresolved annotation for human
review over the older instruction to draw every axis. Existing values/axes/
completeness acceptance review remains required. This is NOT a code-based visual
conflict detector, automatic validation, coordinate repair or factual guarantee.
A model may still fail to follow it; omitted or incorrect arrows must not be
approved as complete. No automatic retry is added.

Requests, input hashes, persisted JSON, units and old results are unchanged.
The derived contract changes only the provider prompt for future AI dimension
requests. No-dimension and legacy coordinate-overlay paths are unchanged.
Same-job retries retain prior idempotency; edited inputs use existing new-request
and review-invalidation behavior. No UI text is added.

Automatic endpoint transfer is not safely achievable from current scalar
measurements and image bytes alone. It needs independently verified visual
landmarks/coordinate evidence and an occlusion/perspective policy. Adding such
analysis or a new editing flow is outside this local prompt-contract change.

There is no extra API request, model, reservation or credit-policy change.
The longer prompt can affect actual token cost when future generation is run;
no zero-cost or exact-price claim is made. Actual image-quality verification
requires separate approval for a bounded paid generation, specified references
and manual full-span review. No such call, push, deploy or APK was performed.

Validation: 40 domain cases passed, including all-ten-image byte/order transport,
ko/en numeric authority, main/inset, hidden dimensions, edited-input hashes,
idempotent recovery/review and unit conversion. Browser initial run: 20 passed,
two recovery tests failed because their summary click raced automatic expansion.
The test now asserts automatic expansion instead of toggling it; both affected
PC/mobile cases passed on targeted rerun. Final coverage: 22 browser cases passing
across those runs, without a second full suite. No product UI/recovery logic was
changed. Type/build/cloud/isolation and diff checks passed. All generation calls
were injected mocks; no real quality proof or extra analysis request occurred.
