# Photo shape guidance after demo scope reduction

Base: deployed d072713 (includes the October member-budget hotfix and explicit dimension layout rule). Do not deploy the wider development stack.

For ordinary photo-based physical-product requests without a legacy dimensionPlan/proportionControl, replace dimension-driven shape instructions with reference-photo shape preservation. Numeric dimensions are label content, not a target body shape. Keep existing model, pricing, ad style, copy and main/inset/none placement rules. This does not certify identity, proportions or arrow endpoints.

The user's 300×200×250 mm inset example showed the same open product but an incorrect height arrow and shallow body. This is not evidence of a main/inset mapping regression. No paid generation was used to test this change; actual image geometry and arrows remain unverified.

A separate APK branch fix/retire-dimension-reshape-20261019 removes dimension guidance, text-example and original-photo mode choices from new demo creation, normalizes old draft flags and requires a photo. Historical result metadata/protocol remains supported. Older installed clients can still explicitly request the legacy modes; this server change is not an API shutdown of those protocols. Install the new APK as well as deploying this exact server branch to apply the complete scope reduction.

Validation: 21 related domain tests pass, including all dimension placements with/without legacy plans. No production deployment, paid call, key or budget-setting changes performed.
