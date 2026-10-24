# Unconfirmed generation and input form — local investigation

Baseline: `ca61859682c288403fd2236323a86f5e7aac873f`, confirmed remote and Render Live `dep-dbe1521srm7s73da4dk0` (2026-10-24 02:06:53 UTC). APK 0.2.59 is not assumed to be an old deployment.

## Verified defects

- A completed `markReady` commit whose response is lost enters the generation dispatch catch. The former guard protected captured v2 results only. Legacy and administrator previews can be durable `ready` results without `captured`, so the catch released them and labeled them uncertain, hiding their image. The guard now preserves a durable artifact in ready/accepted state as well as an already captured result. It does not promote uncertain work, call the provider again, or mutate historical released requests.
- On reopening a project, the generation panel recovers its job but its parent details starts closed. Recovery now opens the existing job status, including uncertainty. An uncertain result is identified as unconfirmed, not an endless in-progress generation; the simple screen exposes only an existing-result check, not a disabled misleading generate action.
- Photo help is a single sentence, with a short main-photo label. Formats, count/size limits and upload errors remain. Creative requests are directly below product facts and always editable. The stored facts and creative direction remain separate.

## Evidence and limits

Before the server fix, the new lost-ready-response test returned `uncertain` instead of `ready`. PostgreSQL/PGlite tests inject loss **after COMMIT**, exercise pending polling and repeated request admission, then restart and verify the same artifact, unchanged account ownership, one provider call, and exact balance/cost handling for both administrator and member. The provider and private storage are local fixtures, not external services.

Unknown provider execution and failed result upload remain uncertain across polling, request retries and restart. Their holds remain; no new provider dispatch occurs. A durable result guard cannot recover an image that was never returned, never stored, or whose usage remains unknown. No historical uncertain row is rewritten or charged. A genuine unknown operation must not be reset to enable a paid retry.

The reported production job's cause is **not established**. Port-only logs do not identify provider or storage outcomes. The minimal next evidence is the affected job's safe status/error code and whether a durable artifact/known cost exists, obtained through an authorized account status view; no keys, session tokens or prompts are needed. No live account or DB inspection was performed here.

Both supplied Library screenshot downloads failed through the supported helper, including one bounded retry to the local destination. No alternative download route was used. Form changes follow the user's explicit text instructions; local rendered screenshots are checked separately.

No push, deployment, APK build, live provider call, balance change or operational DB change is included. Existing Chrome authentication, roles, prices, project formats and request hashes are unchanged.

## Final local checks

- `node --experimental-strip-types --test tests-domain/generation-server.test.mjs tests-domain/cloud.test.mjs tests-domain/credits-v2.test.mjs`: **66/66 passed**, no skips. `/tmp/uncertain-domain-final.log`.
- Five affected browser specs (`consumer-flow`, `generation-history-state`, `input-example-guides`, `premium-flow`, `industries`), desktop/mobile: **88/88 passed**, no skips. `/tmp/uncertain-browser-verified.log`. Korean scenarios explicitly select Korean; obsolete collapsed-request and uncertain-generate-button expectations updated to current intended UI, without removing request/balance/persistence assertions.
- Typecheck, production build, cloud generated-code equivalence and isolation checks passed. Build includes the final product tree; subsequent edits are tests/documentation only. No separate lint script is configured.
- English/Korean rendered form screenshots inspected at desktop/mobile; overflow assertions cover 320/390/768 px. `/tmp/uncertain-form-{ko,en}-{desktop,mobile}.png`.
- These are local Chromium/PGlite/mock-provider checks, not physical Android, production PostgreSQL connectivity, or actual image generation tests. Remote CI was not triggered.
