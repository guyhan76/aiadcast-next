# SQL connector feasibility — NOT ready for operational execution

2026-11-07. Injection-only local prototype. This turn made no production connection, reservation, settlement, provider call or schema change. Existing source HEAD e5093009965fbd91f1206ba9f5d268fad1c601b9 is unchanged.

## Established evidence

Prior read-only probe on authenticated Supabase project sxpzbfapbizlmsuqlrfu returned read_only=on and transaction-local marker in a single BEGIN/SELECT/ROLLBACK payload at 12:48:33.643448 UTC. It did NOT prove write commit acknowledgements or exactly-once transport.

Each mutation SQL is one explicit BEGIN/COMMIT payload with existing shared advisory lock; never split across calls. Fixed synthetic owner/job/attempt, all-history budget, external analysis costs and holds are preserved. No pg.Pool emulation, schema changes or credentials. No production executor is wired.

Known cost settlement is now independent of terminal delivery: expired/released jobs do not revive, their pending cost settles once, unchanged retries do not double-count. Already settled attempts with a changed late cost fail closed, matching BillingLedger.settleAttempt; do not manufacture a correction or subtract another job's hold. Customer release/expiry does not reclaim the supplier hold in BillingLedger. Corrupt or independently modified per-attempt hold accounting cannot be reconstructed from aggregate budgets; require reconciliation rather than infer a new hold.

connector-once.mjs strictly parses the observed MCP envelope, generates a fresh nonce internally, requires the original newly-claimed response plus separate committed-state inspection, consumes an exclusive fsynced local marker, then performs a final inspection before dispatch. Lost/malformed original response stops before any recovery. No persisted receipt reload or permission restoration. Exceptions after dispatch are uncertain with no retry. The execution callback is injected; no real API transport exists here. A local marker is not an environment-loss backup.

## Final tests

Command: AIADCAST_SELECTIVE_PG_SOCKET=/tmp/aiadcast-selective-pg-socket node --experimental-strip-types --test --test-concurrency=1 tests-domain/selective-connector-ledger.test.mjs tests-domain/selective-quality-once.test.mjs

25 passed, 0 failed/skipped (17 connector plus 8 existing runner), isolated cached PostgreSQL17, network none, Unix socket only. Includes concurrent independent connections, response loss, restart, uncertainty, malformed/foreign/old responses, nonce mismatch, marker failure, cancellation during marker await, late cost, replay and budget preservation. The former expired-cost defect-reproduction test now asserts corrected successful settlement without revival.

An initial combined parallel-file run failed 14 tests from shared fixture user primary-key collisions; a fresh isolated DB and file serialization resolved it. In-test multi-connection races remain concurrent. No test was removed. Syntax and diff checks passed. Independent reviewer /root/selective_review re-read the final marker->inspection change and confirmed the fix; reviewer did not execute tests.

## Remaining operational blockers

- Management API Beta contract does not establish write acknowledgement, retry or independent committed-session visibility. Actual response parser is tested against observed read-only envelope plus mock, not production mutation responses. A SELECT before COMMIT is not proof of successful commit. Ambiguous responses stop permanently; never infer permission from later reads.
- Final DB read and external HTTP call are not atomic. Cancellation/owner changes immediately after final inspection remain possible. Do not claim zero-race execution. Establish a reviewed dispatch lease/state protocol or controlled single-writer trial window before use; this turn does not authorize operational controls.
- Existing persisted costs conflicting with later evidence need explicit reconciliation. No automatic cost adjustment is implemented or permitted.
- Result/usage evidence and reviewed settlement must be orchestrated separately; no end-to-end operational connector runner is enabled.

No operational execution plan is approved by these tests. The existing one-call trial remains unused. The four protocol source/test/documentation files are intended for the approved private development branch only; no deployment or secret movement.

## Concrete writer and contract analysis (preservation review)

