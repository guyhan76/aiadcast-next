# AI recommendation activation preparation

The customer approved: one included recommendation per advertisement, no additional customer credit deduction, a $0.02 internal reservation per request, and a $0.50 recommendation allowance per account per UTC month within its existing supplier budget. Cached reads are free of new supplier requests. These controls are not a provider billing hard cap. Uncertain usage retains its reservation; no automatic paid retry or hold release.

## Separate operational approvals still required

1. Upload this reviewed source revision to the existing repository. It has not been pushed by this preparation task.
2. Select the existing accounts allowed to use recommendations. The private target is each account's existing `aiadcast_user_<UUID-with-hyphens-removed>` schema, derived by `cloudSchema()`; no production account UUID or schema has been looked up or confirmed here. Do not use a guessed schema, `public`, or `aiadcast_accounts`.
3. For each approved exact schema, review `node scripts/migrate-recommendations.mjs --schema <approved-owner-schema> --plan`. Plan mode does not connect to a database or read credentials.
4. Only after separate target-specific DB/security approval, the operator runs the same command with `--apply --approve-rls-revoke`, using the already configured server DB connection. The explicit migration adds/validates four tables: `recommendation_jobs`, `recommendation_attempts`, `recommendation_requests`, and `recommendation_supplier_costs`. It enables RLS and revokes table privileges from PUBLIC and the existing anon/authenticated/service_role roles on these four tables only. No new public policies, roles, keys, or schema-wide permissions are created. Existing generation, wallet, budget and uncertain-hold records are not updated or removed. Advisory lock wait is limited to 5 seconds and individual statements to 30 seconds. Schema conflict/error rolls back the transaction.
5. Deploy the exact uploaded server revision; do not deploy generic latest. Application startup never runs this migration. Accounts without the required schema remain unavailable for recommendations.
6. After separate activation approval, set the non-secret values in `server/recommendations/approved-config.example.json` on the server, changing ENABLED from false to true only at that approved step. Missing/invalid policy keeps recommendations disabled. The existing injected server OpenAI key is used; no new key or scope is required. Actual key validity/organization/model access has not been verified.
7. Install the matching APK (or use the newly deployed web UI). An explicit AI recommendation click sends one request; opening/reloading/back navigation only reads saved results. Real supplier quality, access and spend validation require a separately approved bounded trial.

## Bounds and limitations

Configured model: `gpt-5.4-mini-2026-03-17`; one finished ad image re-encoded without metadata, at most 1024 px on either edge / 1 MB; snapshot JSON at most 6000 UTF-8 bytes; full serialized text/instructions/schema plus image estimate limited to 8192 estimated input tokens; at most 600 output tokens in the example configuration. Local accounting adds framing allowance and a 25% arithmetic margin, using non-cached input pricing. It is not an exact provider token count or a guaranteed maximum invoice. Independent official tokenizer dictionary download was blocked with HTTP 403; no bypass or external model/count request was made.

Price configuration uses micro-USD per million tokens: input 750000, cached input 75000, output 4500000. Reference: https://developers.openai.com/api/docs/models/gpt-5.4-mini ; local-count limitations: https://developers.openai.com/api/docs/guides/token-counting . Review provider prices/access again before enabling.

Rollback: disable AIADCAST_RECOMMENDATIONS_ENABLED. Keep all recommendation tables, outputs, supplier accounting and unresolved holds intact. Do not DROP tables or reset balances. Already successful images remain independently available for export.
