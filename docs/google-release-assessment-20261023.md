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
- **24** still conflict with the existing new-generation policy (12 tests on both viewports). They remain in the suite, unchanged in substantive expectations and not skipped.
- **2** reproduce a Google integration regression in offline-demo signup. Not fixed or waived.

Thus 294 old failure identities have scoped evidence, **26 remain unresolved**. This is not a claim of 294 passes from one exact-SHA full CI run. Previously passing cases and interactions still require consolidated CI after the blockers are settled.

## Actual local changes and checks

Only product change in this follow-up remains commit `4c98ab496b7d1a811e51090f7cf49e52ee62b06f`: cold web/native Google completion consumes the existing validated checkout destination instead of forcing home. Existing account ownership/ticket validation remains unchanged. All subsequent changes are tests and review documents.

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

These groups contain 264 distinct passing test identities, including cases already green in CI. Failed diagnostic attempts are disclosed above; they are not additional successful runs. Existing skips were not introduced or increased. Earlier 48 Google/native/checkout checks and previous fixture checks are reused. Final local `npm run typecheck` and `git diff --check` passed. No lint script exists. Build last passed after the product change; source has not changed since. Domain evidence is the earlier remote pass, not a new run on this test-only revision. No full suite rerun undertaken.

## Exact remaining conflicts

### Existing photo-only new generation (24 cases)

Ancestor `1b60bc0` added `photoGenerationDraft` / `newGenerationIssues` in `src/generation.ts:37–45`: new requests require a photo, force creative mode, strip text-example and dimension reshape flags. Current CreateCampaign does not expose old original/text-example/planar controls. These policies predate the Google integration.

Affected contracts:
- consumer-flow: photo-free service; original-photo creation without advanced editor (4 cases).
- industries: photo-free service industries (2).
- premium-flow: English photo-free service (2).
- studio: photo-free manual service creation/export (2).
- text-product-example: text-only creation, unsupported-server blocking, lost response, annotation conflict (8).
- planar-control: opt-in planar generation, capability blocking, named measured variants (6).

Do not silently restore removed new-generation behavior or replace these tests with unrelated assertions. Decision needed: confirm the photo-only policy and migrate these contracts to explicit rejection/historical-result coverage while retaining source/request/dimension/save checks, OR authorize restoring the removed new-generation features as separate product work. Other legacy dimension/annotation/accepted-result tests already pass through real owner-scoped historical fixtures.

### Google integration breaks existing offline demo (2 cases)

Reproduced with valid auth prerequisite: authenticated support page → “Start offline demo” → mode change clears server session → reload shows disabled Google button instead of local demo signup. `GoogleGate` intercepts unsigned demo signup; `src/local-demo.ts` also lacks `/api/auth/session` required by the new gate. The diagnostic screenshot/log confirms the failure is not just a selector. Offline generation, simulated checkout and re-login cannot be certified end to end.

Small repair boundary: preserve the deliberate support-only, network-free demo flow; add a narrowly scoped local demo authentication/session contract rather than bypassing server session validation. Local demo accounts/credits must remain separate and survive re-login. A blanket `offlineDemo => children` authentication bypass is not an acceptable fix. This has not been implemented; disclose it separately from the photo-policy decision.

## Release position

Do not deploy yet or launch another knowingly failing full CI. All independent targeted groups have been handled; resolve the above product contract boundary and offline regression before one consolidated normal push and exact-SHA CI. Do not skip failing tests or change required gates.

Prepared APK remains source `9e11ae54`, stale relative to checkout/auth repairs, not deliverable as this release. Rebuild only from the selected verified candidate using existing approved signing. No Render deploy called. Exact-SHA Dashboard deployment remains required because available generic tool cannot pin commit. Keep auto-deploy off and rollback reference `040e261511b1af59fcb1849b1c50ca6deeae54fd`.

No production data, credentials, permissions, service settings, real login/email/payment/generation, or outsourced app changed. There is no connection/approval-tool denial; remaining blockers are explicit product/test contracts and a reproduced local demo regression.
