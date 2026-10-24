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
