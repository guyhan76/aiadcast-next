# Existing-account Google connection: local candidate

Baseline: Live and remote `4770fa073249bb2aec7903d36c96057a1c45c0b2` verified before editing. No production database or authentication configuration was accessed or modified.

## Behavior and intent

New clients explicitly request recovery support when starting Google. On a verified Google email collision, the server retains only the verified subject and exact existing user ID in a pending connection. The original device still holds its private proof. The user chooses **Verify account and connect Google** once; the server sends the ownership email to that bound account, ignoring client-supplied email/account fields. Mail verification only marks that specific request approved and does not log the mail browser in.

On return/focus, the original app completes connection, email consumption, pending-request consumption and session creation in one transaction. It reaches home, or the existing validated checkout destination. Normal completion does not repeat Google consent/account selection or ask for another email login. Already-connected and new Google users keep their existing direct sign-in paths. Existing administrator roles, user IDs, projects, balances and credit policies are unchanged.

## Binding and compatibility

- New additive `google_link_requests` table references `google_requests` and `users`. Original request proof hash, guest session binding, verified subject, exact user ID, exact ownership-email request, consent and expiry all constrain completion.
- TTL is the original Google request's 10-minute expiry; sending mail never extends it. Existing request cleanup cascades to pending connection records. No historical account/data rewrite.
- Only the exact initiating proof can request/status/complete/cancel. Replacement authenticated sessions cannot complete a guest connection. Cancellation may invalidate with the original proof even after a local session change; it cannot create a session or identity.
- Competing subject/account connections fail closed. Completion is one-time and transactional; PostgreSQL concurrency is exercised locally. Cancellation and completion serialize; a completion already committed before cancellation cannot be undone by pretending it never happened. Late browser responses do not install a session after a logout/cancel boundary.
- No session/proof is placed in a link URL. Existing provider signature/issuer/audience/expiry, state, PKCE and nonce checks are unchanged. No email-match-only merge or administrator promotion.
- Older clients omit `linkRecovery` and retain the prior explicit connection path. They must not receive an unsupported response shape. No native bridge/manifest/permission change; the new app UI lives in the bundled web assets, so Android needs a new APK for the simplified flow.

## Recovery and limits

Web tab reload retains the short-lived pending context. Android process restart restores the existing native pending proof and asks the server for connection status without another provider exchange. Missing/expired/wrong-origin proof fails closed. Lost initial Google responses can recover a verified pending connection using the same proof. Email send failure remains retryable; duplicate clicks/sends are coalesced.

A lost final session response never replays a consumed session issuance: start Google sign-in again, which now recognizes the linked subject without another ownership email. Expired recovery or a server crash during mail delivery may require cancel/restart; mail is not automatically resent. No guarantee of uninterrupted completion across OS data deletion or revoked app storage. Actual separate-browser mail delivery and Android cold/warm app return still require device testing.

## Release requirements (not executed)

Approve the additive schema deployment separately before production. Existing startup initialization would create the new table; no new credentials/permissions were requested. Deploy server and refreshed app bundle together for the new flow; code58 can keep using the old safe path. Rolling back code leaves completed legitimate identity links usable and does not reverse them; the unused pending table can remain. Do not drop tables or unlink accounts as a rollback shortcut.

Recheck the then-current Live and remote SHA before release. This task makes no push, deployment, APK, actual account link, email delivery or paid-provider call.

## Final local verification

- Full domain: **457 passed, 0 failed, 0 skipped**, including SQLite HTTP recovery and local PostgreSQL competing completion/identity persistence.
- Browser: **114 passed** across built desktop/mobile and source session-boundary projects. Coverage includes native/web recovery, cold/warm return mocks, separate mail proof, delayed response after logout/cancel, lost initial response, duplicates, expiry, checkout destination, existing password/admin paths, explicit languages and original wordmark.
- Earlier expanded run encountered Korean selector expectations against the existing English default. It was stopped after diagnosis; explicit Korean setup was added to that legacy account-flow spec, retaining all assertions. The final complete targeted run above passed. No product language or checkout policy was changed for tests.
- Typecheck, production build, generated cloud parity, isolation and diff whitespace checks passed. Build retains its existing large-chunk warning; source-only tests log existing Vite shared-font allow-list warnings and passed. No restrictions were broadened.
- Logs: `/tmp/google-link-domain-final.log`, `/tmp/google-link-browser-verified.log`, `/tmp/google-link-build-final.log`. Screenshots inspected from the recovery spec's desktop English and mobile Korean outputs.
- Final remote and Render read still matched baseline `4770fa0`, Live deployment `dep-dbdm7fon74is73999st0`. No concurrent product changes found.
