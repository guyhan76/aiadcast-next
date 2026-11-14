# Google release assessment — bounded protected-screen follow-up

Branch: `feat/google-android-return-local-20261022`, draft PR #59. Remote last verified at `3e1fb1112cdbc30a5969fbb501bcbf52dd848169`. Subsequent repairs are local; no consolidated push, new CI or deployment has been started during this follow-up.

## Completed remote runs

| SHA | Run | Failed | Passed | Skipped |
| --- | --- | ---: | ---: | ---: |
| 040e261 | 39777313610 | 164 | 220 | 2 |
| 9e11ae54 | 39878698728 | 382 | 30 | 2 |
| 3e1fb11 | 39888660827 | 320 | 94 | 2 |

Latest browser duration was 72m19s. Isolation/cloud/types/domain/build passed before the browser stage. Three artifact uploads failed quota independently. No quota, billing, retention or artifact changes made.

## Reconciliation of the 320 failing identities

The accompanying CSV retains the original classification and adds current status/evidence. Counts identify desktop/mobile cases, not a newly completed full suite:

- **252** now have targeted passing evidence (242 same-title, 10 explicit replacement flows). Replacement flows preserve the relevant ownership, original asset, export and checkout assertions while exercising intended Google recovery, accepted-ad versus draft storage, supplied SVG branding and restored historical jobs.
- **42** reuse the previous scoped passing evidence; not rerun unnecessarily.
- **24** are now reconciled with the approved photo-required release policy (12 tests on both viewports): rejection/no-write checks and historical-result recovery preserve request/source/dimension/export intent. No tests were deleted or skipped.
- **2** reproduced a Google integration regression in offline-demo signup, now repaired and passing in the 58-case authentication regression group.

Thus all 320 old failure identities have scoped evidence; **none remain unresolved in the targeted groups**. This is not a claim of 320 passes from one exact-SHA full CI run. Previously passing cases and interactions still require consolidated CI after the blockers are settled.

## Actual local changes and checks

First product change in this follow-up is commit `4c98ab496b7d1a811e51090f7cf49e52ee62b06f`: cold web/native Google completion consumes the existing validated checkout destination instead of forcing home. Existing account ownership/ticket validation remains unchanged. A second product fix, `0e14451`, restores isolated offline demo authentication as detailed below. Other changes are tests and review documents.

Explicit per-spec authenticated fixtures validate known bearer token, expiry and account; they do not auto-authenticate every test or resurrect a logged-out session. Historical drafts/jobs are seeded under their owner. Protected UI tests use current selectors and valid required photos where the test concerns a different feature. Tests specifically promising photo-free creation were not converted into photo tests.

Completed targeted groups, desktop/mobile unless noted:

| Group | Result | Local log |
| --- | --- | --- |
| Protected admin, dimensions, checkout, layout, support, lookbook, material, publishing | 40 passed | `/tmp/protected-validated.log` |
| Account, checkout capabilities, input examples, pricing, showcase, simple pages | 37 passed, 1 existing skip | `/tmp/protected-account-both.log` |
| Consumer inputs, budget/admin rules, ten-credit confirmation | 10 passed | `/tmp/protected-credit-final.log` |
| Local real HTTP account credits/admin/October budget with mock provider | 20 passed | `/tmp/protected-account-server-final.log` |
| Editor, geometry, projection, comparison, mobile shell | 43 passed, 4 failed, 1 existing skip initially; all 4 failures repaired in next row | `/tmp/protected-editor.log` |
| Repaired editor cases plus owned recovery/cancelled checkout | 8 passed | `/tmp/protected-editor-payment-final.log` |
| Legacy generation recovery, dimensions/annotations/proofs | 56 passed | `/tmp/generation-dimension-both.log` |
| Conversation exports and supplied branding | 10 passed | `/tmp/conversation-brand.log` |
| Language, industry, studio layout | 18 passed; 2 obsolete home-label failures repaired in next row | `/tmp/protected-language-industries.log` |
| Mobile assets/origin isolation, full 10-photo export, home label | 10 passed; 4 fixture/selector failures repaired in next row | `/tmp/protected-mobile-premium.log` |
| Repaired mobile cases, outline metadata; offline signup and guidance diagnosis | 6 passed; 4 failed (guidance 2 repaired below, offline 2 remain) | `/tmp/protected-mobile-offline.log` |
| Result guidance/PNG, draft recovery/save without duplicate entries, same-tick create | 6 passed | `/tmp/protected-last-independent-final.log` |

