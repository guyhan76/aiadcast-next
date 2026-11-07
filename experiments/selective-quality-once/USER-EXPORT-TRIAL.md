# User-provided export trial — preparation only

No actual trial or operating ledger write has run. The earlier synthetic trial is consumed and is never reused. The new fixed identity is `user-export-shoe-selective-20261107-v1` / `attempt1`; owner and Supabase project remain the existing fixed administrator/project. The normal app ownership/artifact route is unchanged. Source kind is `user-provided-export`, server artifact relationship remains `unverified`; it is never claimed to be a successful server generation or synthetic fixture.

Exact input: Library `libfile_6757d82ad15c81918adacc1118e0f7dc`, file `file_00000000221c81fd98df126690638210`, PNG 1080×1920,3178610 bytes, SHA256 `fcfcf78a39244c84e36de3ea62f3459cf3776b0c1d0ed9818492e4eed8f52208`. No source image is in Git. Fixed integer ROI is x56,y0,width1024,height1536. Every transparent mask pixel must lie inside it. All other full-image RGBA tuples, including hidden RGB, are retained. No resizing, tiling, fallback request or complete-ad export transformation occurs. Output is the full1080×1920 PNG; saving/comparing/re-downloading these bytes costs no provider request.

The mask must be a full1080×1920 static binary-alpha PNG under4MB with a supplied exact SHA. The prompt and mask are not finalized/approved. Yellow annotation strokes and synthetic test coordinates are not a mask. Rear small shoe/leg and separate upper-right trousers are the intended targets; foreground product, text, price and contact protection must be reviewed against the actual pixels. Masked product/texture quality still needs a separately approved paid test.

## Commands in the environment containing the files

Use this repository and its locked installed dependencies (Node>=24, sharp, pg); no global setup, key transfer, DB connection string or production service startup is required for validation. Relative imports require the repository modules, not a standalone copied CLI. Minimum input files: original PNG, finalized full-size mask PNG, and local `input.json` containing exactly `ownerId`, `maskSha256`, `prompt`. No credentials in that JSON. Do not put image/input/evidence files in source Git.

```
node --experimental-strip-types experiments/selective-quality-once/user-export-cli.mjs --validate-only /absolute/original.png /absolute/mask.png /absolute/input.json
```

This command reads local bytes, verifies exact source contract, mask/owner/model/ROI, and prints a bound manifest/request hash with dispatchAuthorized:false. It never creates handoff or SQL or provider requests. No environment variables or API key are required. It cannot yet succeed for the user input without the final mask and prompt. The dot cloud can run it only if this source/dependencies are available there; availability is not established by this implementation.

```
node --experimental-strip-types experiments/selective-quality-once/user-export-cli.mjs --mock /absolute/synthetic1080.png /absolute/synthetic-mask.png /absolute/mock-input.json /absolute/new-evidence-directory
```

Mock allows locally synthesized input (clearly labeled local-mock-export), fixed trial identity and ROI. It emits SQL requests tagged LOCAL_POSTGRES_ONLY_DO_NOT_SEND_TO_MCP, and accepts the complete original response in the existing nonce/session/sequence/project/owner/trial/attempt/SQL-hash/response-hash envelope over stdin. Only the isolated PostgreSQL test harness may execute mock SQL. Never forward this mode to production. There is no --execute mode and nonsynthetic approved-trial handoff is rejected. No provider transport can be selected from this CLI.

## Shared invariants and gates

Both profiles share the existing SQL transaction implementation: global advisory lock, active admin check, all-history100000000 policy and enabled guard, combined existing budget/analysis holds, fixed request hash/revision and durable fresh claim. Source/mask/provenance/prompt/ROI/provider-binding hashes are part of the request fingerprint. Synthetic and user-export job/revision/claim prefixes remain distinct. Existing unknown holds are included; no customer usage confirmation occurs. Internal500000-micro reservation is not a provider charge cap.

Same live-process fresh response, exact writer XID committed proof, final matching inspection, exclusive fsynced dispatch marker and180s wall/monotonic/server window apply. Each handoff response has a60s nonextending limit. Lost fresh response or crash never restores dispatch authority by rereading files or the DB. Usage/response archives are fsynced before settlement; restored full-image copies are rederived and verified. Known cost is recorded once, conflicting settlement fails, unknown cost retains hold. No new DB tables/permissions/policy are introduced.

Live execution remains deliberately unavailable: final mask SHA and prompt approval, new paid-call approval, validated real-file preparation in the actual consumer, same environment's existing approved key binding (value never moved), current owner/policy/hold/unused-ID checks, and a reviewed real dispatch integration are still required. The existing key is known only in the development consumer; its presence in dot cloud has NOT been established. Do not move it or presume it exists. The earlier synthetic paid approval is exhausted. Adding a paid mode is a future reviewed change, not accomplished by setting a flag or editing input JSON.

## Validation

Isolated PostgreSQL17 uses a dedicated network-none container and Unix socket, not Supabase. New tests cover concurrent claims, consumed synthetic coexistence, shared-budget/owner denial, unknown hold/late settlement/conflicting cost, lost responses/restart, expiry and actual child stdin/stdout mock handoff. Byte tests cover provenance/hash rejection, disjoint selection, protected hidden RGB, fixed ROI/size and capability-copy rejection. Existing connector/parser/synthetic/preflight regressions are run alongside these. This is local/mock evidence, not hosted-connector or shoe-quality validation. Full domain/browser/mobile and production resource load are not revalidated by this preparation increment.

Final local validation:71 tests passed,0 failed,0 skipped across user-export,connector-ledger,parser,synthetic-once and preflight suites. The first71-test run had69 passes and2 expectation-type failures (Postgres bigint parser returned numeric61077/0 rather than strings); assertions were normalized to Number and the full71 rerun passed. After bounded CLI reads were added, the actual stdin/stdout PG mock CLI test passed again. Typecheck, web build, cloud consistency,isolation and diff checks passed. Independent read-only review found no new critical defect. These results do not authorize or validate a live user-photo request.
