# AI usage recommendations — local phase only

## Implemented boundary

`server/recommendations/` is an isolated SQLite-backed prototype. It is not imported by production HTTP handlers, image generation, wallets or the browser. Its default is disabled. The sole supplied adapter returns explicitly labelled `mock-ai` data and arbitrary test micro-USD amounts; these are not provider prices or a live sales policy. Existing rule-based guidance remains labelled as rules.

The service receives a **trusted server-authenticated** `{userId}` context and a server repository dependency `resolveOwnedImage(userId, generationId)`. It rejects a different owner, missing persistent image, unsupported media and image hash mismatch. No route may construct context from body fields. The request allowlist is only generationId, requestId and locale; client role, cost and snapshot are rejected.

The immutable snapshot includes product name, explicit facts, creative directions, confirmed copy, ad language, purpose and format. It excludes arbitrary metadata/contact fields. The cache key binds owner, artifact hash, canonical snapshot hash, recommendation locale and configured mock-model/prompt version. A unique first-slot per owner/generation prevents version/locale/input changes from silently creating more work. Refresh is deliberately unimplemented. Matching artifact/input keys may reuse the same result without another call.

A durable transaction reserves a separate recommendation budget before dispatch. Concurrent requests and restarted service instances reuse the job. Reads never dispatch. Pending or uncertain records retain their reservation; no startup reclaim, timeout retry or automatic paid regeneration exists. Deployment coordination and dead-worker diagnosis are still required before production use.

Validated output is persisted even if usage is missing (`output_ready_usage_pending`). A supplied **trusted read-only evidence resolver**, not a customer request, can reconcile usage. Recorded completion cannot be settled twice. Known billed invalid output is a service expense, not a customer charge. Only the typed adapter proof `NotDispatched` permits a zero-cost release. Unknown errors/storage failures retain the hold and a sanitized error code. Actual cost above reservation is recorded in full and blocks subsequent work when the local budget is exhausted: reservation is not a provider-enforced spend cap.

Output contract: 1–3 supported still-image channels, short usage/reasons with evidence fields, one to six distinct candidate phrases, explicit mock provenance and unverified confidence/search volume. Structure validation cannot prove factual accuracy; real model evaluation, insufficient-evidence handling and claim validation remain necessary. No actionable-target field is emitted yet. No video support is implied.

## Minimal future migration and API (not applied)

The local schema contains `recommendation_jobs`, `recommendation_attempts`, `recommendation_requests`. A production migration should adapt these to the existing PostgreSQL transaction layer with user/generation foreign keys, owner-enforced queries, unique owner/cache and owner/idempotency keys, timestamps, worker lease and bounded retention. Do not run local constructor DDL against production or automatically clear unresolved holds.

Production API proposal: POST /api/generations/:id/recommendations and GET /api/recommendations/:id. Enforce authenticated session, ownership, CSRF/origin/request limits, immutable saved artifact lookup and payload limits. No API is wired in this phase.

Before connecting a real adapter: approve model/pricing and finite test budget; prepare a reduced image with metadata removed; bound tokens/resolution; implement strict real-output validation, factual-evidence review and provider usage reconciliation. Do not log images, prompts or credentials. Store safe status/timing/request identifiers only. Existing private images may contain contact data; additional preprocessing/data-minimization review is required before external transmission.

Production budget integration must atomically reserve both the recommendation allocation and shared supplier ceiling, without double-counting image spend or consuming existing uncertain image holds. The prototype has only its own persistent test budget and is **not** a production aggregate-budget gate. No production customer wallet is wired. `proposed-included-first` and zero customer charge represent the design only. First recommendation per successful image can be bundled after commercial approval; paid refresh needs a separately approved quote/reserve/capture/refund contract.

Image acceptance, original export, existing credits and stored projects are independent and unchanged. No production migration, environment setting, provider call, deployment, push or APK is part of this phase.

## Local PostgreSQL/API follow-up

`postgres-service.mjs` now runs the same recommendation lifecycle against the existing `PostgresDatabase` transaction abstraction in PGlite tests. `api.mjs` provides a standalone Fetch Request/Response handler with injected session authentication, exact Origin/client-header checks on POST, 2KB streamed body bound, body allowlist and owner-filtered GET. It is disabled by default and **not mounted in the production server**. The app UI remains unchanged.

`migration-draft.sql` is executed only in temporary local tests. It adds a shared cost table keyed once per attempt, with image/recommendation categories, period, initial reservation, remaining hold and actual cost. Category entries are atomic under the existing PostgreSQL advisory transaction lock. Summation uses this shared table once, not shared + category subtotals. The image category is driven by a mock image reservation in tests; existing production image budgets/attempts have **not** been migrated or hooked to this table. Production cutover must account for preexisting image exposure exactly once, preserve all uncertain holds and coordinate both writers before any live recommendation activation.

Expired unresolved jobs retain output and supplier holds. No expiration releases a possibly dispatched request. Verified evidence can reconcile later without another provider call. Conflicting settlement or reservation identifiers are rejected.

Verified environments: PGlite PostgreSQL engine SQL/constraints/transactions using the repository pool adapter; concurrent service instances and commit-response loss simulations. Separate OS process concurrency/restart is verified with the local SQLite implementation. No standalone PostgreSQL server binary is installed here, so independent PostgreSQL backend/process contention, network reconnect/TLS and production session adapter integration are still untested. API tests inject synthetic session validation; they do not create real account sessions.

The two local service implementations share contracts but are separate code paths; changes require regression coverage for both. Mock amounts, mocked image reservations and included-first customer policy are not production pricing or spend authorization. No migration, credential, provider call or production deployment has occurred.

## Existing application integration verified locally