- Actual observed execute_sql envelope is a text result containing rows; it has no transaction ID, COMMIT command tag, or documented assertion that this payload committed before the response was returned. Multi-statement SELECT/COMMIT return shape and independent-request visibility have only been tested with local pg, not the hosted connector. A successful string is insufficient. An authorized connector write/commit plus a separate read of a harmless isolated marker would provide empirical evidence, not an exactly-once guarantee; no such production write was performed or requested here. No extra credentials are necessary. Whether hosted connector retries a whole SQL payload is unspecified; fixed DB job identity makes a second claim return newly_claimed=false.
- Existing normal expiry writer: server/cloud/generation-base.mjs:153 status() invokes ledger.expire(); billing-base.mjs:178 selects all unexpired-policy jobs whose expires_at <= now and status is reserved/running/uncertain/ready, then releases uncaptured jobs. It includes the synthetic job even without generation_records. This changes customer job state, NOT the provider hold or attempt. The synthetic expiry is 24 hours after claim and orchestration allows only 10 seconds; ordinary expiry is therefore not reachable in the normal immediate run. Clock discontinuity or resumption beyond that window must remain fail-closed.
- Ordinary reject at generation-base.mjs:467 requires job() and ready/rejected. job():175-180 requires generation_records, absent for this synthetic fixture. It cannot normally cancel this running synthetic trial. Restart recovery at lines65-74 joins generation_records and likewise excludes it. Thus the mocked terminal transition is a defensive test, not evidence that ordinary user rejection can race this trial. Direct ledger.release (billing-base.mjs:152) could affect it if separately invoked with its owner/ID; no normal synthetic cancellation endpoint is currently implemented.
- Nonatomic DB/HTTP alone does not imply duplicate calls: fresh nonce, fixed persistent job, original receipt and consumed marker prevent normal replay. The actual unresolved loss case is provider response arriving then process loss before durable usage/result evidence and settlement. The reservation must remain uncertain; never replay or zero it. connectorOnce deliberately does not yet compose the existing evidence store and settlement protocol. This integration can be implemented locally without schema/permission changes, but its hosted transport precondition remains unverified, so further operational integration is paused.
- Any strict guarantee against arbitrary concurrent operator mutation/owner disabling at the dispatch instant requires a defined operational policy or server-side lease honored by those writers; a local last-read cannot provide it. No such operational changes are authorized or proposed as implicitly necessary for ordinary expiry/reject in the 10-second synthetic run.

Read-only preflight regression: 5 passed separately. No live connection or provider call. No real crash/hosted transport fault injection was performed. Further local development cannot prove the missing hosted COMMIT/result contract. Smallest next step is to establish the connector's documented full-payload completion/result semantics with the provider; alternatively separately authorize a narrowly scoped, nonfinancial isolated commit/read probe, with an exact target and cleanup policy reviewed first. Neither requires paid image calls; no probe writes are currently authorized.

## Follow-up: local evidence and XID prototype (supersedes incomplete local integration notes above)

Base remote remains 4c55344572c1b4bed879347dc246730235a41b35. New connector-evidence.mjs connects in-memory outcomes to exclusive fsynced receipt/image/composite evidence and read-first reconciliation. Usage is recalculated by imageUsageCost and must match the adapter estimate; invalid/missing usage is unknown, never zero. Archive start/end markers prevent recovery while an archive is incomplete. Crash without a finished marker keeps the hold, requiring separate evidence review rather than automatic resumption. No recovery function can call a provider.

Claim now returns its writer XID; a separate READ ONLY pg_xact_status query must report that exact XID committed with the fresh nonce, followed by matching persistent claim inspection. Original claim response loss still permanently denies dispatch. Known-cost settlement similarly returns its writer XID, saved in local connector-settlement-ack.json. Reconciliation requires that matching local acknowledgement and committed proof before reporting final settlement. If the settlement response was lost, later observed completed cost is settlement-unverified and is NOT rewritten. Conflicting cost is never overwritten. Concurrent local acknowledgement writers may leave an uncertain outcome; subsequent reads can use the first intact durable acknowledgement.

No new DB audit event/schema was introduced for settlement proof. An intermediate attempt at a zero-credit audit row failed existing CHECK(credits>0); it was removed, not worked around with fictitious credit changes. Current final tests use original schema. The initial 1-credit dispatch marker from the already-preserved protocol remains unchanged.

