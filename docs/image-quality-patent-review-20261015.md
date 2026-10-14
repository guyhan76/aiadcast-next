# Image quality and patent implementation review — 2026-10-15

This review covers the upgrade source, not the outsourced app's private backend. It does not establish visual superiority or patent claim coverage. No live image-generation request was made for this change.

## Quality controls in this implementation

`server/openai-image-adapter.mjs` selects the model, image request settings, photo-edit versus generation endpoint, and final provider prompt. `src/creative.ts` and `src/art-direction.ts` supply product-specific creative guidance. `src/generation.ts` assembles references and product facts; the server normalizes these inputs before dispatch. Frontend rendering and export also affect the final advertisement.

The current adapter uses `gpt-image-2.5-sunburst` and `quality: high`; this change does not change either setting. Complete-ad clients request one image containing the advertisement. Older clients without a composition key still request a photograph for their separate text renderer. Original-photo mode requests a background and composites the source photo separately. These paths are deliberately distinct. None identifies how the outsourced app works.

## Source materials reviewed

- User-provided `특허출원 제10-2026-0158120호_서지사항+명세서.pdf`: specification pp. 11–19 and claim 1, pp. 21–22, within the 24-page PDF.
- User-provided `이미지제작_160개명령어_16개카테고리_가이드.pdf`: naming caveat pp. 1–2; showcase p. 5; advertising p. 8; packaging p. 9; effects p. 16.

The guide's slash commands are user-defined shorthand for production instructions, not official OpenAI tools. This patch expands seven explicitly requested recipes: `/magazine-cover`, `/3Billboard`, `/packaging`, `/metaad`, `/showcase`, `/product-explosion`, and `/adcreative`. They remain optional. Users are not required to memorize commands, and the default product-specific direction remains available. The other guide commands are not claimed as implemented.

Recipes are appended only to the complete-ad path. Product identity, supplied dimensions, material construction, exact manual copy, contact visibility, and the existing CTA policy take priority. A 3D billboard recipe means one protruding illusion, not three billboards. Product-explosion styling must not invent hidden components.

## Implementation mapping and limits

| Source requirement | Current implementation / change | Remaining limit |
| --- | --- | --- |
| Category, dimensions, attributes and image inform the request | Normalized product fields and references feed the provider request; category and supplied dimensions inform a rule-based audience recommendation | Prompt inclusion does not prove physically correct geometry in generated pixels |
| Choose a content format | Requested canvas format is carried to generation and export | Format selection alone does not establish platform placement compliance |
| Image, intent, recommended channels and deduplicated keywords on the result screen | Existing marketing plan now appears in the simple consumer result and remains visible after acceptance | Intent/channels/keywords are rule-based suggestions, not measured advertising performance |
| Multiple input steps in the specification | Latest user-approved consumer UI is a single form | Do not describe the current UI as implementing every claim element; do not override the user's simpler UI to mimic the document |
| Design instructions from the separate guide | Seven explicit recipes expand into provider instructions | No live images have validated these new recipes; automatic style selection among all 160 recipes is not implemented |

## Verification

- Production TypeScript/Vite/standalone build passed.
- Sixteen targeted domain tests passed, covering normalized facts, dimensions, full-ad versus older-client behavior, marketing plan persistence, and the new recipe expansion.
- Consumer browser test was extended to cover preview/accepted marketing summaries and one generation/accept/download flow with mocked API responses. Both desktop and mobile runs were blocked before execution because this environment has no configured Chromium executable. These browser assertions remain unverified. Mocked images would not be evidence of AI image quality even after the test passes.

## Required comparison before claiming an upgrade

Use a matched set: original product photo(s), original input text, selected aspect ratio, and the actual outsourced-app result. Where available, obtain the outsourced app's image model, quality/size settings, final request template, photo preprocessing, and typography/compositing method. Do not request or expose API secrets.

Run both apps with the same representative products and user inputs. Repeat each condition at least three times as a pilot; retain all outputs rather than selecting only the best. Compare product identity, material/structure and dimensional plausibility, exact text, composition, mobile legibility, and readiness for use. Record completion time, failures, retries and cost per accepted result when these are observable. This small pilot is a decision aid, not a statistical performance guarantee.

Preserve an existing successful workflow while testing a candidate. Change one controllable factor at a time. Release the upgraded workflow only after the owner reviews the actual results and confirms that its intended improvements are present. Automated visual checking and selective correction remain future work, not capabilities delivered by this patch.
