# Login startup fix — Preview 0.2.82 (84)

The initial Google button waited for `/api/account/capabilities`. A cold or unavailable backend therefore made the installed app appear unresponsive before the user could start sign-in. A successful Google exchange also remounted the session boundary and fetched `/api/auth/session` again, adding a second network wait.

The button is now usable while discovery is pending. Discovery remains a background GET, and the Google start endpoint still decides whether authentication is available. A definitive disabled capability response and unsupported native bridges remain disabled. Repeated clicks still produce one start POST; errors do not replay the exchange. The button remains visible with a busy label while Google is opening.

A proof-bound successful Google response installs a validated session and a memory-only 30-second receipt tied to the exact token, user, expiry and server. Only that fresh login skips redundant startup reads. Reload, logout, session change, server change and expiry invalidate that shortcut; stored credentials still require server verification. No credential is newly persisted in localStorage or native preferences. Existing session storage policy is unchanged.

Existing-session bootstrap GETs share a 15-second total deadline, replacing the prior 50-second deadline. Up to three transient GET attempts fit within this budget. Late responses cannot restore a logged-out session or cross accounts. No generation, image, payment or save request is retried by this code.

## Verification and limits

- Local typecheck and web build passed before CI. Local Chromium could not launch because the execution environment denied its process-singleton socket; browser results must come from CI, not this blocked local attempt.
- The Android publishing workflow gates release on desktop/mobile login, startup, native-return and account-recovery browser checks, then native tests/lint/assembly and exact certificate/package/version checks.
- Production Render service details on 2026-11-09 report the Free runtime plan in Oregon. Render documents idle spin-down after 15 minutes and approximately one minute to spin back up: https://render.com/docs/free#spinning-down-on-idle . That remains a plausible source of the reported long first connection; the exact reported handset request was not timed or traced.
- No Render plan, server deployment, OAuth configuration, signing identity, cumulative $100 budget or generation dedup policy is changed. Physical phone startup timing and live Google authorization remain to be measured.
- This update does not enable live AI partial editing or resolve the separately documented image-quality defects.
