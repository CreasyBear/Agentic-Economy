# Package 4 Formance operations

This runbook covers sandbox Account-AUD funding and managed-x402 Calls after
the Formance cutover. Formance is the sole authority for balances,
reservations, postings and reversals. Convex owns policy, Commitments,
Invocations, evidence, documents and operator cases.

Production funding and mainnet settlement remain disabled unless every
effective-dated approval and infrastructure control is current.

AWS account operation, the current restore result and production gates are
owned by `../operations/aws-foundation.md`. This runbook does not override them.

## Operating invariants

- Diagnose with durable `commandRef`, `transactionRef`, `commitmentRef`,
  `invocationRef`, `documentRef` and `caseRef` values. Never copy provider,
  Stripe, CDP, wallet or Cloudflare credentials into a case.
- Read exact Formance transaction references after an uncertain write. Never
  infer success from error text or metadata search.
- After x402 dispatch may have started, use status or reconciliation for the
  existing Invocation. Never create a replacement Invocation.
- Formance transactions and issued documents are immutable. Corrections append
  a named adjustment/reversal and a replacement document.
- Suspend only the affected Account, legal customer, treasury pool, Operation
  or obligation. Search and authoritative readback remain available.
- A Provider obligation settled by managed x402 is permanently ineligible for
  payout.

## Formance unavailable or Access denied

Signal: Gateway health fails, the Node Action reports
`formance_read_unavailable`, or Cloudflare rejects the service token.

1. Stop new funding, Commitments and managed dispatch. Preserve public search,
   status and exact-reference recovery.
2. Check Gateway, Ledger API, Ledger worker and PostgreSQL health through their
   private operational endpoints. Do not bypass Gateway or expose an origin.
3. Verify the configured environment and Access service-token identity without
   logging either secret value.
4. Restore the failed component. Then run schema-digest, health and one
   read-only exact-reference check before resuming entry.
5. Rotate a suspected service token, revoke its predecessor, and prove the old
   token fails closed.

## Schema or template drift

Signal: `formance_schema_drift`, `setup_required`, or the installed schema and
template digest differs from the pinned application requirement.

1. Keep financial entry suspended; do not use `force`, free-form Numscript or a
   second schema version as a bypass.
2. Compare the installed version/digest with the immutable checked-in schema.
3. Restore the approved image/configuration or deploy a separately reviewed
   schema change.
4. Re-run named-template, idempotency and exact-reference integration tests
   before resuming entry.

## Stale display snapshot

Signal: Funds, Spend or a document preview labels its Formance snapshot stale.

1. Do not use the snapshot to admit funding, inspection or invocation.
2. Refresh through the official Formance SDK cursor/balance read.
3. If live readback is unavailable, retain the last snapshot with its observed
   time and keep consequential entry suspended.

## Response lost after a Ledger write

Signal: the SDK request may have reached Ledger but no trusted response reached
the Node Action.

1. Preserve the original command and idempotency identity.
2. Read every exact Formance transaction reference expected for that command.
3. Finalize Convex idempotently only when all references match the original
   template, command digest and idempotency digest.
4. If all references are proven absent, the existing command may retry.
5. A partial, conflicting or unavailable read remains `outcome_unknown`; open
   one owned case and do not submit another write.

## Unknown managed-x402 payment

Signal: a Call reports `outcome_unknown` or `reconciliation_required` after the
submission fence.

1. Read current status for the existing `invocationRef`.
2. Verify its Formance reservation references and the persisted x402 attempt.
3. Independent settlement evidence may settle the existing reservation. Only
   proven pre-submission absence may release it.
4. Otherwise retain Account, Agent, exposure, treasury and obligation
   reservations and keep the case open.

## Stale price, challenge or Commitment

Signal: the Commitment expired or its Operation, authority, policy, x402
challenge, rate or ceiling digest changed.

1. Retain the refusal and original reference.
2. Reinspect the same Operation and input.
3. Present the replacement AUD price, source requirement, expiry and material
   unknowns.
4. Invoke only with the new Commitment. Never edit or extend the old one.

## Low or stale treasury

Signal: `treasury_capacity_unavailable` or custody evidence is stale.

1. Verify custody environment, generation, network, asset, evidence reference
   and observed time.
2. Record a fresh custody observation through the existing adapter.
3. Sync the named Formance treasury-capacity template from that evidence.
4. If custody and Formance differ, open a treasury-scoped case. Do not invent
   capacity or reduce the policy buffer.

## Account or exposure lock

Signal: a scoped discrepancy case blocks funding or paid Calls.

1. Stop entry only for the named Account or legal customer.
2. Compare exact Formance references with Stripe, Call and custody evidence.
3. Append a named adjustment/reversal when commercial truth requires it.
4. Resolve and unlock only with non-empty evidence references and a signed
   close. Never edit Ledger history or use a Convex balance fallback.

## Processor reversal or conflicting observation

1. Verify the webhook with the maintained Stripe adapter and locate the
   existing funding command.
2. Replay exact duplicate observations. A conflicting identity or amount opens
   one processor-scoped case and creates no booking.
3. Book a valid reversal through `FUNDING_REVERSED` using the original evidence
   linkage.
4. Issue a replacement statement if needed; retain the original document.

## Document job failure

1. Resume the existing workpool job from its stored cursor and frozen point in
   time; do not restart the period under a new identity.
2. Carry integer-string totals through every checkpoint.
3. If file storage succeeds but metadata persistence fails, delete the orphan
   file before retrying.
4. If a commercial correction is needed, post `BUYER_ADJUSTED` and issue a new
   linked document. Never mutate the old snapshot.

## Failed daily close

1. Keep the close open and suspend entry only for its named scope.
2. Compare the frozen Formance transaction set with Stripe, custody, x402,
   obligation and document evidence.
3. Record one operator-owned discrepancy case per differing scope.
4. Sign the close only after all required counts, totals, references and policy
   versions agree. Recovery/readback remains available throughout.

## Backup or restore failure

1. Suspend new financial entry immediately.
2. Retain status and exact-reference readback on the healthy authority.
3. Repair the managed PostgreSQL backup/PITR control and restore into an
   isolated stack.
4. Verify schema version, transaction references, balances and idempotent
   replays. Resume only after evidence meets RPO 5 minutes and RTO 60 minutes.
5. Keep the restored database and isolated Formance namespace until evidence is
   approved. Then run the checked-in exact-name Formance cleanup before the
   reviewed OpenTofu destroy plan. Never point the authoritative environment at
   the drill.

## Unsafe SDK range

Signal: an amount fails `Number.isSafeInteger`, cumulative shared-account flow
reaches A$1 billion at six decimals, or SDK exactness tests drift.

1. Refuse the write before SDK submission and suspend new financial entry.
2. Preserve readback and existing recovery workers.
3. Run the official SDK exactness matrix and vendor/architecture review.
4. Do not raise the limit, patch the SDK, parse raw responses or switch to
   direct HTTP/PostgreSQL access.

## Secret or diagnostic exposure

Contain the affected credential and record its scope without copying the value.
For production or value-bearing authority, suspend the affected path and rotate
through the owning system before resuming. For an explicitly accepted,
isolated synthetic or drill exposure, keep it gated from production and do not
retrieve or reuse it; rotate or destroy it only when Joel authorises that work.
Remove exposed diagnostics from circulation and retain references only.
