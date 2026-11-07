# Lossless ROI preparation (disabled development candidate)

Base source: 73eb07f72184725bee4951c290709dc9b2438bda. No provider call, production ledger write, deployment or feature enablement belongs to this change.

## Geometry and identity

Small sources retain the existing whole-image padding contract. A larger decoded PNG (at most8,294,400 pixels and10MiB, mask strictly below4,000,000 bytes) uses the bounding rectangle of **all** alpha-zero mask pixels. Exactly one1024x1024,1024x1536 or1536x1024 canvas must contain that selection. Otherwise admission rejects; there is no tiling, resizing or extra request. A clamped integer ROI includes all selected pixels and nearby context. Narrow images can require both ROI extraction and opaque protected padding.

Source/mask hashes, original dimensions, ROI, padding and provider image hashes are bound in a versioned immutable preparation. No external coordinates are accepted. Raw RGBA tuples preserve hidden RGB. Returned dimensions must match the standard canvas. The result is cropped to the same ROI and only alpha-zero pixels are copied back into the unchanged full-size source. The final original-coordinate composite remains in the service. Uploaded bytes are not overwritten.

A private in-process WeakMap identifies precomputed preparations. The adapter synchronously validates their binding, source hashes and nested metadata, then captures detached buffers. It does not asynchronously prepare again between a one-shot dispatch gate and fetch. Serialized/copied preparations are not dispatch capabilities. Provider-output restoration failure is uncertain, never a proven zero-cost failure. This remains geometry preparation, not a replacement for the existing owner/job/request ID/budget/attempt checks.

## User-provided export versus server artifact

`experiments/selective-quality-once/user-provided-source.mjs` is local preparation only. It validates bytes against an explicit owner/Library/file/hash/size preparation approval record and labels provenance `user-provided-export`, with server artifact relation `unverified` and `dispatchAuthorized:false`. Operator approval metadata is **not authentication**. There is no HTTP upload route, storage insertion, synthetic flag, forged successful job, paid runner or new approval represented by this function.

The supplied1080x1920 export differs from the864x1536 server artifact. The parent's PNG verification is external evidence; this executor did not materialize or inspect that real shoe file. Fixtures are synthetic. Never substitute the export hash for an existing job hash. The released/rejected source remains ineligible. Existing synthetic trial ID/attempt and consumed dispatch evidence remain unchanged.

Before a new trial: obtain verified local bytes; confirm user-approved source provenance separately from server lineage; display and approve the original-coordinate mask and movement instruction; freeze the source/mask/ROI/prompt manifest and distinct new trial/attempt; implement/review the narrowly authorized real-source handoff without weakening normal ownership; reread shared cumulative budget and reserve through the same ledger. No trial is currently authorized to dispatch. Previous cost is a reference, not a ceiling. Existing unknown holds stay intact.

## Download preservation

The selective editor saves/downloads the verified result bytes directly. Reopening an edited project now also bypasses complete-ad resampling when no later explicit text/dimension overlay was requested. Download bytes then retain their original dimensions and hash. Explicit later overlay/render operations are separate outputs and do not carry an outside-mask byte-preservation claim. This does not establish the ancestry of a separately supplied exported file.

## Review and checks

Independent reviewer identified async preparation after the dispatch gate and mutable prepared data/post-response zero-cost classification risks. Fixed with synchronous capability validation/detached buffers and uncertain post-response failures. A final source/mask MIME/hash metadata pre-call gap was also fixed and four mutations assert POST0. Final independent review found no further major blocker in the reviewed geometry/adapter path. Regression coverage includes nonzero hidden RGB under alpha0, corners, edge/padding combinations, malformed/oversized masks, mismatched source/plan, request count and user provenance refusal.

Focused final geometry/service suites:47 passed plus1 additional normal-service large-ROI concurrent duplicate integration case passed. Isolated PostgreSQL17 plus connector/one-shot/preflight tests:68 passed,0 skipped; dedicated network-none ephemeral container stopped/removed. Typecheck, web build, cloud consistency and isolation pass. Final fixed-build browser suite:26 passed. Tests cover64x64 and1080x1920 exact-byte save/reopen/re-download, alongside normal owner/cancel/unknown flows. The initial large-fixture assertions exceeded5s (24 pass/2 timeouts); an explicit20s result wait and targeted rerun passed before the final26-case run. This changes test waiting only, not production timeouts. Real Android, real shoe quality and production activation remain untested. Full domain was not rerun in this increment; prior unrelated consumer-campaign baseline failure remains documented in selective-image-edit-development.md.

Memory is bounded by existing input/pixel limits but peak RSS and maximum-concurrency load on the production free instance are not established. Repeated validation/decoding has a cost; activation requires resource profiling. Both selectiveEditingEnabled and selectiveEditReady remain false. No image, credential, evidence archive or environment file is included in source control.

## Corrected shoe target (annotation follow-up)

The parent visually reviewed the user's yellow annotation: the intended targets are the rear smaller shoe and its leg/sock connection, plus a separate upper-right trouser fragment. The prior foreground-large-shoe assumption is superseded. The foreground product is a protection target. Yellow lines are guidance, not the edit mask, particularly where they overlap advertising text.

Library read metadata reports the annotation1079x1947 versus the original1080x1920. This executor received image pointers only and has not visually inspected or registered those pixels. A uniform full-frame scale/coordinate copy is not established. Match unchanged artwork landmarks and original image bounds first, then draw a clean original-coordinate binary mask, preserving text/price/contact/logo and foreground product wherever possible. The unmarked PNG remains the source; the marked JPEG must never be sent as that source.

Added one synthetic disconnected-mask regression: separated rear-leg/upper-edge rectangles fit one1024x1536 ROI; an overlapping text-shaped protected hole, the gap and a foreground-product protection rectangle remain byte-identical. Selected267,500 pixels change; all other full-image pixels remain exact. This test passed and is not the user's mask, positioning approval or shoe-quality evidence. Actual movement direction, mask and new paid trial approval remain pending. No runtime code, provider request or production state changed in this follow-up.
