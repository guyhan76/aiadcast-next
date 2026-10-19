# Early sign-in gate — 2026-10-19

Base: draft PR39, `47b542d9274a6be77c4d1cdb068016fdc001c28e`. Branch: `fix/early-login-gate-20261019`. The stacked product/design work is preserved.

Previously guests could complete the advertisement form before discovering that generation required sign-in. Creation, project library, studio and editor now show a sign-in-required screen before any private form/library is displayed. Home CTA, sidebar/mobile navigation and direct hashes share this route boundary. Home, portfolio, guide, pricing and public version information remain available.

The client verifies existing sessions through the existing read-only `/api/auth/me`, checks expiry and account identity, and rechecks on route changes and foreground resume. Unknown/network-failed sessions do not reveal private screens. A retry performs only the read. A rejected authenticated API request also closes the private screen. Server authorization remains authoritative and unchanged.

Login remembers the requested destination within the same API origin. Successful login resumes it; explicit cancellation returns to a public screen, and browser/native back cannot bypass the gate. Checkout return retains its existing priority. An expired token's storage namespace is deliberately retained until explicit account change, preventing an account draft from being rewritten into guest storage. Existing guest drafts can still migrate on login. Previously verified components stay mounted but hidden while a foreground recheck is pending, avoiding loss of an in-progress photo attachment.

Browser regressions now explicitly authenticate editor fixtures against a mocked read-only endpoint. Account/guest tests stay unauthenticated until their real tested login action. Legacy draft manipulation uses the correct account namespace; the legacy guest migration test seeds an actual older guest draft. Existing generation/credit/photo/layout assertions remain in place. No production test-auth bypass was added.

APK candidate: `0.2.41-demo`, code `43`, package `com.selluplabs.aiadcast.next.demo`, same existing demo signer. Bundled frontend changes work with the existing server's `/api/auth/me`; this task does not deploy the separate newer industry-generation backend. No paid generation, credentials, budget, billing, database policy or production service changes. Approved beauty-image transfer remains unresolved and existing assets are unchanged.

Final local/remote test counts and the exact APK/commit are reported with delivery. Prior PR39 CI passed all check/test steps but failed its artifact uploads because GitHub Actions artifact storage quota was exceeded. This quota is not resolved by the client change; no historical artifacts are deleted and no checks/uploads are disabled.
