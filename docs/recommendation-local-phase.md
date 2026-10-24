# AI usage recommendations — local phase only

## Implemented boundary

`server/recommendations/` is an isolated SQLite-backed prototype. It is not imported by production HTTP handlers, image generation, wallets or the browser. Its default is disabled. The sole supplied adapter returns explicitly labelled `mock-ai` data and arbitrary test micro-USD amounts; these are not provider prices or a live sales policy. Existing rule-based guidance remains labelled as rules.

The service receives a **trusted server-authenticated** `{userId}` context and a server repository dependency `resolveOwnedImage(userId, generationId)`. It rejects a different owner, missing persistent image, unsupported media and image hash mismatch. No route may construct context from body fields. The request allowlist is only generationId, requestId and locale; client role, cost and snapshot are rejected.

The immutable snapshot includes product name, explicit facts, creative directions, confirmed copy, ad language, purpose and format. It excludes arbitrary metadata/contact fields. The cache key binds owner, artifact hash, canonical snapshot hash, recommendation locale and configured mock-model/prompt version. A unique first-slot per owner/generation prevents version/locale/input changes from silently creating more work. Refresh is deliberately unimplemented. Matching artifact/input keys may reuse the same result without another call.

A durable transaction reserves a separate recommendation budget before dispatch. Concurrent requests and restarted service instances reuse the job. Reads never dispatch. Pending or uncertain records retain their reservation; no startup reclaim, timeout retry or automatic paid regeneration exists. Deployment coordination and dead-worker diagnosis are still required before production use.

Validated output is persisted even if usage is missing (`output_ready_usage_pending`). A supplied **trusted read-only evidence resolver**, not a customer request, can reconcile usage. Recorded completion cannot be settled twice. Known billed invalid output is a service expense, not a customer charge. Only the typed adapter proof `NotDispatched` permits a zero-cost release. Unknown errors/storage failures retain the hold and a sanitized error code. Actual cost above reservation is recorded in full and blocks subsequent work when the local budget is exhausted: reservation is not a provider-enforced spend cap.

Output contract: 1–3 supported still-image channels, short usage/reasons with evidence fields, six distinct candidate phrases, explicit mock provenance and unverified confidence/search volume. Structure validation cannot prove factual accuracy; real model evaluation, insufficient-evidence handling and claim validation remain necessary. No actionable-target field is emitted yet. No video support is implied.

## Minimal future migration and API (not applied)

The local schema contains `recommendation_jobs`, `recommendation_attempts`, `recommendation_requests`. A production migration should adapt these to the existing PostgreSQL transaction layer with user/generation foreign keys, owner-enforced queries, unique owner/cache and owner/idempotency keys, timestamps, worker lease and bounded retention. Do not run local constructor DDL against production or automatically clear unresolved holds.

Production API proposal: POST /api/generations/:id/recommendations and GET /api/recommendations/:id. Enforce authenticated session, ownership, CSRF/origin/request limits, immutable saved artifact lookup and payload limits. No API is wired in this phase.

Before connecting a real adapter: approve model/pricing and finite test budget; prepare a reduced image with metadata removed; bound tokens/resolution; implement strict real-output validation, factual-evidence review and provider usage reconciliation. Do not log images, prompts or credentials. Store safe status/timing/request identifiers only. Existing private images may contain contact data; additional preprocessing/data-minimization review is required before external transmission.

Production budget integration must atomically reserve both the recommendation allocation and shared supplier ceiling, without double-counting image spend or consuming existing uncertain image holds. The prototype has only its own persistent test budget and is **not** a production aggregate-budget gate. No production customer wallet is wired. `proposed-included-first` and zero customer charge represent the design only. First recommendation per successful image can be bundled after commercial approval; paid refresh needs a separately approved quote/reserve/capture/refund contract.

Image acceptance, original export, existing credits and stored projects are independent and unchanged. No production migration, environment setting, provider call, deployment, push or APK is part of this phase.
