# Existing-request recovery diagnosis (2026-10-25)

Base: 005c2d0. No provider calls, operational reads/writes, releases or budget changes were performed.

## Confirmed local defect

A persisted pending marker without a loaded job rendered “Checking the earlier request” even after recovery failed. The status now requires an active recovery and no recovery error. The error remains visible after failure; the pending marker, request identity and disabled-generation gate remain unchanged. This does not fix or identify the user's underlying GET failure.

## Exact read path

- `GET /api/generations?projectId=<current-project-id>` when no pending job ID is known.
- `GET /api/generations/<pending-or-matched-job-id>` when a job ID is known or history matches it.
- `GET /api/status` is separately requested by the recheck button.
- No generation POST, accept/reject, reset or hold release is sent by that button.

Client authorization comes from the existing session. Responses are rejected if the session/API origin changes mid-request. The server authenticates before routes and creates a user-scoped service/PostgreSQL schema. Do not query another user's project or job as a workaround.

Recovery checks history.jobs is an array; matches current project and pending requestId/requestIds; requires exactly one match when a pending request exists. Without a pending marker it considers running/ready/uncertain jobs and fails closed on multiple matches. Job detail must match both job ID and project ID. A missing pending request in the latest 30 history rows is not proof it never ran. No marker deletion or automatic regeneration is safe from that evidence alone.

## Failure distinctions (existing behavior)

- 401 AUTH_REQUIRED: clear matching session and return to login; retain owner-scoped drafts. Other 401 responses show authentication failure.
- 403: lookup denied; keep generation blocked.
- 404 JOB_NOT_FOUND: job unavailable in the current user's service; does not prove no provider execution.
- HTTP 200 but invalid/mismatched JSON or multiple eligible history jobs: fail closed; no guessed job selection.
- Empty history with a pending request: REQUEST_NOT_FOUND; preserve pending request.
- Network error/non-JSON response/abort: lookup unconfirmed; preserve pending request.
- The ordinary refresh path calls recover() with a 30-second overall timeout and one attempt. The automatic=true recovery path has a 45-second overall timeout and up to three GET attempts, never provider retry.

## Minimum safe operational evidence

For the user's single read-only recheck, inspect browser Network entries filtered to `/api/generations`, GET only. Record request pathname (job/project IDs only if needed), HTTP status, elapsed time, and response `error.code`. For HTTP 200 use only matching ID/projectId/requestIds/state and jobs-array presence/count; omit image data, prompts, contact details, auth headers, cookies and tokens. Do not export a HAR.

Render request logs, when available: same short UTC interval, GET, path `/api/generations` or exact known job path, statuses 400–599. Application `generation_failure` logs instrument the generation pipeline, not these GET failures; their absence does not establish lookup success. The HTTP catch currently returns error.code without an application error log.

If an actual request cannot be observed, the screenshot confirms recovery failure but cannot distinguish these branches. Obtain the single failed GET's status/error.code rather than requesting more generic result screenshots or issuing another paid generation.

## Verification

The new regression first reproduced failed + loading simultaneously with a mocked 404. The matrix covers 404, network failure, malformed detail, different-project detail, and empty history with a pending request, in Korean/English and desktop/mobile. It preserves pending identity, checks disabled generation, read-only recovery, duplicate-click suppression and continued blocking after recovery to uncertain. These mocks do not establish the production job's cause or provider billing state.

## Mobile-safe diagnostic details

Local follow-up adds a collapsed **조회 오류 상세 / Lookup error details** under the failure message. It shows only the fixed lookup stage (이전 요청 목록 / Request history or 기존 작업 조회 / Existing job lookup), HTTP status or HTTP 응답 없음 / No HTTP response, and an allowlisted diagnostic code. Examples: HTTP 404 · JOB_NOT_FOUND; HTTP 200 · INVALID_HISTORY; NETWORK_ERROR; LOOKUP_TIMEOUT. Unknown HTTP error codes become HTTP_ERROR. Non-JSON responses use API_UNAVAILABLE; invalid JSON uses INVALID_RESPONSE. A timeout after headers may retain HTTP 200 without implying a valid response body.

The client observes only the response status; it never stores the response body or arbitrary error message in diagnostic state. IDs, URLs, account details, cookies, authorization and prompts/images are excluded. Details clear when a new lookup begins or the component unmounts. A normal AUTH_REQUIRED 401 still performs existing sign-in redirection; this detail view does not retain private state across logout.

Recovery now explicitly rejects null/invalid job details, mismatched identities, unsupported states and missing/invalid wallet numbers instead of crashing on null data. No unknown request is cleared or retried as generation. No new server logging or operational data changes. The underlying production lookup cause is still unknown until the diagnostic is actually deployed and observed.

After separately approved deployment, the mobile user can expand “조회 오류 상세” and share that one line after a single read-only recheck. Browser developer tools/HAR are not required. This local change has not been deployed.

Verification follow-up: diagnostic classifier tests cover allowlisted 401/404, timeout before/after headers, network error, invalid schema, session change, unknown/private codes and invalid status. Browser fixtures cover 404, network, null job, wrong project, missing request, non-JSON HTTP 502, malformed JSON HTTP 200, and unknown/private HTTP 500 codes across both languages and viewports. Separate account-credit tests verified existing AUTH_REQUIRED logout behavior; 4 legacy assertions targeting the hidden `생성 상태 조회` region failed and reproduced identically on unmodified parent 6ea995b3 (2 tests × desktop/mobile). No legacy assertion was removed or relaxed. Timer classification is unit-tested; these checks do not reproduce a physical Android network timeout or the actual operational error.

User update 2026-10-25 07:48 UTC: sign-out/sign-in did not remove the same block. This does not establish a new provider call or prove an authentication cause. Pending markers are stored under account/API-origin/project namespaces and survive session renewal. A valid new session can still encounter missing/mismatched/ambiguous history, HTTP errors or transport failure. No session/budget/hold reset is justified from this evidence.
