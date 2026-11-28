# Generation transport diagnosis — 2026-10-24

Baseline: e5ef24e0b2e80338876ce345571b212bd0f7183f. Production job cause remains unknown. Parent inspected the new attempt screenshots and reported running → uncertain around 20:39–20:40 KST. Worker diagnosis is code/server-fixture based, not independent screenshot or physical-device inspection.

## Evidence

- `src/GenerationPanel.tsx`: POST aborts at 30s; polling reads have 15s deadlines and stop at 60 reads/180s/three failures. These paths preserve request identity; polling exhaustion alone does not set the server job to uncertain.
- `server/openai-image-adapter.mjs`: provider timeout defaults to 180s, including response body consumption. No environment timeout override is passed in `server/cloud/beta.mjs`. HTTP rejection, invalid response/image and missing usage have distinct internal errors, but unknown failures are collapsed by dispatch.
- `server/generation-service.mjs` dispatch and generated cloud base: non-definitive failures become `PROVIDER_UNCERTAIN`; provider-cost reservation is retained. Missing usage can occur after artifact/metadata persistence, yet job serialization exposes image bytes only for ready/accepted. Thus no visible image does not establish no generated image or no provider cost.
- `server/cloud/storage.mjs`: each storage request has a 30s timeout; upload/quota/metadata failures after provider success can also become uncertain. Do not infer any of these happened from elapsed screenshot minutes.
- `server/cloud/admin-overview.mjs`: admin overview is a read-only transaction and does not initialize/recover per-user services. It exposes job ID/time/state/error/cost but not artifact presence or distinct failure stage. Job/history routes can initialize a service and reconcile interrupted attempts; they are not pure database inspection.

## Local evidence (no provider/network services)

Real local HTTP server + PGlite PostgreSQL transactions + production image adapter with injected fetch and private storage fixtures:

1. Provider response timeout: running → uncertain; restart and duplicate request retain one provider dispatch.
2. Response body timeout: same state/safety behavior.
3. Valid image with missing usage: artifact persisted but hidden; uncertain and cost hold survive restart; no redispatch.
4. Client disconnect during source upload: server continues to ready; request identity recovers the same result without duplicate dispatch.

Injected provider deadlines are 1000ms to avoid costly waits; this tests semantics, not real provider timing. Four new tests pass. Existing targeted unknown-provider, result-upload-failure, and lost-delivery-commit-response (member/admin) tests also pass: eight distinct cases in total. No product code changed and no live operations performed.

## Minimal next evidence and recovery

Request newest admin card around 20:39 KST: timestamp, error, estimated cost. If generic uncertain persists, an authorized read-only database inspection should return only presence/status facts for that exact job: artifact hash present?, generation asset record present?, metadata usage/cost present?, attempt status and reserved/spent amount, billing status. Do not expose photos, prompts, keys or raw provider payloads. Do not reset attempts or refund an unknown supplier outcome.

- Running: observe existing work; no additional provider request.
- Ready with lost client response: recover the same artifact, no new generation.
- Uncertain with stored artifact and missing usage: accounting reconciliation is required before delivery/settlement; do not invent zero cost.
- Uncertain with no stored artifact: cannot distinguish provider timeout from upload loss from current error alone. Provider response/request evidence or sanitized stage diagnostics are needed before any retry policy change.

A prospective allowlisted diagnostic stage/code could be stored separately from the existing public error/state, without prompts/tokens or billing changes. This would aid future failures, not reconstruct the lost cause for existing jobs. Not implemented without production evidence; no timeout increase or speculative retry fix.

## Follow-up after admin card supplied

Parent directly inspected latest card: 2026-10-24 20:39:10 KST, uncertain, 9:16, gpt-image-2.5-sunburst, cost em dash, PROVIDER_UNCERTAIN. This is not evidence of invalid model or exhausted quota. Do not request that same card again.

