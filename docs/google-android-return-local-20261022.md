# Android Google system-browser return (local only)

Parent web candidate 849f835d7064999fe4aaf413408a8be47f699036 is preserved. This follow-up implements the installed Android shell as well as web; it does not deploy or build/sign an APK.

## Existing app and exact registration

MainActivity hosts bundled Vite assets at https://appassets.androidplatform.net with an origin-restricted WebMessage bridge. Namespace/release applicationId: com.selluplabs.aiadcast.next. Current demo: com.selluplabs.aiadcast.next.demo (0.2.53-demo, code55 unchanged). Debug .dev and preview .preview remain separate installs/data.

Chosen flow: system browser ACTION_VIEW -> Google authorization-code/PKCE -> backend HTTPS callback -> fixed app wake-up -> authenticated app poll. Google authorization is never loaded inside WebView. No Google SDK, OAuth secret or access token is added to the APK.

Use the same **Web application** OAuth client described in the web candidate, and register this additional exact redirect URI:

https://aiadcast-next.onrender.com/api/auth/google/native-callback

Keep the web URI https://aiadcast-next.onrender.com/?google=1. Server setting names remain AIADCAST_GOOGLE_ENABLED, AIADCAST_GOOGLE_CLIENT_ID, AIADCAST_GOOGLE_CLIENT_SECRET and AIADCAST_BETA_PUBLIC_ORIGIN. No values were read/changed and no client/grant was created. Google consent/branding/testing users must be configured separately before a real test.

Android wake-up URIs (manifest uses ${applicationId}):
- Demo: com.selluplabs.aiadcast.next.demo://google/return
- Release: com.selluplabs.aiadcast.next://google/return
- Debug/preview use their respective package suffix.

These custom schemes are app wake-up signals, NOT Google redirect URIs. Do not register them as a workaround for embedded OAuth. For this server-mediated Web-client flow, an Android OAuth client or signing SHA fingerprint is not consumed by the code. Future Credential Manager/native SDK or verified App Links would require their own registration/signing verification, outside this patch. Existing signing configuration is unchanged.

## Security and data boundaries

The initiating app alone holds a 256-bit proof. Native private, backup-disabled preferences retain state/proof/expiry/server/owner for process restart; no account session token is copied there. Java validates exact Google HTTPS host/path, redirect URI, PKCE S256, scope, state, nonce and expiry before launching ACTION_VIEW. Duplicate launch messages are ignored. Clear messages must match the current state.

Google callback validates the one-time state, PKCE code exchange and signed nonce-bound token, then records pending verified claims. It returns only a fixed app link with no token, code, state or proof. The original app must present its private proof to obtain a session. Intercepting/spoofing the custom scheme cannot sign in. Replay/expiry/wrong proof fail closed. Callback failure invalidates the flow. No automatic code re-exchange occurs.

App foreground/resume polls; cancel clears proof and ignores late results. Restart only resumes an unexpired flow with the same server and account owner. A linking flow whose authenticated session was lost requires fresh ownership verification. Existing email-collision recovery and administrator recovery remain available. Google subject continues mapping to the same server user ID and credit ledger; no new grant, merge-by-email, price or debit policy is introduced.

One additive table google_native_requests references the existing pending Google flow table with cascading expiry cleanup. Existing customer/project/credit rows are not rewritten.

## Verification and remaining gates

Executed locally without external authentication/provider calls:
- Google/web/native backend mock tests: 9 passed; PostgreSQL concurrency/native polling test: 1 passed.
- Browser bridge and web regression: 26 passed; additional native ownership-recovery cases: 2 passed.
- Actual Java GoogleSignInPolicy compiled via the installed JDK compiler module; 18 positive/negative launch and return cases passed. JUnit source is also supplied.
- Web build/typecheck and generated cloud code consistency passed.

The javac executable is absent, but the installed Java runtime contains jdk.compiler, used for the pure policy class. Full Android MainActivity compilation, APK signing/build, Android OS intent resolution, process death and real Google consent/callback remain UNVERIFIED. No SDK download, credentials, real login, deployment or push was performed. The bridge/browser mocks are not a physical Android test. Next release gate: approved Google settings + Android compile/device test of the exact new APK, including existing admin recovery and credit balance before/after login.
