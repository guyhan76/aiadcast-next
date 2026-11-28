# Generation disabled-state diagnostics

Local fix based on production fa8904ddc62c411eb31943b7f4d2a087045ce75c.
The separate recommendation work is not included.

Input validation now renders the actual returned validation messages, with
Korean/English presentation, rather than a collapsed generic instruction.
Unknown English translations explicitly say validation failed without pretending
to identify a specific cause. The result view provides a Review inputs action
using the existing draft-preserving edit navigation.

Recovery pending has its own short status. Recovery failure retains its existing
failure message and read-only result check. That button remains visible and
disabled while recovery is running; duplicate clicks cannot start another read.
Status/permission, budget, reference capability, credit confirmation, active jobs,
unknown requests and all original generation admission checks are unchanged.
No new generation POST or implicit paid retry is introduced.

This diagnoses blocked UI; it does not establish the cause of the reported PC
incident. No actual user request, account or provider was inspected or retried.
Screenshots were inaccessible through the supported download flow, so OCR was
not treated as pixel verification. Deployment is not performed. Web users need a
reviewed server/static build deployment; bundled Android UI would require a later
APK update if this change is selected for mobile delivery.

Validation: 32 browser cases passed (24 disabled-state/recovery cases plus eight
existing recovery/export regressions), Korean/English on desktop/mobile. The new
cases assert no POST requests and preserved read coalescing. TypeScript/build,
cloud consistency, isolation and diff checks passed. Tests use mocked APIs;
physical devices, live provider behavior and the user's actual failure remain
unverified.