Tool discovery found no Supabase connector, authorized SQL connection or authenticated diagnostic session. Render's read-only SQL tool supports Render-hosted PostgreSQL, not this Supabase database. No credentials were inspected to fabricate another connection. No operational query has executed; access is unavailable, not an auto-review denial.

Smallest next action: in the existing Supabase project's SQL Editor, run `docs/read-only-generation-203910.sql` and share only the nonempty diagnostic XML row. It uses a read-only transaction and exact one-second timestamp filter, with account-scoped storage reservation checks. It returns job/status/presence/amount fields only, no email, prompt, image, token or raw metadata. The SQL has not been executed against production. A storage record is not proof of blob availability. If no match, report no match rather than widening to a database dump.

Local prospective improvement: structured `generation_failure` log includes only validated job ID, fixed stage/code and HTTP status. Stages separate reserve/provider/image persistence/metadata persistence/usage/settlement/ready. Provider timeout, network, body timeout/network, HTTP rejection, invalid JSON/image and missing usage can be distinguished. Raw exception strings/stacks and provider bodies are never logged. Unknown errors keep UNCLASSIFIED plus the stage. Logging failures cannot change recovery. No database schema, state, charge or retry behavior changed, and no automatic retry was added. This cannot reconstruct earlier discarded exception details; it is not deployed.

Verification: 9 focused HTTP/PostgreSQL/diagnostic tests pass; 4 generation/diagnostic unit tests pass (one diagnostic test overlaps). Type/build, generated-cloud parity and isolation pass. Physical device and actual provider not tested. No push/deploy/operational mutation.

## Exact incident SQL evidence and next action

User supplied job 8df48732-70af-4d58-abba-70742567d78a, created 2026-10-24T11:39:10.913Z: error PROVIDER_UNCERTAIN, billing released, artifact hash/record false, usage/cost false, storage reservation false, attempt uncertain, held 500000 microUSD, actual null.

This rules out the previously reproduced fully persisted result with merely missing usage for this record. It does not distinguish timeout/network, invalid provider response/image, pre-upload quota failure, upload failure, or database failure before metadata persistence. The storage reservation query is keyed by artifact_hash; with a null hash its false result cannot rule out an orphan uploaded object/reservation. No images or raw metadata were inspected.

Ordering: beginAttempt reserves 500000 and marks running; dispatch catch marks the attempt uncertain, releases the customer's reservation (admin remains exempt), then records PROVIDER_UNCERTAIN. releaseInside never decrements supplier budget holds. beginAttempt admission checks spent + held + new reservation <= limit. Therefore this hold continues to reduce available provider budget; it is not a confirmed bill and must not be manually removed. A local ledger test proves another attempt is rejected under a 500000 limit while the uncertain hold remains.

The adapter sends reference creative work to /v1/images/edits, otherwise /v1/images/generations, with the configured image model. No actual provider response exists to establish endpoint/model incompatibility. Definitive 400/401/403/404/413/422/429 normally take known-failure paths, whereas 5xx remain uncertain. A concrete cleanup bug was found and fixed locally: response.body.cancel() rejection could hide a received HTTP error, causing generic uncertainty. Cleanup failure now preserves the original HTTP classification; eight HTTP statuses are regression tested. This is not proven to be the incident cause.

Diagnostic logs now include bounded elapsedMs/timeoutMs, fixed endpoint edits|generations, response header status (including 200 parse failures), and only req_-prefixed bounded provider request IDs. No request IDs are fabricated when response headers never arrived. Invalid header content, raw body, prompt and errors remain excluded. This supplements the existing allowlisted failure stages; it cannot recover old discarded exceptions. No new retry or timeout policy.

Next bounded operational step requires separate approval: deploy only reviewed diagnostic/classification changes, then capture the sanitized generation_failure line from an explicitly authorized single test with an agreed provider-cost limit. Do not repeat the same uncertain request, release its hold, or use another input as an unapproved paid retry. Alternatively, an operator may inspect existing provider-side logs for the recorded incident time if already available; no new call is needed. No further repetition of the already supplied admin card or SQL is useful for the erased failure class.