Final command (sequential files, concurrent connections within tests):
AIADCAST_SELECTIVE_PG_SOCKET=/tmp/aiadcast-selective-pg-socket node --experimental-strip-types --test --test-concurrency=1 tests-domain/selective-connector-ledger.test.mjs tests-domain/selective-quality-once.test.mjs tests-domain/selective-quality-preflight.test.mjs
Result: 42 passed, 0 failed/skipped (29 connector/evidence/XID, 8 existing runner, 5 preflight). Includes injected fsync/write failure, partial receipt, missing image/usage, concurrent evidence consumers, lost settlement response, differing cost, archive-in-progress, and PostgreSQL in-progress/aborted/committed XIDs. Crash boundaries are mock/injection tests, NOT physical power-loss durability or hosted fault-injection tests.

Production READ ONLY metadata query confirmed pg_current_xact_id() and pg_xact_status(xid8) exist and current connector role has EXECUTE on both. Neither function was invoked in production; no writer XID was allocated. Hosted canary, production reservations/settlements and all actual provider calls remain unexecuted.

### Proposed smallest canary — NOT executed, requires scoped execution approval

Target: authenticated project sxpzbfapbizlmsuqlrfu, PostgreSQL built-in transaction status only. No application table, column or row is touched. Before each separately authorized execution, generate one fresh cryptographically random 16-byte nonce encoded as exactly 32 lowercase hexadecimal characters (for example, randomBytes(16).toString('hex')). This is the same format required by commitProofSql. Never reuse the former fixed example label or a nonce from an earlier attempt. The placeholders below are templates, not executable values; no nonce or XID is generated by this documentation change.

```sql
BEGIN;
SELECT '<fresh-32-lowercase-hex-nonce>'::text AS nonce,
       pg_current_xact_id()::text AS writer_xid;
COMMIT;
```

Validate the returned nonce against the fresh nonce retained for this one execution. Use commitProofSql(exactReturnedWriterXid, sameFreshNonce) to construct the follow-up, with its positive-decimal xid8 validation. After the exact nonce and one decimal writer_xid are returned, substitute that returned XID only into a separate request (do not use a guessed/stale XID):

```sql
BEGIN TRANSACTION READ ONLY;
SELECT '<fresh-32-lowercase-hex-nonce>'::text AS nonce,
       '<exact-returned-writer-xid>'::xid8::text AS writer_xid,
       pg_xact_status('<exact-returned-writer-xid>'::xid8) AS commit_status;
ROLLBACK;
```

Only exact nonce/XID and committed pass. Null, in progress, aborted, malformed or lost response stops; do not issue a second writer request. No cleanup row exists; XID allocation cannot be undone and is ordinary small DB transaction overhead. Requires existing query privilege and EXECUTE only, no new grants. No provider/image charge; database resource consumption is nonzero and plan-dependent, not a guaranteed billing quote. No customer budget/hold/credits change. This checks hosted transaction completion observation, NOT application-row visibility or a universal exactly-once transport promise. A real claim still requires all identity/budget/one-shot gates. No canary was run this turn.

## Hosted canary parser correction and read-only confirmation

The single authorized writer canary returned nonce 0610751fb7b577983bdc1e40f488eff4 / XID8644. The old parser failed because the warning prose mentions the same opening delimiter. No writer retry or provider call occurred. The original response remains unchanged outside git at /workspace/selective-trial-evidence/connector-canary-20261107/result.json (SHA256 213fc675db5361651189750cded2b9a2ca63c7095c0e6ed87c3d755b85f2e5f6). The source fixture contains exactly its response object, no secrets.

Parser now recognizes standalone delimiter lines only, allows the exact observed warning prefix/suffix or a bare body, and rejects duplicates, malformed/mismatched delimiters, unknown prose, extra JSON/data, multiple/invalid rows, isError and unexpected content. It never executes warning prose. Caller separately checks exact nonce and XID. Independent reviewer verified original-response fixture equality and independently ran all nine parser tests successfully.

After offline original-response verification, one separately authorized READ ONLY query inspected existing XID8644 and returned committed with the exact nonce. The corrected parser and caller assertions verified it. No new writer XID was requested, no application/ledger/DDL/permissions changed, no provider call. The proof response is preserved outside git as readonly-proof.json in the same evidence directory. This proves this canary's completion only, not a perpetual connector guarantee or a successful image trial.

Final regression: 51 passed, 0 failed/skipped, --test-concurrency=1 across selective-connector-parser, selective-connector-ledger, selective-quality-once and selective-quality-preflight. Includes 9 parser tests plus previous42. Isolated PostgreSQL container stopped. Paid one-image trial remains unused. Parser changes remain local pending preservation instruction.
