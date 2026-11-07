# Selective image edit development candidate

Base: `606c69ec20c152cf37050a4f4aa35999c6917e4f` (simple review actions). No production activation, database migration, paid request or Android build is part of this change.

## Contract and preservation

Authenticated tenant routes accept a source job ID, immutable artifact hash, PNG mask, instruction, destination project ID, request ID and existing credit quote. External source URLs are not accepted. The service retrieves its own source artifact and validates hashes, decoded sizes and dimensions before admission. Only ready/accepted complete ads without text/dimension overlays are supported initially. Text-only, planar and overlay variants fail closed.

Mask PNG is strictly below 4,000,000 bytes and has the source dimensions; alpha 0 selects and alpha 255 preserves. Intermediate alpha and empty masks are rejected. The generated PNG must have exactly the source dimensions. Server composition copies generated RGBA tuples only at selected pixels. Unselected decoded RGBA tuples remain byte-identical. Original files, jobs and projects are not overwritten. Accept explicitly saves a separate local project and PNG. Subsequent download/compare uses the same local bytes without another provider or accept call.

Reservations, attempts, cost settlement, review, accept/reject and tenant isolation reuse the image ledger and cumulative-budget guard. Identical source/mask/instruction requests deduplicate across destination project IDs, including an already accepted copy. Unknown submission keeps its request identity and supports GET-only lookup. No automatic edit POST/provider retry is implemented. Closing does not imply server cancellation or refund. Existing delivery-based versus acceptance-based customer charging policies remain distinct from supplier costs.

## Release gates (not an enablement instruction)

`GenerationService.selectiveEditingEnabled` and `OpenAIImageAdapter.selectiveEditReady` default false. No client or environment switch enables them in this candidate. Mock fixtures alone enable them. The production image model remains unchanged (`gpt-image-2.6-sunburst`) and is now included in the documented mask-edit allowlist. Originals fitting 1024×1024, 1024×1536 or 1536×1024 are copied byte-for-byte into a centered standard canvas, with opaque protected mask padding. The exact original rectangle is recovered before selective compositing. Larger originals fail before reservation/dispatch; originals are never resized or replaced with padded assets. Before any activation, resolve the supplier cost-reservation boundary; documented token rates are not a maximum charge guarantee. Existing $0.50 admission hold is reused in mocks, not represented as an upper bound on actual supplier billing. Consequently real editing remains blocked. No new key/account is required or exposed by this implementation.

API usage-derived costs are estimates until reconciled with supplier billing. Unknown costs preserve the existing hold; they are not zero. Existing cumulative $100 policy is reused, not replaced by a new allocation. Billing/schema/configuration changes require a separate reviewed scope.

## Limits and verification

Browser tests use synthetic PNGs, authenticated mock endpoints and isolated browser storage. They do not establish actual OpenAI quality, Android touch behavior, production authentication/storage or billing. Image byte-preservation tests establish decoded RGBA preservation, not correctness of the user's selection or product claims. Source asset limits remain the existing parser limits; no automatic resizing is used. Restart recovery uses the original request/job ledger; UI never assumes a missing lookup means safe automatic resubmission.

Rollback must retain existing records/assets/reservations. Disabling new admission must not remove GET recovery or accept/reject access to existing jobs. No deployment/rollback or real schema modification has been performed.

## Future result collections

A selection is identified by the authenticated tenant's source job ID + artifact SHA-256 + source project ID, never an array index. Each copy stores `generated.editParent` and the server job stores the verified `selectiveEdit` lineage. Mask hash and instruction participate in idempotency. Local copy insertion is atomic and does not overwrite a copy saved/edited in another tab. Fixtures cover collections of 1/2/4/6/8/10 independently generated mock results and reordered display lists. This prepares individual editing identity; it does **not** implement batch generation, a batch result picker or production batch billing.

Independent review found and prompted fixes for late-tab overwrite, terminal recovery locks, saved-session reuse and stale identity. The unrelated baseline consumer-campaign replanning test still fails because dimensions.visible becomes false; reproduced from an isolated archive of base 606c69e (5 pass/1 fail), without changing that code/test. Real PostgreSQL tests are opt-in and skipped when their explicit local DB test configuration is absent; mock/PGlite coverage is not proof of real multi-connection behavior for this new feature.

## Recorded local checks (2026-11-07)

