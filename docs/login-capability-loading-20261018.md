# Login capability loading fix — 2026-10-18

Based on PR35 commit 5d5a0620a4c1db3f21db90d09ef08a69e0fe5fa1. This is a client presentation fix; it changes no server authentication policy, database schema, environment setting or key.

Before the capabilities response arrived, EmailAccountPage rendered the email-link form and an unavailable notice because capabilities were null. The existing server's password capability then replaced it with the test password form. This explains the reported transition without establishing a login rejection or APK/server incompatibility.

The page now shows a neutral sign-in-method loading state until validated capabilities arrive. Network/HTTP/timeout/invalid-response failures show a retry action and continued access to ad editing. Optional password capabilities are validated without requiring that field from older email/invitation servers. Saved email verification does not poll until email mode is confirmed, or while password mode is active. The existing 10-second request timeout and test-auth disclosure remain unchanged.

Regression coverage includes delayed login and signup, disconnected networking, HTTP failure, malformed settings, invalid password capability, timeout and retry, old email/invitation responses, and saved-email polling isolation on desktop and mobile. The slow-login mobile test fails on the original PR35 source and passes after the fix.

Android demo version is 0.2.37 / code 39 with the existing package and signing identity. Installation is a client update; it does not deploy a server or enable email verification. Production remains on the previous server until the separate backup and deployment prerequisites are met. Real-device installation and the user's actual account login must still be checked by the user.