Before the final offline-auth follow-up, these groups contain 264 distinct passing test identities, including cases already green in CI. Failed diagnostic attempts are disclosed above; they are not additional successful runs. Existing skips were not introduced or increased. Final follow-up: **58 browser checks passed (47.0s)** covering Google web/native, checkout return, explicit fixture isolation and offline demo on desktop/mobile (`/tmp/offline-auth-regression.log`). This includes two new forged/revoked demo-session cases; do not add overlapping runs as distinct coverage. Google mock domain checks: **9 passed** (`/tmp/offline-auth-domain.log`). Local `npm run build`, `npm run typecheck` and `git diff --check` passed after the product fix. No lint script exists. Whole-domain evidence remains the earlier remote pass, not a new full-domain run. No full browser suite rerun undertaken.

## Resolved product-contract boundary

### Approved photo-only new generation (24 cases reconciled)

Ancestor `1b60bc0` added `photoGenerationDraft` / `newGenerationIssues` in `src/generation.ts:37–45`: new requests require a photo, force creative mode, strip text-example and dimension reshape flags. Current CreateCampaign does not expose old original/text-example/planar controls. These policies predate the Google integration.

Affected contracts:
- consumer-flow: photo-free service; original-photo creation without advanced editor (4 cases).
- industries: photo-free service industries (2).
- premium-flow: English photo-free service (2).
- studio: photo-free manual service creation/export (2).
- text-product-example: text-only creation, unsupported-server blocking, lost response, annotation conflict (8).
- planar-control: opt-in planar generation, capability blocking, named measured variants (6).

Parent relayed the user-delegated product decision: retain photo-required creation for this release. Description-only concept creation is roadmap-only. The 24 tests now cover photo rejection with no generation/acceptance/credit write, retained input/dimensions, photo-backed creation where appropriate, and historical text/planar result recovery with source hashes, raw result, labeled pixels, acceptance, download and no duplicate provider calls. Existing AI numeric annotations remain available but cannot cause generation without a photo.

Bounded results: 10 passed (`/tmp/policy-first.log`); 12 passed and 2 incorrect annotation-UI assumptions failed initially (`/tmp/policy-historical.log`); the 2 were corrected against current AI-label controls and passed (`/tmp/policy-annotation-confirmed.log`). All 24 now have passing evidence. Related domain tests: 18 passed (`/tmp/policy-domain.log`); typecheck and diff check passed. No product code changed in this policy reconciliation.

### Repaired: Google integration broke existing offline demo (2 original cases)

Reproduced with valid auth prerequisite: authenticated support page → “Start offline demo” → mode change clears server session → reload shows disabled Google button instead of local demo signup. `GoogleGate` intercepts unsigned demo signup; `src/local-demo.ts` also lacks `/api/auth/session` required by the new gate. The diagnostic screenshot/log confirms the failure is not just a selector. The failure was reproduced before the fix; the complete simulated flow now passes on both viewports.

Implemented in `0e14451`: only the explicitly selected offline mode can use local signup/login. Signed demo accounts still require `/api/auth/session` validation. The local adapter records issued tokens with account and expiry, rejects forged/revoked tokens and revokes them on logout; 401 invalidation cannot erase a replacement session. Existing user/order/job/credit records are preserved. Optional session records require no IndexedDB schema version change; old demo sessions without issuance records must reauthenticate to the same local account. No server authentication/permissions changed.

The simulated end-to-end test verifies failed/cancelled purchases add nothing, successful purchase grants 100 once, two generations leave 80, acceptance/reapplication do not charge again, and re-login retains 80. A separate case verifies forged and logged-out token rejection plus same-account recovery, with zero network API requests. Public real-mode Google-only login and account-isolated checkout/Android return tests remain passing. No blanket offline child-render bypass was added.

## Release position

Targeted groups are now settled. Proceed with one consolidated normal push and track exact-SHA CI through completion. This document does not assert full CI success. Do not deploy before reviewing that outcome or skip tests/change required gates. Artifact quota remains an independent prior CI failure; no artifact/billing settings have been changed.

Prepared APK remains source `9e11ae54`, stale relative to checkout/auth repairs, not deliverable as this release. Rebuild only from the selected verified candidate using existing approved signing. No Render deploy called. Exact-SHA Dashboard deployment remains required because available generic tool cannot pin commit. Keep auto-deploy off and rollback reference `040e261511b1af59fcb1849b1c50ca6deeae54fd`.

No production data, credentials, permissions, service settings, real login/email/payment/generation, or outsourced app changed. There is no connection/approval-tool denial; the prior 24 product/test conflicts and recoverable offline regression have been addressed locally. Whole-CI and real Google/Android verification remain separate release requirements.
