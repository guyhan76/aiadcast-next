# Generation storage incident — 2026-10-24

Observed live log: job `66422340-91c1-4065-a65e-6d5fa8db64ff`, 13:36:01.865 UTC, `persist-image` / `STORAGE_LIMIT`. The screenshot is a 9:16 request; it is not evidence of a controlled 1:1 or single-photo test.

The cloud storage implementation raises this error for invalid/over-40,000,000-byte buffers or tracked account/global capacity. The production image adapter validates each returned PNG at no more than 16,000,000 bytes before storage; `storeAsset` uploads raw bytes, not base64. Therefore this valid adapter result points to the tracked 100,000,000-byte account or 900,000,000-byte app quota, not evidence of a Supabase physical quota, invalid model, transport timeout, or the separate 20-project save limit. Administrator accounts share the same storage limits.

The registry includes immutable original/result images and project JSON. Project v1 embeds base64 image data, so JSON can duplicate image content with representation overhead (roughly 4/3 for base64). This is real additional stored content, not duplicate rows for the same path: content-addressed image paths are reused. Project saves use new version paths and remove the prior version asynchronously; unsuccessful cleanup and unknown upload outcomes can leave tracked reservations. There is no completion/time field in storage_objects to prove which entries are stale. A JSON not referenced by a current project is not automatically safe to delete.

## Local prevention

After validation and existing-request deduplication, before original uploads, credit reservation or supplier dispatch, check the missing original bytes plus the adapter's maximum result size (16 MB, or 32 MB for two planar artifacts). A known shortage produces `STORAGE_CAPACITY_UNAVAILABLE`; the UI states that generation did not start and preserves inputs. Existing uncertain requests retain their identity and supplier hold.

This is a conservative admission check, **not an atomic output reservation**. It can reject a request whose eventual small output would fit. Concurrent project/user writes may still consume capacity after admission. The existing storage check remains authoritative; a simulated post-admission capacity race still becomes uncertain, retains the supplier hold, and never automatically redispatches. An atomic durable reservation needs a separately designed consumption/reconciliation lifecycle; this patch does not introduce a schema or unsafe reservation expiry.

## Recovery and next evidence

`docs/read-only-storage-133601.sql` returns five aggregate rows, identifying the job owner internally without exposing their identity. It is read-only and has not run against production. Amounts are decimal bytes/MB and include reservations; they are not provider spend or physical bucket inventory. A matching owner count other than one must not be treated as valid account usage.

This failure occurs before generation metadata (including usage/cost) is committed. The current code does not durably retain the failed result buffer for later retrieval. No safe existing recovery endpoint is established for this job; do not request a second generation, reset it, or release its financial hold. Reconciliation of actual supplier cost and proof of an existing blob would be necessary before any operational recovery.

First obtain aggregate capacity evidence. If cleanup is considered later, reconcile referenced artifacts, originals, project versions and physical bucket state under explicit approval; never delete based only on an unreferenced JSON count. Raising limits is a separate user decision and is not part of this patch.

## Validation

Local PostgreSQL-compatible HTTP/storage/provider simulations: 11/11, including member/admin preflight, global/account totals, original deduplication, planar size, 9:16 post-admission quota failure, uncertain replay/restart, timeout/body/missing-usage and lost delivery response.
Built-browser checks: 8/8, English/Korean and desktop/mobile, clear preflight failure, no uncertain local request left, inputs/photos retained, existing uncertain requests never redispatched.
Type/build, cloud generated-source parity and isolation checks passed. No actual provider, physical Android, production SQL, push or deployment performed.