- `node --experimental-strip-types --test tests-domain/selective-image-edit.test.mjs`: 20 passed.
- `npm run test:domain`: 755 passed, 1 baseline failure, 10 opt-in real-PostgreSQL tests skipped (766 total). Baseline isolated archive: consumer-campaign 5 passed/1 identical failure.
- Playwright selective editor: 20 passed across desktop/mobile; Korean/English layout-only final capture: 4 passed. Synthetic image fixtures only.
- Combined generation recovery + editor run: 198 passed/6 page-navigation failures while dist was being rebuilt. After freezing the final build, all 16 affected slow-readiness/provider-refusal scenarios passed, including all six failures. This is a rerun result, not an uninterrupted all-green run.
- Typecheck, ordinary web build, cloud variant consistency, isolation check and `git diff --check`: passed. Repository has no lint script.
- Independent read-only review: identified and fixed late-tab overwrite, terminal lock, saved-session reuse and stale-source boundaries; final review found no further major blocker. Reviewer did not independently rerun tests.
- Final viewport screenshots: `/tmp/selective-mobile-ko.png`, `/tmp/selective-mobile-en.png`, `/tmp/selective-desktop-ko.png`, `/tmp/selective-desktop-en.png`. Directly inspected Korean mobile and English desktop pixels. No external upload.

Release remains blocked by unproven supplier charge upper bounds; model mask contract and standard-size payload now have non-paid checks, and isolated multi-connection PostgreSQL checks have been added. Android/device/paid-quality validation remains unperformed. No claim of production readiness or completed multi-image generation is made.

## Follow-up evidence and corrections

The additional real PostgreSQL test reproduced a Cloud-only region-context forwarding defect (edit calls 0 rather than 1). `CloudGenerationService.create(body, options)` now forwards options through admission. The Cloud factory also now forwards the selective adapter contract through the existing instance-ownership/provider concurrency gate. Both paid readiness flags remain false.

A separate cached official postgres:17 container was started with `--network none`, no TCP listener and a dedicated `/tmp/aiadcast-selective-pg-socket` mount. Existing test/production DBs were not used. New tests use independent pools, temporary tenant schemas, mock provider and memory storage. The earlier 10 skipped real-PG tests were also run from temporary copies with only their fixed socket literal redirected to this new socket; repository assertions were not weakened. All 10 passed.

The existing domain failure is caused by `creativeCampaignDraft()` invoking `prepareCampaign()` in creative mode; when annotation mode is absent/none, `prepareCampaign()` sets dimensions.visible=false. The old test expects the previous true flag to survive. Both source and test are unchanged from base606c69e, whose isolated archive reproduces the failure. No unrelated behavior was changed.

Initial browser failures (all desktop, local page HTTP navigation failures during dist rebuild):
- valid slow readiness continues first form click once (ko, 13600, true)
- valid slow readiness continues first form click once (ko, 14900, false)
- valid slow readiness continues first form click once (en, 13600, false)
- provider refusal guidance PROVIDER_QUOTA_EXHAUSTED (en) stays read-only
- provider refusal guidance PROVIDER_TEMPORARY_RATE_LIMIT (en) stays read-only
- provider refusal guidance PROVIDER_429_UNCLASSIFIED (en) stays read-only
The frozen-build rerun covered all six within 16 passing scenarios. This remains distinct from the full original 198-pass/6-fail run.

Official contract evidence (read 2026-11-07): https://developers.openai.com/api/docs/models/gpt-image-2.6-sunburst and https://developers.openai.com/api/reference/java/resources/images/methods/edit . The unchanged usage estimator prices input at uncached standard rates when the breakdown cannot safely assign cached tokens to text/image. It is a conservative usage estimate, not an invoice match or a guaranteed maximum. No claim that2.5 and2.6 consume equal tokens is made.

## Final follow-up validation

- Actual local server: PostgreSQL 17.11, cached official postgres:17 image, network mode `none`; ephemeral validation container stopped/removed after tests. Prior local PG container and production DB untouched.
- New partial-edit real PostgreSQL suite: 6 real-PG cases + 1 ownership/provider-gate wrapper case, all 7 passed. Independent pools cover idempotency, last available budget reservation, concurrent settlement, uncertain recovery through a fresh service, tenant separation and legacy-ticket rejection. Provider and object storage remain mocks; no actual process crash or external storage durability is claimed.
- Existing opt-in PostgreSQL suite: 10 passed via isolated temporary copies with socket-only substitution. This resolves their earlier nonexecution for the tested code; the ordinary full-domain command still reports them skipped without its fixed socket setting.
- Final focused selective-image domain suite: 22 passed, including current2.6 mocked multipart/usage, standard-size-only rejection before admission, and strict decimal4MB mask boundary.
- Updated full-domain run with the selective PG socket: 764 passed, the same baseline failure1, existing fixed-socket tests skipped10 (775 total). No assertion/test was removed to make this green.
- Initial browser6 failures and their16-case recovery remain historical evidence; a separate full fixed-build run is recorded on completion below.
- Final independent reviewer `/root/selective_review` read Cloud forwarding/wrapper, local PG fixtures and2.6 standard-size gating after fixes, without executing tests or finding another major blocker.

