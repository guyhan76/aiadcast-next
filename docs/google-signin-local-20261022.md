# aiadcast Google sign-in local candidate

Baseline: deployed 040e261511b1af59fcb1849b1c50ca6deeae54fd. No production data/settings, credentials, grants, pushes or deployment changed.

## Scope and compatibility

Web launches require sign-in; the normal guest page has only Google continuation, no separate signup/email/password/editor entry. A still-valid server session opens home. Existing token storage remains sessionStorage (closing the browser can require signing in again). Old users, projects, credit units and billing policies are unchanged.

Google authorization code + S256 PKCE uses state, browser-only proof, nonce and fixed Google token/JWKS endpoints. RS256 signature, issuer, exact client audience/azp, expiry, iat, nonce and verified email are checked server-side. Request consumption is transactional before token exchange; ambiguous or lost responses require a new flow, never replay a code. The verified subject is unique and maps to the existing internal user ID. New accounts get zero credit/budget and member role. Both local SQLite and generated PostgreSQL implementations are present.

Additive tables: google_identities and google_requests. Existing tables/data are not rewritten. Expired flow rows are cleaned on new starts. Rollback retains identity rows; old login methods/data remain. Existing beta maximum of 20 users and 20 saved server projects remains a release limitation.

Email equality does not link accounts. A collision asks the owner to use /#account-recovery; existing email/password authentication remains there. After ownership verification the UI offers explicit Google linking, bound to the exact live server session and a fresh Google proof. Conflicting subject/account bindings fail closed. Existing admins can always use the same recovery URL and existing configured password; the normal Google page has no password link. Google never bootstraps admin privileges. Do not disable existing recovery auth settings before testing owner access.

## External setup needed before an actual web test

No existing Google code/config names were found in the baseline. Secret stores and cloud credentials were not inspected. New server settings (names only):

- AIADCAST_GOOGLE_ENABLED=true
- AIADCAST_GOOGLE_CLIENT_ID
- AIADCAST_GOOGLE_CLIENT_SECRET
- AIADCAST_BETA_PUBLIC_ORIGIN (existing origin, preserve)

In Google Auth Platform, a Web application OAuth client must authorize exactly:
https://aiadcast-next.onrender.com/?google=1

Configure app branding as aiadcast, seller Sellup Labs, consent audience and approved test users. Public consent verification, privacy/terms URLs and production publishing remain external release work. This server redirect flow does not need a browser-exposed secret or new CSP script grants. Do not paste secrets into chat. Set them only in the approved server secret settings after separate authorization. No setup was performed in this task.

Google documentation: https://developers.google.com/identity/openid-connect/openid-connect

## Native and verification limits

Mobile-browser layout is supported; the existing Android WebView/APK is NOT connected to Google authentication. Its Google button fails closed instead of attempting embedded OAuth. Native Credential Manager/system-browser callback integration and corresponding Android OAuth registration are separate prerequisites. No APK/iOS build or real-device Google session was created. No iOS integration is claimed.

Existing full legacy CI remains unresolved and was not rerun. Focused mock verification is not real Google consent, mail delivery, production database migration, or a paid API test. No real credentials/tokens are used in fixtures. Current credits tests reuse the existing ledger without policy changes.

## Focused local results

- Google authentication/security tests: 6 passed (signed RSA fixtures, no Google request).
- PostgreSQL subject/concurrent-login test: 1 passed; generated cloud HTTP startup smoke: 1 passed.
- Existing credits-v2 ledger tests: 9 passed, local mock providers only.
- Built browser UI: 12 passed across desktop/mobile, then 2 additional delayed-session boundary cases passed. No full legacy suite rerun.
- Typecheck, web build and cloud-generated-code check passed. Existing large-chunk warning remains.
- Google consent/button branding review, native integration, real callbacks, production migration and owner recovery smoke remain pre-deployment checks.
