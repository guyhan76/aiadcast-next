# Cumulative supplier budget cutover — operations checklist

Not activated by deployment. This is an internal estimate/hold limit, not a provider
billing hard cap. Never clear uncertain holds or rewrite historical spending.

## Preconditions

Verify exact source SHA and a working exact-SHA deployment route BEFORE pausing
admissions. Generic Render deploy targets its configured branch, which may differ.
Record current Live and remote SHA, policy/trigger absence or exact definitions,
table owners/RLS/grants, target UUID/role, all historical totals and other accounts'
allocation/wallet/budget aggregates. Store the minimal record privately in the
existing execution environment; do not export credentials/content or use Library.
Take no account-status API shortcuts: initialization/expiry can mutate records.

The historical analysis ledger is absent in the reviewed installation. User
confirmation plus blocked/closed historical CLI and zero-call evidence support
unused history. Only that verified case permits an EMPTY bootstrap, never a
fabricated zero-cost event. An existing relation requires inspection instead.

## Temporary pause

Use `cumulative-budget-cutover-install.sql`. If the historical table is absent,
combine the body of `cumulative-budget-unused-analysis-bootstrap.sql` and the
installer in ONE transaction, with the same advisory lock and users table lock
acquired first. Strip only the two templates' outer BEGIN/COMMIT statements;
never commit the bootstrap early. Validate the combined text locally first.

The installer refuses duplicate installation and missing account ledgers. It locks
users against concurrent signup, enumerates every existing account and installs
BEFORE INSERT guards on users/jobs/analysis plus a positive-held-increase guard on
budgets. Reads, existing login identities and late provider-cost updates remain
possible. New signup/generation may receive an error during this short window.
No amounts, roles, customer credits or existing holds are changed. No external
credentials or enduring access grants are added. A privileged manual DDL operator
can defeat triggers; this does not defend against database-owner tampering.

Verify manifest coverage, trigger function identity and enabled state read-only.
Do not test by making a paid request or creating a real account. Monitor existing
running/reserved image jobs, pending assistant/recommendation rows and recent
admission logs until no active work remains. Old uncertain rows remain held and
must not be treated as active provider execution without evidence. If active
outcomes cannot be established, do not restart; restore previous availability by
removing only the temporary pause after review, without changing monetary rows.

## Permanent policy and deployment

Under the existing advisory transaction lock: create the target empty policy table
from billing.sql, protect it with RLS/revoke direct public roles, verify account
identity/history, install `cumulative-budget-guard.sql`, then insert exactly one
all-history policy (100000000 microUSD, excluded=0). Read-only reconciliation must
match the pre-activation history; no historical rows are copied or reset. Keep
temporary pause through exact-SHA deployment and non-mutating verification.

The new source reads the policy freshly and replaces only that account's monthly
image allowance with cumulative availability. Other account budgets remain monthly.
Both permanent guards must exist before policy insertion. Missing analysis table or
unknown owner/cost state fails closed. New historical trial reservations for the
policy account are disabled even on old code. Existing late costs remain recordable.

Remove ONLY temporary guards using `cumulative-budget-cutover-remove.sql`, after
checking all target trigger identities and policy protection. Removal is atomic,
RESTRICT-based and refuses missing/mismatched objects. Repeated removal reports
absence, never deletes unrelated objects. Verify manifest schema absent and both
permanent guards still enabled. Do not claim live generation success without test.

## Failure / rollback

Each SQL transaction is all-or-nothing; after an error issue ROLLBACK on that same
session or ensure the connector closed the transaction before retry. Inspect uncertain
outcomes. Never blindly rerun a failed installer. Capture the exact remaining pause.
Before policy activation, remove newly created objects only if still empty and exact
reviewed definitions, using RESTRICT. After activation keep policy and permanent
triggers on code rollback: old code may reinstate its monthly block but must not
bypass cumulative reservations. Never restore a full old database to undo additive
DDL: that would discard newer costs/holds. A current recoverable backup is useful
for disaster recovery; the October 19 backup cannot represent November spending.

## Local evidence

Real isolated PostgreSQL 17 tests exercise advisory-lock timeout, atomic failed
installation, duplicate refusal, signup/new-schema exclusion, positive reservation
blocking, late-cost handling, removal and restart of mock reservations. The unused
analysis bootstrap is verified on both PGlite and PostgreSQL 17. No provider calls.