No paid test is needed to finish these local contracts. A later *separately authorized* quality pilot could start with exactly one `gpt-image-2.6-sunburst` images/edits request, one1024×1024 static PNG and same-size mask, `n=1`, `quality=high`, PNG result. Optional landscape/portrait trials would each be one additional request, not automatic retries. There is no defensible pre-call numeric maximum reservation from the available API contract. Standard-rate post-response estimate is `(5*textInputTokens + 8*imageInputTokens + 30*imageOutputTokens)/1e6` USD without inferred cache discounts. That formula and a pilot do not prove a future billing cap. Both activation flags remain false; no request was sent.

## Lossless standard-canvas follow-up

The adapter now prepares padded provider inputs before admission, while retaining original source/mask hashes and original stored assets. It chooses the first fitting canvas in 1024×1024, 1024×1536, 1536×1024 order; floor-centered integer offsets are deterministic. Raw RGBA rows are copied (not resized or alpha-composited). Mask padding is alpha255. Provider dimensions must exactly match the chosen canvas. The same rectangle is cropped, then the existing original-coordinate mask composite copies only selected pixels into the original. Padded canvases are never saved as the edited original. Unsupported large dimensions fail closed.

Current generator sizes for 4:5 (1024×1280),9:16 (864×1536),3:4 (960×1280),16:9 and1.91:1 (1536×864) all fit; standard1:1,2:3,3:2 also fit. This validates pixel geometry, not semantic editing quality or provider cost bounds.

Final padding checks: 32 focused domain cases passed, including eight geometries, odd offsets, corner masks, alpha0 with nonzero hidden RGB, exact crop/output dimensions, outside-selection RGBA equality, wrong provider dimensions, oversized pre-admission rejection, and mocked multipart transport. Local isolated PostgreSQL17.11 suite rerun:7 passed; its own network-none container was removed afterward. Typecheck/web build, cloud consistency, isolation and diff whitespace checks passed. The full fixed-build browser run before padding passed208 cases; the final padding build reruns the22 selective editor desktop/mobile cases separately. Full domain historical result remains764 pass/1 reproduced baseline failure/10 opt-in skips, with those10 independently passing against isolated PG; no claim of full final-domain rerun is made.

Independent reviewer /root/selective_review reviewed padding, service pre-admission preparation and Cloud forwarding, finding no new major blocker. The requested hidden-RGB alpha0 fixture was added and passed. No paid request, production change, push or deployment occurred. Both selectiveEditingEnabled and selectiveEditReady remain false by default; supplier maximum charge boundary, actual output quality and Android-device validation remain unresolved.

## Local commit freeze verification — 2026-11-07

The final padded implementation was rechecked without provider credentials in the test command environment (`OPENAI_API_KEY` and `AIADCAST_NEXT_LOCAL_OPENAI_API_KEY` unset). Image transport was mocked. No paid API, production DB or deployment was used.

- Full domain:785 total,774 passed,1 unchanged baseline failure,10 opt-in skips. Exact failure: `explicit AI replanning creates a separate draft while preserving source photos, roles, manual facts and the accepted original` (`tests-domain/consumer-campaign.test.mjs:33`), dimensions.visible false vs expected true. Source/test still match base606c69e; isolated baseline already reproduced it. No unrelated correction made.
- New partial-edit PostgreSQL cases6 plus provider wrapper case1 passed within the full run. Separate prior opt-in PostgreSQL cases10 also passed from socket-only redirected temporary copies against the dedicated network-none PostgreSQL17.11 container. Container removed afterward; existing DBs untouched.
- Related full fixed-build browser regression:208 passed (desktop/mobile generation-auto-recovery and selective-image-edit suites). No rebuild occurred during the run. The earlier six navigation failures are historical, not outstanding failures in this run.
- Latest unchanged executable code retains successful typecheck/web build,32 focused padding/edit cases, independent padding review, cloud consistency/isolation and whitespace validation. This final step adds only this verification record.
- Logs: `/tmp/selective-final-all-domain.log`, `/tmp/selective-final-legacy-pg.log`, `/tmp/selective-final-all-browser.log`.

The older candidate patches are preserved as historical artifacts; this documentation addition means the padding patch is no longer byte-identical to the final commit. The final local commit is the source snapshot. No remote backup/push is implied. Paid activation and device/actual-quality testing remain blocked as described above.
