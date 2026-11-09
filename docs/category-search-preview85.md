# Preview 0.2.85 category selection changes

Products and services have separate browsing tabs and compact topic groups. Search operates across both kinds and displays directly selectable results below the input. The former second native select has been removed. All 48 persisted category IDs remain compatible; 25 additional named fields reuse existing generation families. Names outside the list can be explicitly selected as a product or service.

The exact expanded/custom name is stored in optional `productProfile.industryName`, validated during project parsing, passed to the creative industry label and provider instructions, and included in the finished-ad reuse key. Choosing a different standard category clears the old custom name. Product facts, photos, budget gates and request deduplication are unchanged. These extra names do not constitute separately quality-validated AI models or support for video generation.

Section 9 has 18px between its number and title and 20px between the heading and quantity buttons. Existing quantity options and generation behavior remain unchanged.

## Verified locally

- `npm run typecheck`: passed.
- `node --experimental-strip-types --test tests-domain/industry-production.test.mjs tests-domain/industry-catalog.test.mjs tests-domain/product.test.mjs`: 12 passed, 0 failed.
- Isolated React DOM harness (JSDOM): separate product/service browsing, direct matching results, click selection, cross-kind keyword lookup, Enter/IME handling and custom selection passed. This is not browser layout or device verification.
- No paid AI request, hosting plan change, server deployment or Play publication was performed.

## Blocked validation and delivery

GitHub Actions run https://github.com/guyhan76/aiadcast-next/actions/runs/42718781185 failed before any step ran (`runner_id: 0`, empty steps). The full App checks workflow also failed before execution. The available connector exposes the run state but not its failure annotations. The cause is unconfirmed; it must not be labelled a code-test failure or a billing issue without the annotation.

The current local executor cannot launch Chromium (socket permission restriction), and its local preview is not reachable from the separate cloud browser. Therefore the updated Playwright tests and actual mobile/tablet layout screenshots have not been verified in this session.

No 0.2.85 APK has been produced or distributed. Installed 0.2.84 devices have not received these changes. Once the GitHub execution blocker is resolved, rerun the existing candidate workflow, inspect mobile/tablet screenshots, complete the guarded regression and native signing checks, then distribute the matching signed Preview APK. Existing wider-suite and live-image-quality limitations continue to apply.