`existing-app-integration.mjs` now binds the route contract to the actual CloudBetaStore session authenticator (including logout/expiry), authenticated per-user schema, existing saved generation records and CloudGenerationService private artifact reader. Tests use the existing cloud backend over loopback with mocked storage and image provider, create a real test session and image job, then exercise recommendations. No production route registration was added; the integration factory remains disabled unless explicitly enabled in tests.

`existing-image-budget.mjs` reserves/settles recommendation exposure directly in the **existing per-account budgets row**. Existing image admission therefore sees recommendation holds without any image code changes. Recommendation category rows are audit records only and are never added to the authority total a second time. Initialization/migration does not copy image attempts, modify old budgets, change allocations, release holds or alter wallets. The current app's allocation/global-cap policy remains the authority; no second independent spending allowance is created. A changed allocation/period fails safely until the existing policy is reconciled, rather than silently overwriting its limit.

Integration tests verify exact old balances and image attempt rows at initialization, recommendation settlement increments once, full backend restart preserves totals/cache/session, another account cannot retrieve or recommend the image, logout and session expiration fail, and stored image bytes remain readable independently. A preexisting uncertain image attempt plus a new uncertain recommendation is charged to the same budget hold total; the actual existing image POST endpoint then rejects insufficient headroom before another mock provider dispatch. This closes the detached-ledger gap for the local mock phase.

Still separately required: production migration/route activation and operational rollback review, real model/output quality validation, bounded real-cost approval, actual PostgreSQL multi-backend contention/TLS testing, deployment and any client UI/API wiring. PGlite is the tested PostgreSQL engine, not a remote production server. No secrets or live account data were used.

## Read-only result UI follow-up (2026-10-25)

The existing authenticated integration now supports GET
`/api/generations/:id/recommendations` to recover a saved recommendation without
knowing the recommendation ID (including a lost original response). It reads
only owner-scoped persisted records, returns null when absent, and never calls
the adapter. Responses identify the generation, artifact hash, immutable
snapshot hash and stored locale. Both SQLite and PostgreSQL implementations
support this read contract. Error HTTP responses now follow the app's
`error.code` contract so session expiry remains handled by the existing client;
a successful uncertain job keeps its state and error evidence.

`RecommendationGuide` is mounted at the compatible image-result boundary but
returns null by default, without effects or network requests. Only a local
Vite test fixture explicitly enables the mock review. The component performs
GET only on an explicit saved-result check, coalesces clicks, bounds read time,
and hides late responses after logout/account or artifact/language changes.
It has no provider-create, paid-refresh, wallet, export or acceptance actions.
The current rules guide remains unchanged and accurately labelled. The mock
panel explicitly says it is not real AI analysis; it does not claim measured
search volume or performance. Keyword validation permits 1–6 distinct phrases
rather than requiring six and encouraging filler.

Tests exercise actual existing session/private-image/budget integration with
PGlite, including preserved uncertain image holds; local browser fixtures cover
read-only UI, both languages, narrow widths, mismatched artifacts, timeout and
logout. These do not establish semantic model quality, physical Android
behavior or real PostgreSQL multi-backend contention. Stored image data and
project JSON are not rewritten. No production route, constructor migration,
feature switch, model, price or customer credit policy is activated.

Remaining approval boundary: review/apply production migration and route wiring,
select/approve the real model and finite test spend, implement provider output
validation and privacy-minimized image transport, and run real PostgreSQL and
physical-device tests. A real result provenance contract and the included-first
commercial policy must be approved before enabling a consumer AI recommendation
action. Current output contracts deliberately accept only `mock-ai`.

Final local checks for this follow-up: 29 domain/integration cases, 12 browser
cases, type/build/cloud/isolation passed. Legacy saved requests now retain
product category/description and attributes separately from the creative brief.
No operating database, provider budget, customer wallet or production setting
was modified.

## Local safety closure (2026-10-25)

Both services now require explicit `executionMode: 'local-test'` and reject
`NODE_ENV=production` before database access. These guards intentionally prevent
mock prices/reservations from becoming a live policy even if a feature flag is
accidentally enabled. A real adapter and approved live policy remain absent.

PostgreSQL initialization performs schema probes only, never DDL. Temporary tests
explicitly call `local-test-migration.mjs`; the draft migration is idempotent and
adds only recommendation tables/expiry metadata. Production migration execution
and rollback review remain separate approvals. Rollback should disable routes
and preserve audit records, outputs and unresolved holds, not drop tables or
reset existing budgets.

New reservations obtain the account's current budget period and allocation at
transaction time. Settlement uses the reservation's recorded period, even after
a month change or restart. Existing image holds and prior-month exposure are
preserved; recommendation audit rows are not counted a second time. Repeated
settlements and reservation IDs remain idempotent; expiration never permits an
automatic retry of an uncertain provider request.

Pure input/output limit contracts validate explicit measured token counts, one
image's byte/dimension limits, and output tokens. They do not tokenize, resize,
invoke a provider or prove an image-token/USD upper bound. The limits are local
contract ceilings, not deployed model settings or a promised spend cap.

New tests cover initialization without implicit migration, default/production
rejection, measurement bounds, concurrent monthly reservations, late settlement,
restart, expiry and retained old holds. PGlite transactions are tested; actual
PostgreSQL multi-backend contention and real provider billing remain unverified.
Customer credit handling is unchanged and remains outside this mock subsystem.

Final safety-closure validation: 32 recommendation domain/integration tests and
12 desktop/mobile browser tests passed; TypeScript (as part of build), build,
cloud-variant consistency and isolation checks passed. No tests were skipped in
these runs. Real PostgreSQL, physical Android and real model calls were not run.
