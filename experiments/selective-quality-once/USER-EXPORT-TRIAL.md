# User-provided export trial — preparation only

No actual trial or operating ledger write has run. The earlier synthetic trial is consumed and is never reused. The new fixed identity is `user-export-shoe-selective-20261107-v1` / `attempt1`; owner and Supabase project remain the existing fixed administrator/project. The normal app ownership/artifact route is unchanged. Source kind is `user-provided-export`, server artifact relationship remains `unverified`; it is never claimed to be a successful server generation or synthetic fixture.

Exact input: Library `libfile_6757d82ad15c81918adacc1118e0f7dc`, file `file_00000000221c81fd98df126690638210`, PNG 1080×1920,3178610 bytes, SHA256 `fcfcf78a39244c84e36de3ea62f3459cf3776b0c1d0ed9818492e4eed8f52208`. No source image is in Git. Fixed integer ROI is x56,y0,width1024,height1536. Every transparent mask pixel must lie inside it. All other full-image RGBA tuples, including hidden RGB, are retained. No resizing, tiling, fallback request or complete-ad export transformation occurs. Output is the full1080×1920 PNG; saving/comparing/re-downloading these bytes costs no provider request.

The mask must be a full1080×1920 static binary-alpha PNG under4MB with a supplied exact SHA. The mask contract has been independently checked by the parent; the fixed prompt remains a proposed execution instruction, not paid approval. Yellow annotation strokes and synthetic test coordinates are not a mask. Rear small shoe/leg and separate upper-right trousers are the intended targets; foreground product, text, price and contact protection must be reviewed against the actual pixels. Masked product/texture quality still needs a separately approved paid test.

## Commands in the environment containing the files

Use this repository and its locked installed dependencies (Node>=24, sharp, pg); no global setup, key transfer, DB connection string or production service startup is required for validation. Relative imports require the repository modules, not a standalone copied CLI. Minimum input files: original PNG, finalized full-size mask PNG, and local `input.json` containing exactly `ownerId`, `maskSha256`, `prompt`. No credentials in that JSON. Do not put image/input/evidence files in source Git.

```
node --experimental-strip-types experiments/selective-quality-once/user-export-cli.mjs --validate-only /absolute/original.png /absolute/mask.png /absolute/input.json
```

This command reads local bytes, verifies exact source contract, mask/owner/model/ROI, and prints a bound manifest/request hash with dispatchAuthorized:false. It never creates handoff or SQL or provider requests. No environment variables or API key are required. It cannot yet succeed for the user input without the final mask and prompt. The dot cloud can run it only if this source/dependencies are available there; availability is not established by this implementation.

```
node --experimental-strip-types experiments/selective-quality-once/user-export-cli.mjs --mock /absolute/synthetic1080.png /absolute/synthetic-mask.png /absolute/mock-input.json /absolute/new-evidence-directory
```

Mock allows locally synthesized input (clearly labeled local-mock-export), fixed trial identity and ROI. It emits SQL requests tagged LOCAL_POSTGRES_ONLY_DO_NOT_SEND_TO_MCP, and accepts the complete original response in the existing nonce/session/sequence/project/owner/trial/attempt/SQL-hash/response-hash envelope over stdin. Only the isolated PostgreSQL test harness may execute mock SQL. Never forward this mode to production. The separate execute-approved-user-export mode below requires actual files and a new scoped approval record. Mock mode never selects a real transport.

## Shared invariants and gates

Both profiles share the existing SQL transaction implementation: global advisory lock, active admin check, all-history100000000 policy and enabled guard, combined existing budget/analysis holds, fixed request hash/revision and durable fresh claim. Source/mask/provenance/prompt/ROI/provider-binding hashes are part of the request fingerprint. Synthetic and user-export job/revision/claim prefixes remain distinct. Existing unknown holds are included; no customer usage confirmation occurs. Internal500000-micro reservation is not a provider charge cap.

Same live-process fresh response, exact writer XID committed proof, final matching inspection, exclusive fsynced dispatch marker and180s wall/monotonic/server window apply. Each handoff response has a60s nonextending limit. Lost fresh response or crash never restores dispatch authority by rereading files or the DB. Usage/response archives are fsynced before settlement; restored full-image copies are rederived and verified. Known cost is recorded once, conflicting settlement fails, unknown cost retains hold. No new DB tables/permissions/policy are introduced.

