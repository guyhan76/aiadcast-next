# Native Google automatic return

Local change based on Live and remote candidate `9c473a554491e6affa69aab589b72c36175956e4` (both matched before editing).

After the server verifies the native callback, its return page attempts the existing fixed package URI once. That URI contains no code, state, proof, session or destination. The installed app continues its existing proof-bound exchange; normal login reaches home and validated checkout destinations remain intact. No app permission, manifest, account linking, credit or database change is needed.

The page initially says “Opening aiadcast…”. If the browser stays visible, the fallback link appears after 1.5 seconds. A synchronous navigation failure exposes it immediately. Returning to the browser exposes the link without another automatic redirect. Rapid fallback clicks are coalesced; JavaScript-disabled browsers retain a usable link. Explicit English/Korean and the supplied original wordmark remain.

Only the exact static handoff script is allowed by a SHA-256 CSP hash. Default resource blocking, no-store, no-referrer and frame/base/form restrictions remain. The cloud HTTP variant is generated from the same handler. Existing state/PKCE/nonce, expiry, one-time approval, owner binding and logout boundaries are unchanged.

Browser policy can still require a user gesture or an app-open confirmation. This does not bypass that policy, close an external browser, or guarantee automatic opening on Samsung Internet/Chrome or every Android version. Real-device cold/warm return and browser blocking/cancel behavior remain manual verification; desktop/mobile browser mocks cannot establish Android intent delivery. App Links or native browser SDK integration would be a separate decision if devices still block this minimal attempt.

No push, deployment or APK build is part of this change. The callback HTML is server-served; the existing installed app already understands the unchanged URI. Release requires comparing the then-current Live and remote product changes again.

## Local verification

- Full domain: 444 passed, 0 failed/skipped (mock providers/local stores).
- Focused browser coverage: 48 distinct desktop/mobile cases passed across native, Google sign-in and return-language specs. Initial direct custom-scheme attempts produced 4 environment-policy failures; OS navigation was then explicitly mocked for those page tests, while the original script is independently exercised in VM contract tests. The remaining 42 initial cases passed; final return-language group including no-JavaScript fallback passed 14/14. This is not a physical app-launch pass.
- Typecheck, production build, generated cloud parity, isolation and whitespace checks passed. English desktop and Korean mobile fallback screenshots inspected.
- No remote CI, actual Google login, deployment, device installation or APK build performed.
