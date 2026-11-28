# Email-only local release candidate — 2026-10-22 KST

Base: `6d2a788e656e0b429d1d9b30affdfec69a5343a6`.
Branch: `release/email-auth-only-local-20261022`.
Worktree: `/workspace/aiadcast-email-candidate`.
The original stacked branch/worktree remains at `c63face1c3e5d618992c66157ffcc91eab5c24b7`, unchanged. This is a new local candidate, not an uploaded or deployed version. The user-confirmed successful real administrator email test was not repeated.

## Included

Selected frontend changes from 3ed12a5 / 0a6583e / c63face:
- session expiration/timer/focus invalidation and current AUTH_REQUIRED handling; stale responses cannot clear another account;
- owner-bound draft writes across session changes;
- sign-in completion guards and email exchange cache/pending-request invalidation;
- email-primary UI with existing password/admin fallback when both capabilities are available;
- original-screen mobile-style resume checks, duplicate-submit guards, expiry/resend, late-response cancellation.

Eight frontend files are changed/added. Existing email APIs are reused. No backend file or database schema differs from the operating baseline. Existing account IDs, roles, balances, project schemas and server quota remain unchanged. No new environment variable is required. Existing capability settings determine availability; keep test-password access enabled during rollout.

## Explicitly excluded

No project-sync service, CloudProjects, CloudSave, ProjectOutbox, new IndexedDB outbox, new automatic server project upload/retry, or local storage conflict changes. GenerationPanel and storage.ts remain exactly at baseline. No batch-ledger module, credit-policy activation, batch runner, pricing or checkout implementation changes. No server/data migration. The existing server 20-project limit is unchanged.

## Candidate checks

- `npm run typecheck`: passed.
- `npm run build`: passed (TypeScript + Vite + standalone local HTML). Existing large-chunk warning remains. No provider calls or dependency installation.
- Selected email/password/member/admin-preservation domain tests: **13 passed**.
- Local PGlite cloud HTTP email/role/project isolation test: **1 passed**.
- Focused mocked browser suite: **16 passed (22.8s)**. Self-contained `playwright.email-candidate.config.ts` uses the baseline config directly; new `tests/email-session-boundary.spec.ts` has no sync/outbox dependencies. All API calls in browser cases are mocked.
- `git diff --check`: passed.

Initial broad browser selection accidentally matched the project name and ran 18 tests: 17 passed; the unchanged legacy cancelled-checkout test timed out looking for the old `테스트 결제 준비` selector. It was not deleted or weakened. The focused selector was corrected to explicitly select requested email/session/logout cases. This is NOT a claim that the entire repository suite passes. Existing font allow-list warnings on the symlinked local dev dependencies limit visual/font verification.

Commands:
```
npx playwright test --config=playwright.email-candidate.config.ts
node --experimental-strip-types --test --test-name-pattern='email|mail|disabled|members signup|owner password' tests-domain/accounts.test.mjs tests-domain/password-auth.test.mjs
node --experimental-strip-types --test --test-name-pattern='cloud HTTP signup, role checks' tests-domain/cloud.test.mjs
npm run typecheck
npm run build
```

## Before any deployment / rollback

- Review and authorize this exact candidate and upload separately; no GitHub CI has run because nothing was pushed. General repository suite and separate lint were not run; package.json defines no lint script. Resolve the known legacy checkout test before claiming full-suite readiness.
- The build passes locally, but release-artifact browser smoke and real Android WebView/mail-app return remain unverified. Browser resume tests do not prove OS app switching. No APK/iOS build or deep-link feature was introduced. Return to the original requesting app; if its session was destroyed, request a fresh email.
- Confirm target service and exact pinned commit at deployment time. Do not deploy the stacked c63face or an outdated configured branch by accident. No production configuration was inspected or modified here.
- Preserve existing test-password/admin access. Disabling test auth and public launch remain separate decisions. Do not rerun the already-successful administrator real-mail test without a specific new reason/authorization.
- Rollback code to baseline 6d2a788 with existing data and credentials intact. No reverse migration is needed. Existing settings can remain with both methods enabled; old UI will prioritize password login. Baseline rollback reintroduces the old session/cache limitations. Pending links retain normal expiry and original-device requirements; do not copy tokens between devices or delete accounts to recover login.
