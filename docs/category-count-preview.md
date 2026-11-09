# Preview 0.2.84 — category search and image count

The consumer form replaces 19 repeated group headings with a searchable flat list. All 48 category IDs are retained, so saved projects and server rules remain compatible. Korean/English names and common aliases (e.g. 운동화/sneakers → shoes) filter the list. Search alone never changes the category or submits the form; the current choice stays available even when it does not match. Photos and brief fields are not reset by searching. Image quantity is now numbered section 9.

## What category selection does today

`CreateCampaign` → `withCategory` → `buildGenerationRequest` sends the category and product facts to the server. `createMarketingPlan`, SEO rules and `artDirectionFor` use it for audience, presentation and prompt guidance. Several categories share production presets: shoes/accessories use fashion, and financial subcategories share finance guidance. The supplied photos and facts remain authoritative. This is prompt wiring, not proof that selecting a category improves generated image quality or eliminates product/anatomy defects.

`CreationHome` displays video creation as coming soon; this Preview does not wire a video generation action. No category-dependent video benefit is claimed.

## What image quantity does today

`createResultSet` creates 1/2/4/6/8/10 distinct projects. `AdResultSet` advances sequentially after each verified preview becomes ready. Every image passes through `GenerationPanel` recovery, quote and budget checks. New-credit users must confirm the charge for each image. Errors, uncertain outcomes, cancellation, backgrounding and exhausted budgets can prevent completion of the requested count. Reloading must not manufacture another paid generation intent. The separate geometry-proof mode remains single-image.

## Validation scope

`tests/category-count.spec.ts` covers search in Korean/English, preservation through reload, all six quantities using intercepted API responses, unique request/project IDs, no automatic acceptance or repeated generation after reload, budget blocking and per-image new-credit consent. Existing `industry-production`, `result-set-component`, `consumer-flow` and `result-set` tests cover prompt wiring, queue cancellation/recovery and original-preserving partial edits. The signed Preview workflow gates distribution on these checks and existing login/logout/native checks.

These tests use synthetic image fixtures, not paid generation or real product-quality evaluation. Record the actual CI result before reporting completion. Render Free, cumulative budget limits, duplicate-call prevention and server code are unchanged. No server deployment or Google Play publication is performed by this change.


### Existing full-suite failures (not release approval)

The unchanged 0.2.83 baseline at `8784cb2d57437156a070f6107489620d7c277fa3` already fails the same 34 desktop/mobile consumer review/navigation cases: run 42625637677, verify job 129188549906. Examples include old `사용 확정` versus current `사용확정`, retired review-time `입력 내용 수정` controls, and old language-switcher navigation. The first 0.2.84 check (run 42648514648) confirms the same failures. This change does not repair or mark them passed. The full `App checks` workflow remains unfiltered and unchanged. The Preview candidate gates the changed form/search/count behavior, current original-preserving edits, input/photo/admission cases, and existing login/native checks. This is a scoped testing APK, not general production approval.

The initial category search check also exposed a new accessible-name ambiguity in the wrapped native select. An explicit localized `aria-label` fixes the control itself while retaining the native picker and exact-name assertion. All six count flows, budget blocking and new-credit consent passed in both viewports in the first run. Synthetic provider fixtures do not establish real generated-image quality.
