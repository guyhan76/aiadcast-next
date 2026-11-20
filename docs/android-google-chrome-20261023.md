# Android Google sign-in: Chrome-only candidate

Based on live and remote `333fc5ee6f6b74af8408a8c82f175eb909bfadad` (rechecked before implementation and during verification). Local preparation only; no server, account, database, environment, or permission changes.

Only the already-validated Google authorization intent targets `com.android.chrome`. There is no default-browser fallback. Missing/disabled Chrome or a denied launch clears local pending proof and emits a fixed error code, without logging the authorization URL. The app displays a short English/Korean retry instruction. Other external links keep their existing routing. No Custom Tabs dependency, WebView OAuth, automatic installation, package queries, or global browser changes.

Explicit activity launch does not require package visibility queries; do not add a `resolveActivity` preflight that could falsely report Chrome missing. Android documents this at https://developer.android.com/training/package-visibility/use-cases . ActivityNotFoundException and SecurityException are handled without another launch.

The existing URL/PKCE/state/nonce validation, fixed callback, account ownership proof, original-device proof, account isolation and checkout destination remain unchanged. Native polling now uses an effect-local in-flight flag: a failed browser launch can be retried while its old poll is outstanding, and failure invalidates that effect immediately so late results cannot install a session.

Validation: production web build (including TypeScript), cloud consistency and isolation checks; Google domain tests; focused desktop/mobile Google/native/account-link browser tests; full MainActivity compilation, Android policy unit tests and lint. Browser tests mock the native failure event and network; they do not emulate Android package resolution. Existing Android tests validate authorization/callback policies, not a real installed Chrome app.

Before delivery, a new APK is required because both native launcher and bundled UI changed. No APK or version bump is made in this local-only task. Physical-device checks remain: Chrome installed with Samsung Internet as default, Chrome disabled/missing, OS launch denial, cancellation, cold/warm return, and English/Korean error rendering. Verify that Chrome opens and the original app receives the result. Do not claim the earlier intermittent mail-compose symptom is resolved without device evidence.

Completed local results: 60/60 focused browser tests, 29/29 Google domain tests, 10/10 Android unit tests. Android compile and lint succeeded (0 errors; 2 existing warnings: synchronous preferences commit and required WebView JavaScript). Type/build/cloud/isolation passed. No full legacy browser suite or remote CI was run. Logs: `/tmp/chrome-only-browser-final.log`, `/tmp/chrome-only-domain.log`, `/tmp/chrome-only-android.log`, `/tmp/chrome-only-build.log`.