Live execution remains blocked by runtime/approval gates: final mask SHA and prompt approval, new paid-call approval, validated real-file preparation in the actual consumer, same environment's existing approved key binding (value never moved), current owner/policy/hold/unused-ID checks, are still required. The existing key is known only in the development consumer; its presence in dot cloud has NOT been established. Do not move it or presume it exists. The earlier synthetic paid approval is exhausted. The added paid-mode wiring is tested only through injected mock transport/shared orchestration, not an actual user-file call.

## Validation

Isolated PostgreSQL17 uses a dedicated network-none container and Unix socket, not Supabase. New tests cover concurrent claims, consumed synthetic coexistence, shared-budget/owner denial, unknown hold/late settlement/conflicting cost, lost responses/restart, expiry and actual child stdin/stdout mock handoff. Byte tests cover provenance/hash rejection, disjoint selection, protected hidden RGB, fixed ROI/size and capability-copy rejection. Existing connector/parser/synthetic/preflight regressions are run alongside these. This is local/mock evidence, not hosted-connector or shoe-quality validation. Full domain/browser/mobile and production resource load are not revalidated by this preparation increment.

Final local validation:71 tests passed,0 failed,0 skipped across user-export,connector-ledger,parser,synthetic-once and preflight suites. The first71-test run had69 passes and2 expectation-type failures (Postgres bigint parser returned numeric61077/0 rather than strings); assertions were normalized to Number and the full71 rerun passed. After bounded CLI reads were added, the actual stdin/stdout PG mock CLI test passed again. Typecheck, web build, cloud consistency,isolation and diff checks passed. Independent read-only review found no new critical defect. These results do not authorize or validate a live user-photo request.


## Proposed v2 mask contract (parent verification, no local image validation)

Full1080×1920 binary-alpha PNG:15511 bytes, SHA256 dce38d100484ac6d232a8bc7554fd77effca875190d472a9cf7920bc1a77990e,172139 selected pixels. Parent reports exactly2 components and zero intersection with protected text/foreground product. Real preparation now requires that exact full-mask byte hash/length and selected count. This does not grant dispatch authority. The parent reports independent actual-file mask review complete; the actual source/mask are not present in this consumer.

Parent-provided ROI PNG is12696 bytes, SHA25665bcea45a53c7b1527c42ea3594d6357f0bd7b54488e6c3131e00a7ca0eda75a. It is reference metadata only: the runner derives its crop from the validated full mask, and PNG encoders can produce different byte hashes for identical RGBA. It never substitutes an unverified ROI file. ROI stays56,0,1024,1536 with no scaling or padding. Feathering outside the mask is prohibited. Background halo near text and narrow dark trouser remnants around y500–560 require visual review after any separately approved output. Pose quality and final prompt approval are not established by geometry/hash checks.


## Explicit future paid-mode wiring (DO NOT RUN without new approval)

```
node --experimental-strip-types experiments/selective-quality-once/user-export-cli.mjs --execute-approved-user-export /absolute/original.png /absolute/mask.png /absolute/input.json /absolute/new-evidence-directory /absolute/new-user-approval.json
```

The only credential variable is the already provisioned `AIADCAST_NEXT_LOCAL_OPENAI_API_KEY`, accessed in this process, never logged/saved/copied. No new key/DB secret is needed; SQL handoff uses the existing authenticated Supabase tool, with full unchanged tool response envelopes. This command has NOT been executed. No new approval file has been created.

The new approval JSON must contain exactly approved:true, scope:one-paid-user-export-edit, ownerId, trialId:user-export-shoe-selective-20261107-v1, requestHash from exact validate-only output, userEvidenceRef identifying the NEW actual user approval, issuedAt/expiresAt UTC milliseconds. Maximum lifetime is1hour. It is an operator audit record, not cryptographic authentication: never fabricate it from this development request or the exhausted synthetic approval. CLI checks it before handoff and the runner checks again immediately before dispatch. All source/mask/crop work happens before claim. Input JSON prompt must equal exported SHOE_PROMPT exactly; requestHash includes that full text and provider binding. The validation record never authorizes execution by itself.

