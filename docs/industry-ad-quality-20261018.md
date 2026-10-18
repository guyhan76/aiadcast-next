# Industry advertising quality — 2026-10-18

Base: PR37, `341070a97d2e0fe7c790b2d85b17aaac2f5dbd58`. Working branch: `feat/industry-ad-quality-20261018`. Preserve the stacked history; do not deploy the old PR5 branch or replace this work with main.

## Diagnosis and implementation

The current server already requests a complete flattened advertising page when creative mode, automatic art direction and a composition key are present. It is inaccurate to diagnose every result as a photograph-only prompt. The original-photo path deliberately requests an empty background; legacy clients and planar control have separate contracts. They must not receive finished-page instructions.

The finished-page path now includes industry-specific scene and detail guidance plus square, portrait, tall portrait and landscape information hierarchy. Packaging, beauty, bags, food, fashion, jewelry, appliances, travel, lodging, dining, healthcare, insurance, automotive and industrial subjects receive different scene priorities. Material-appropriate light, plausible depth, a strong factual headline, legible Korean and purposeful spacing are common standards. Gold, liquid ribbons, bottle/cream arrangements and three-panel layouts are explicitly not universal templates. Details remain optional and evidence-based.

Existing source identity, original/planar modes, exact axis and unit handling, optional dimensions, supplied qualifications, manual-copy wording and requested-only CTA remain authoritative. No invented brands, prices, discounts, ingredients, certifications, efficacy, returns or coverage. The adapter revision records the changed instructions. This is prompt routing and contract validation, not real provider visual validation or an automatic quality guarantee.

## Approved gallery asset: blocked transfer

The user approved the latest cosmetics v3 concept for public concept display: Library `libfile_5351926b9d148191ae63a4916f015b78`, version 0; filename `exec-9c3d4551-6759-4843-ba2b-f0f4ac665e06.png`, expected 2,489,787 bytes. This is a separately generated design concept, not an actual app-generated case.

Library preparation with the exact Library ID, backing file ID and filename succeeded. The official transfer helper returned `library file transfer failed: download failed` in both ordinary and escalated execution. No permission-denial message was returned. No destination image was created. No alternative image was generated or substituted. Therefore the gallery asset replacement, pixel inspection and image-specific provenance update remain pending an authorized working transfer. Existing gallery images and their source metadata are unchanged; no other industry's image has been upgraded by this code change.

## Release boundary

These new instructions execute on the server. Installing an APK alone cannot enable them on an older deployed server. No production deployment, paid generation, direct API substitute, key change, budget change or authentication change was performed. Development usage top-up is not additional app API permission. The previous backup, service/branch/environment verification, app-session access and hard cost-bound checks still apply before any future authorized deployment or paid batch.

Regression checks cover industry selection, ratio-specific hierarchy and absence from original/legacy/planar paths, alongside existing factual copy, optional specifications, exact geometry, photo recovery and account/credit checks. Final local and remote results are reported separately in the delivery; mocks do not establish actual image quality.
