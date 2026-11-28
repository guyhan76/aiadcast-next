# Regeneration after editing an unaccepted preview

Baseline: Render Live `333fc5ee6f6b74af8408a8c82f175eb909bfadad`; remote/APK code60 `cecaac92d820a982e45efbde851255da5d11538d`. Both checked before this local change. No production writes, provider calls, balance changes, or quota changes.

## Reproduced cause

The consumer flow allows leaving an unaccepted preview to edit its inputs. The persisted pending marker correctly recovers the first server job, whose state is still `ready`. GenerationPanel treated every ready job as active, consumed the new generation intent without dispatch, and disabled the generation button. Changed complete-ad inputs also made the old preview incompatible, so it could not render as the revised ad. Mobile regression tests for both administrator and member reproduced one POST instead of the requested second POST before the fix (`/tmp/regeneration-before.log`). This matches the reported sequence; the user's exact runtime error/status has not been inspected.

This reproduction is not an ID collision, provider failure, polling abort, photo loss, server project cap, or quota exhaustion. First and subsequent explicit starts already use random request IDs. Server idempotency is based on the complete request fingerprint and retains previous generation records.

## Minimal fix

A recovered `ready` job with a known input compatibility key and changed inputs no longer blocks an explicitly requested new visual. Running/uncertain jobs, unknown recovery, unchanged ready inputs, missing photos, budget and quota checks still block. No generation occurs just by editing; the user must submit. New-credit generation still requires its existing per-request 10-credit confirmation. Duplicate clicks keep the existing dispatch lock.

The prior job/result is not accepted, rejected, deleted or refunded automatically. Its existing billing policy is unchanged: a legacy unaccepted result keeps its reservation until explicit rejection or expiry; a delivered v2 result keeps its charge; an admin result stays exempt. The new job has its own existing reservation/settlement. This is not a free-regeneration policy change. Backend provider cost/budget guards remain authoritative.

## Verification and release scope

Mock browser regression covers admin/member edit-submit, retained original photo bytes, distinct request/result IDs, preserved old job, unchanged ready / running / uncertain blocking, repeated clicks and renewed v2 consent. Provider-mock domain tests cover both old/new result retention and idempotent reservation/capture, with two genuine generations producing exactly two provider calls. Existing recovery tests cover lost responses and accepted-result replacement.

Product change is limited to `src/GenerationPanel.tsx`. No backend, DB/schema, authentication, Android native, project limit, pricing or ledger implementation changes. A future approved web deployment and a rebuilt APK are needed for their respective clients, because the APK bundles its UI. This local task does not push, deploy or build an APK. Actual production generation and physical-device verification remain untested.

## Reported screenshots and result language/UI follow-up

Parent visually confirmed the disabled completed button, blank incompatible preview, stale checked-at timestamp, English intent/audience/rationale and four clothing keywords under Korean controls. The English text exactly matches the app's English rule templates, not evidence of an image-provider translation failure. Summary headings used UI language while bodies used the saved marketing input locale. The screenshots do not reveal that stored locale or the timing of the user's locale change; do not claim those hidden values were inspected. The revised-input stale ready-job reproduction explains why old metadata can remain visible after changing inputs.

`marketingPresentation` derives explanatory text using the UI language without mutating the stored marketing snapshot or generation request. Search keywords still follow the saved ad language (intentional for an English advertisement viewed in Korean UI). An incompatible old job no longer presents its analysis as the current input's analysis. Korean UI + Korean ad uses Korean rule text; English UI + English ad uses English. Customer-provided names/brands remain literal; no blanket Latin/Hangul stripping. Clothing's short noun list is supplemented to six relevant search terms at display time. Unknown categories with insufficient product evidence are not padded with invented sentences. No provider response schema, ad copy, request bytes/hashes or saved JSON is rewritten.

Analysis is a single default-collapsed section. Simple results omit debug checked-at timestamps and redundant preview guidance, shorten admin cost disclosure, hide the inactive completed-generation button when a compatible preview is ready, and place Edit details below the result. Per-generation credit consent, failed/uncertain/pending recovery, incompatibility and budget errors remain. Acceptance requirements before save/share are preserved. This does not redesign home or auth.

An existing history spec assumed Korean despite the English first-visit default; its setup now explicitly selects Korean without changing substantive assertions. Other assertion updates only reflect the approved collapsed analysis and shortened cost copy. Initial broader run: 46 pass / 12 history setup failures; these are not represented as passing evidence.

## Final local evidence

- Final fixed build: 66 browser tests passed, 0 failed/skipped across desktop/mobile (`/tmp/regeneration-final-stable-build.log`), covering consumer flow, lost-response recovery and historical-state behavior. Screenshots for Korean/English at 320/768 px inspected; responsive layout checks also cover 360/390/412/1440 px. These are mocked browser viewports, not physical Android/foldable tests.
- Related domain tests: 53 passed, 0 failed/skipped (`/tmp/regeneration-combined-domain.log`): generation/provider mocks, v2 billing, SEO, presentation-language and patent-flow compatibility.
- TypeScript plus web/standalone build passed (`/tmp/regeneration-language-build.log`); cloud generated-code consistency, isolation and git whitespace checks passed.
- An intermediate run had a single immediate photo-reload failure while web build files were being replaced; this is not counted as a pass or proof of a product cause. Final testing used fixed build files and passed that same unchanged assertion. Earlier obsolete language/selector checks were corrected as recorded above, not skipped.
- Live remained `333fc5`; remote branch remained `cecaac9`. Existing Chrome-only native authentication, backend/session/account data, ledger and request-generation code are unchanged. No push, deploy, APK build, paid generation or operational data changes occurred.