Fresh claim response+own-XID proof, same process/time/state gates, and exclusive marker remain mandatory. The adapter's in-memory one-shot fetch wrapper prevents retries. It receives only the internally prepared1024×1536 crop/mask, existing2.6/high/n1; no deferred crop after the final gate. Returned ROI bytes/usage are archived, full-size selected RGBA are restored and rechecked, and known estimated cost is settled once with its own XID proof. Failure/unknown outcome never retries. Approval expiry just before dispatch stops that callback; if claim already happened the hold remains for inspection, never automatic release.

## File/environment gate

Official preparation with an explicit development destination returned a signed transfer to sdmntprwestus3.oaiusercontent.com. Current observed enforced environment revision533 does not allow that host; no helper byte download was attempted. No alternative downloader/host/URL or key movement is permitted. Default direct placement was previously verified in dot's different workspace, not this consumer.

The runtime skill documents request_changes for an existing instance when available, followed by approval and refreshed enforced revision; this tool is NOT exposed here. Otherwise it documents onboarding/settings and publishing a configuration for future tasks. It does not establish mobile UI availability or applying a settings change to this already running task. Therefore the precise required product action is review/authorize the Library transfer host in this environment's network policy through a supported settings flow, then verify applied status before any fresh transfer. We have neither changed nor requested that policy. Direct mobile Work attachment has not been shown to materialize bytes into this executor and is not offered as a proven fix. Parent/dot must confirm supported environment UI capability; do not ask the user to paste a key or signed URL.


## Adapter failure evidence and current execution validation

Independent review identified valid usage being lost when the adapter rejected an invalid PNG/size. An opt-in onSelectiveUsage hook now receives only validated numeric usage/cost immediately after bounded JSON parsing. The trial stores it with fsync before validating image bytes; only a successfully saved receipt may become a cost-only outcome on image failure. Failed/conflicting evidence storage, missing usage or transport timeout retains unknown hold and never retries. Default app use has no hook and stays disabled. Unknown-hold updates now require their own settlement XID proof too.

The source prompt is exactly SHOE_PROMPT; its UTF-8 SHA256 is4c1b1de156655e26e2be8db85d3d98034afa35eff22760e8fae67f10aec2fc88. It is the parent's proposed Korean rear-leg/upper-trouser correction text unchanged. Actual requestHash cannot be calculated without actual original/mask bytes and the resulting provider binding. No approval record or live request was created.

The expanded geometry/adapter/ledger/parser/preflight suites passed125/125 with no skips before the final unknown-settlement proof tightening. A subsequent affected-suite rerun covers that tightening and conflicting usage-evidence storage; see final report for that separately counted result. New real transport wiring has only mock validation; real input acceptance, actual supplier quality, mobile device and hosted trial execution are still untested.

Final affected-suite rerun after unknown settlement proof and usage-evidence-conflict regression:77 passed,0 failed,0 skipped. Typecheck, web build, cloud consistency,isolation,diff checks passed; independent re-review confirms the usage-loss finding is fixed. It also notes the remaining fail-closed recovery limit: a process crash immediately after provider-usage-observed.json is fsynced but before connector-receipt.json is archived leaves a hold. That isolated usage file is retained, not automatically consumed; an operator must review correlated request/claim/usage evidence for a separate reconciliation, never dispatch again. No automatic crash recovery is claimed.

Parent verified actual source/v2 mask in dot at source SHA a2d67f93fea9e1b077a270d3c61d6c3475ced857: CLI validate-only exit0,172139 pixels,fixed ROI,user-provided-export/unverified lineage,dispatchAuthorized:false. Parent verified the imported Git blob closure. This establishes actual-file preparation only at that older SHA, not this subsequent paid-wiring/hook revision. Re-run validate-only on the final version before considering execution; it needs no provider/DB call.

Parent's official-document review of https://learn.chatgpt.com/docs/environments/cloud-environments confirms Additional allowed domains is the supported minimum network change. Save/republish applies to a new task; existing tasks retain their own state. Mobile Work continuation is supported, but direct mobile attachment placement into this existing executor is not documented. Any policy change/new Work requires a user decision and was not performed. Do not repeat transfer/route investigation or transfer credentials. The dot environment's approved existing key binding remains unverified.
