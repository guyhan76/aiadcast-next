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
