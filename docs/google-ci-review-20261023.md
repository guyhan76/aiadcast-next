# Google release CI review — 2026-10-23

Candidate reviewed: `9e11ae54fb440424838742a9ef62b4570f0368fc` (PR #59).
Run: https://github.com/guyhan76/aiadcast-next/actions/runs/39878698728
Baseline: `040e261511b1af59fcb1849b1c50ca6deeae54fd`, run 39777313610.

## Evidence

- Candidate isolation, cloud consistency, types, domain tests and build passed.
- Browser: 414 tests, 382 failed, 30 passed, 2 skipped; approximately 82 minutes.
- All 28 Google web/native browser tests passed on desktop and mobile.
- Baseline: 164 failed, 220 passed, 2 skipped; browser duration 30m49s.
- All 164 baseline failing test identities also failed in the candidate; 218 previously passing tests now failed. Matching names do not prove identical causes: the new authentication screen can mask the older failure.
- Three artifact uploads failed quota in both runs. No artifacts, retention policies or account plans changed.

## Narrow correction

The Google gate incorrectly hid the existing hosted checkout and return pages from the external browser, which intentionally has no app login. Preserve only these existing standalone routes (`pay`, `payment-return`, `checkout-return`, and the checkout return query); server ticket and account checks remain unchanged. Read the current URL after the payment page removes URL credentials with `history.replaceState`. Creating/editing ads remains authenticated.

Account credit, sign-out and payment-continuation fixtures now mock the server session check rather than relying on client storage alone. Recovery sign-in uses the private account-recovery route. The expired-session test asserts that no product input exists and still checks that the old owner's draft is preserved and absent from guest storage. Source-level session-boundary tests start from the supported recovery route and retain all ownership/replay assertions.

Added regression: an invalid checkout ticket cannot establish a session or expose the creator. Existing receipt, same-owner continuation, other-owner rejection, logout, draft/photo restoration and credit read-only assertions are retained.

## Release limits

This does not repair the entire legacy browser suite. Old unauthenticated editor/signup assumptions and missing session mocks in other specs remain, alongside pre-existing selectors and quota failures. Therefore this is NOT evidence of a fully green release, nor proof all remaining failures are harmless.

No pricing, credit ledger, backend auth, schema, permissions, secrets, production data, signing material or deployed service changes. Existing production rollback remains 040e261. No actual Google sign-in or Android device-return test performed. The existing APK still contains the previous web assets; it was not rebuilt here.

## Local verification of the correction

- `npm run build`: passed (includes TypeScript).
- `npm run typecheck`: passed after the final test edits.
- 72 focused browser tests passed (53.6s): Google/native, account sign-out, account credits except the two baseline-failing generation-status tests, source session boundaries, web payment continuation. The two baseline-failing tests remain unchanged in default CI; the focused command merely selects this work's scope.
- 16 additional browser tests passed (13.2s): email proof, private recovery/admin entry, original-tab mobile return, duplicate/expired/retried requests, late-response rejection, server expiry, hosted checkout/receipt. Email recovery tests now enter `account-recovery`; leaving recovery remains unauthenticated and cannot expose the editor.
- Both desktop and mobile projects exercised; source boundary tests run against the development server, UI against built assets. Local source tests emitted nonfatal Vite font allow-list warnings due to the existing shared node_modules symlink. No real Google, email, payment or generation provider called.
- Full 414-test suite not rerun locally. Backend domain code unchanged; prior exact-candidate domain CI passed. APK not rebuilt.
