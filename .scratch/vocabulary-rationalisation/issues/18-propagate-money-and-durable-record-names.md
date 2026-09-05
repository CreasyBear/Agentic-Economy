# Propagate names through money and durable records

Type: task
Label: wayfinder:task
Mode: AFK
Status: open
Assignee: Luna Max / refactor_money_durable
Assigned role: Luna Max / money, audit, queue and durable-record implementation owner
Parent: ../map.md
Blocked by: 08, 10, 11, 12, 13, 14, 15, 16, 29, 30

## Outcome

After the Tool, Provider, Quote and paid Call schema checkpoints, propagate
the accepted AE-owned Tool/Quote/Call names through the remaining money,
qualified-use, audit, provider-consequence and queue records. Update the
listed validators, indexes, codecs, events, readers, writers, fixtures and
queued arguments together. Preserve every financial role, amount and unit,
effect identity, idempotency/replay rule, authority attribution, uncertainty
state, signature and external financial/protocol namespace.

This ticket owns the durable-money links that remain after issue 16's
mechanical Call pass. It does not rename the money, qualified-use, audit or
journal tables, turn qualified evidence into generic Outcome records, or
invent a migration/compatibility layer. Issue 16 is the serialized owner of
the Call table and paid lifecycle; this worker takes the money/audit/queue
slices only after those target paths exist.

## Fixed mappings

| Existing AE-owned field or index | Replacement | Rule |
| --- | --- | --- |
| Paid `invocationRef` link | `callRef` | Apply only to a purchased Call link in the listed money/durable records. Generic Action execution and unrelated invocation identities remain unchanged. |
| Paid `commitmentRef` link | `quoteRef` | Apply only to the customer Quote/Call booking boundary after issue 15; preserve Quote identifier bytes. |
| AE-owned Tool `operationRef` link | `toolRef` | Apply only where the record points to the admitted/published Tool. Do not rewrite upstream/protocol payload keys or arbitrary provider input. |
| `moneyProviderObligations.by_invocationRef` | `by_callRef` | Rename the paired durable field/index only; preserve Provider obligation role and all other exact indexes. |
| `moneyUsageEvents.by_invocationRef` | `by_callRef` | Rename the paired Call usage link/index; preserve `serviceRef` as portfolio Service and `operationKey` as the protected financial/idempotency key. |
| `qualifiedUseReceipts.by_invocationRef` | `by_callRef` | Rename the paired Call evidence link/index; preserve qualified-use identity and delivery-evidence purpose. |
| `qualifiedUseReceipts.by_operationRef_and_qualifiedAt` | `by_toolRef_and_qualifiedAt` | Rename only the AE-owned Tool link/index; preserve evidence ordering and timestamps. |
| `sellerOnboardingCanaryRearmAudits.invocationRef` and `by_invocationRef` | `callRef` and `by_callRef` | Keep the table name and append-only seller-canary audit role; preserve work IDs, prior attempt/effect identity, refusal provenance and rearm evidence. |
| `providerConsequenceJournal.invocationRef` | `callRef` | Keep the authority-provenance journal and all five existing indexes; preserve ticket/effect/command identity and replay behavior. |
| `providerConsequenceJournal.operationRef` | `toolRef` | AE-facing Tool link only. The `provider-consequence:v1` ticket-claims encoder retains its protected canonical keys/bytes through the existing boundary. |
| `QualifiedUseIdentity.invocationRef` | `callRef` | Source type/link rename only; preserve the `qualified-use:v1` identity string format and output bytes. |
| `QualifiedUseMaterial.operationRef` | `toolRef` | Source type/link rename only; project to the existing canonical digest material before hashing. |
| `FormanceManagedCallBooking.invocationRef`/`commitmentRef`/`operationRef` | `callRef`/`quoteRef`/`toolRef` | Update the AE-facing booking and callers while preserving the existing managed-call command/reservation canonical material. |
| X402 payment attempt `operationRef` when it is the AE Tool link | `toolRef` | Preserve x402 challenge, requirement, payment, signature, network, asset, `payTo` and protocol fields verbatim. |
| X402 payment attempt `dispatchRef` | `dispatchRef` | This remains the payment-attempt dispatch identity. A caller may pass the paid Call identity only where the existing source proves that boundary; do not rename it to `callRef` or add an alias. |
| Queue payload/context paid `invocationRef` | `callRef` | Update only the paid Call link in Workpool enqueue/context and audit writes after issue 16; preserve `workId`, lease, effect-generation and idempotency identity. |

The physical tables and their roles remain:

- `moneyProviderObligations`, `moneyUsageEvents`,
  `moneyX402PaymentAttempts` and `qualifiedUseReceipts` retain their names.
- `sellerOnboardingCanaryRearmAudits` remains an append-only seller-canary
  rearm proof, not an Outcome, Call or purchase table.
- `providerConsequenceJournal` remains an authority-provenance journal, not a
  generic execution or purchase table.
- `capabilityCallProjections` is the post-16 Call projection. Its
  `deliveryState`, `paymentState` and optional `providerObligationState` are
  separate; this ticket must not merge them or rename them to purchase status.

## Exact durable field and index scope

The following index sets are complete for the owned physical slices. Preserve
every index not explicitly mapped; do not add a lookup merely because a field
was renamed.

### Money schema slices

In `src/modules/money/internal/convex-schema.ts`:

- `moneyProviderObligations`: rename the paid Call `invocationRef` field to
  `callRef`, its `operationRef` Tool link to `toolRef`, and
  `by_invocationRef` to `by_callRef`. Keep
  `by_obligationRef`, `by_buyerAccountRef_and_createdAt`,
  `by_providerRef_and_createdAt` and `by_providerRef_and_state`; preserve
  accrued/held/payable/settled/reversed/disputed state and payout eligibility.
- `moneyUsageEvents`: rename the paid Call `invocationRef` field/index to
  `callRef`/`by_callRef`. Keep
  `by_principalId_and_credentialId_and_currency_and_observedAt`,
  `by_businessId_and_observedAt` and `by_usageRef`; keep `serviceRef`,
  `operationKey`, charge states, amount units, transaction refs and identity
  fields unchanged.
- `moneyX402PaymentAttempts`: rename only an AE-owned Tool link
  `operationRef` to `toolRef` where the source confirms that meaning. Keep
  `by_attemptRef_and_effectGeneration`, `by_custodyRef`,
  `by_authorizationDigest`, `by_paymentIdentifier` and
  `by_state_and_paymentAuthorizationExpiresAt`; keep `dispatchRef`,
  `attemptRef`, `effectGeneration` and all x402/payment material unchanged.
- `qualifiedUseReceipts`: rename `invocationRef`/`operationRef` to
  `callRef`/`toolRef` and the two paired indexes above. Keep
  `by_qualifiedUseRef` and `by_businessId_and_qualifiedAt`, the
  `qualifiedUseRef` identity, ADR-034 delivery-evidence role and all
  publication/contract/binding/evidence references.

In `src/modules/money/public.ts`,
`src/modules/money/internal/charge-contract.ts` and
`src/modules/money/server.ts`, update only the public/internal money views
that carry the same paid Call links (for example the accepted Call charge and
credit activity projection) after issue 16. `serviceRef`, `offeringRef`,
`businessId`, `operationKey`, `attemptRef`, amount/currency/exponent and
`chargeState` remain their existing meanings. Funding-only `MoneyRefusal.nextAction`
is not the Suggested next action family in issue 17.

### Durable audit, journal and queue slices

In `src/modules/capability-execution/internal/convex-schema.ts` and the
post-16 shared schema exports, issue 18 owns only the following portions:

- `sellerOnboardingCanaryRearmAudits`: `invocationRef`/`by_invocationRef`
  become `callRef`/`by_callRef`; `by_auditRef` and `by_canaryRef` remain exact.
  Preserve `priorWorkId`, `rearmedWorkId`, `priorAttemptRef`, effect/control/
  attempt/rearmed digests and refusal provenance. An embedded `nextAction`
  in refusal provenance is audit provenance text, not a second executable
  Suggested next action.
- `providerConsequenceJournal`: row/API `invocationRef` becomes `callRef`
  and AE-owned `operationRef` becomes `toolRef`. Preserve
  `by_ticketRef`, `by_effectRef`, `by_commandId`, `by_claimRef` and
  `by_state_and_expiresAt`, together with `ticketRef`, `effectRef`,
  `commandId`, state, lease/effect/authority/provider/account/credential/
  secret/payment refs and observation evidence. Do not put provider/payment
  secret material in observations.
- `convex/lib/operationInvocations/dispatch.ts` → the post-16
  `convex/lib/callLifecycle/dispatch.ts`: update paid Call refs in Workpool
  enqueue arguments/context, seller-canary rearm writes, outcome events and
  durable projection handoffs. Preserve action/work IDs, leasing,
  cancellation, retries, effect generation and exactly-once/replay guards.
- `convex/marketDispatchWorkpool.ts`: touch only an exact paid Call payload
  field if the issue 16 target requires it; retain the existing Workpool
  wrapper and component boundary.

`convex/schema.ts` and `src/modules/capability-execution/schema.ts` are shared
post-15/16 schema boundaries. The worker may update the two audit/journal
slices and their exported index expectations here, but issue 16 remains the
sole owner of the Call table/export rename. Do not edit generated artifacts.

## Exact owned file mapping

All paths are literal. A path followed by a target is a serialized handoff,
not permission to edit another issue's whole module.

### Money, payment and qualified-use source

- `src/modules/money/internal/convex-schema.ts` (money table fields/indexes
  above; table names stay unchanged)
- `src/modules/money/formance-workflows.ts`
- `src/modules/money/internal/charge-contract.ts`
- `src/modules/money/internal/delivery.ts`
- `src/modules/money/public.ts`
- `src/modules/money/server.ts`
- `convex/moneyManagedCall.ts`
- `convex/moneyManagedCallLifecycle.ts`
- `convex/moneyProviderObligations.ts`
- `convex/moneyX402PaymentAttempts.ts`
- `convex/moneyX402PaymentAttemptsShared.ts`
- `convex/moneyX402PaymentAuthorization.ts`
- `convex/moneyX402PaymentObservation.ts`
- `convex/moneyX402PaymentRead.ts`
- `convex/qualifiedUse.ts`

### Audit, journal and queue source

- `src/modules/capability-execution/internal/convex-schema.ts` (only the
  `sellerOnboardingCanaryRearmAudits` and `providerConsequenceJournal`
  slices; issue 16 owns the Call tables)
- `src/modules/capability-execution/schema.ts` (only corresponding shared
  schema export/index expectations after issue 16)
- `convex/schema.ts` (only corresponding audit/journal table wiring after
  issue 16; no generated output)
- `convex/capabilityProviderConsequenceJournal.ts`
- `convex/lib/operationInvocations/dispatch.ts` →
  `convex/lib/callLifecycle/dispatch.ts` (only money/audit/queue slices after
  issue 16's helper-family move)
- `convex/marketDispatchWorkpool.ts` (only an exact paid Call payload field,
  if required; no Workpool infrastructure change)

### Owned and shared tests

- `tests/unit/schema/money-schema.test.ts`
- `tests/unit/schema/convex-schema.test.ts` (money indexes plus the exact
  seller-canary/journal indexes)
- `tests/integration/money-formance-boundary.test.ts`
- `tests/unit/convex/money-managed-call.test.ts`
- `tests/unit/convex/money-x402-payment-attempts.test.ts`
- `tests/unit/capability-execution/jit-provider-consequence.test.ts`
- `tests/unit/capability-execution/provider-consequence-bridge.test.ts`
- `tests/unit/capability-execution/provider-consequence-http.test.ts`
- `tests/unit/capability-execution/seller-onboarding-canary.test.ts`
- `tests/unit/convex/capability-operation-worker-charge.test.ts` →
  `tests/unit/convex/capability-call-worker-charge.test.ts` (issue 16 owns
  the file move; issue 18 owns only money assertions)
- `tests/unit/convex/capability-operation-worker-reconcile.test.ts` →
  `tests/unit/convex/capability-call-worker-reconcile.test.ts` (same slice)
- `tests/unit/convex/capability-operation-work-completion.test.ts` →
  `tests/unit/convex/capability-call-work-completion.test.ts` (qualified-use
  and money handoff assertions only)
- `tests/integration/capability-operation-workpool.test.ts` →
  `tests/integration/capability-call-workpool.test.ts` (queue/audit/money
  assertions only)
- `tests/unit/convex/capability-operation-call-projection.test.ts` →
  `tests/unit/convex/capability-call-projection.test.ts` (delivery/payment/
  Provider-obligation separation only)
- `tests/unit/convex/capability-operation-recovery.test.ts` →
  `tests/unit/convex/capability-call-recovery.test.ts` (recovery money and
  queued-reference assertions only)

Issue 16 owns the paid Call file/test moves and all non-money lifecycle
semantics. The target test paths above are shared serialized slices, not a
second worker's rename claim. No generated file is an owned path; issue 22
owns the generator checkpoint.

## Protected names, bytes and protocol boundaries

The worker must use the existing encoders/decoders at their current
boundaries. Before/after literals from the named existing tests must prove the
following remain byte-stable:

- Formance command/reservation canonical material:
  `ae.formance-managed-call:v1` and
  `ae.formance-managed-call-reservation:v1`, including canonical key order,
  `operation_digest`, `call_digest`, amount/asset/account namespaces,
  `idempotencyKey` and transaction/evidence references. If new source fields
  would otherwise alter the bytes, project them back to the old canonical
  keys at this existing encoder only; record the literal vectors and obtain
  coordinator review before changing that boundary.
- Qualified-use identity/material:
  `qualified-use:v1` and `ae.money.qualified-use-material:v1`, their key order,
  `qualifiedUseRef` inputs, evidence/response hashes and ADR-034 records.
  `qualifiedUseReceipts` remains qualified delivery evidence, not a generic
  Outcome record or purchase object.
- Provider consequence material:
  `provider-consequence:v1`, its ticket-claims canonical material and
  `ticketClaimsDigest`; preserve `invocationDigest`, `operationKeyDigest`,
  authority/attempt/effect digests, signatures and secret/payment references.
  Use the existing journal codec projection for new AE-facing field names; do
  not create a compatibility mapper.
- Call/Quote/authority material owned by issues 15/16, including
  `operation-invocation-attempt:v1`, `operation-invoke-authority:v1`,
  `current_operation_commitment:v1`, `ae.operation-commitment:v1`, opaque
  identifier prefixes and their vectors, must pass through unchanged.
- `operationKey`, `operationKeyDigest`, external transaction/payment IDs,
  financial namespaces (`calls:`, Provider-obligation and treasury/legal-
  customer namespaces), amounts, currency/exponent, payment signatures,
  OAuth fields, MCP methods, OpenAPI `operationId` and x402 fields are
  protected. An `operationRef` key inside opaque x402 or Provider input JSON
  is not recursively transformed.

The required canonical projection is deliberately narrow: only an existing
Formance, qualified-use or provider-consequence encoder may map a renamed
source field to its protected historical key. No general canonicalization,
recursive compatibility layer or new digest definition is admitted. If a
second competing digest definition is discovered, stop and raise one bounded
structural issue for coordinator review; do not consolidate it silently.

## Explicit exclusions

Do not:

- Rename the physical money, qualified-use, seller-canary or provider-journal
  tables; merge them into Calls, Purchase resolution or Outcome records; or
  create a new purchase/outcome/status table or index.
- Rename generic `principals`, `accounts`, `businesses`, `operationKeys`,
  financial tables/namespaces, Convex component internals, generic Action
  execution tables/fields/queues or unrelated `invocationRef` values.
- Change amounts, currency/exponent, charge/payment/settlement/refund/
  delivery/Provider-obligation states, payout/refund rules, obligation
  attribution, seller/payment-recipient distinctions or evidence retention.
- Rewrite arbitrary Provider/Tool arguments, selected x402 requirements,
  challenge/payment JSON, OAuth/MCP/OpenAPI values, signatures, hashes,
  canonical strings or external financial records. Do not add legacy aliases.
- Take ownership of issue 13/14/15/16 definitions, public HTTP/MCP contracts,
  CLI/discovery/plugin instructions, generated artifacts, screens,
  deployment/cutover or historical data migration. Those owners receive
  explicit handoffs.
- Rename `dispatchRef` without source proof that it is only an AE Call link,
  change Workpool/Convex infrastructure, add a custom migration/checker/
  tracking framework, add a dependency or replay external financial effects.

## Dependencies and sequencing

- Baseline 08 and reviews 29/30 are dispatch gates. Issues 10–12 establish
  identity/execution/authorization boundaries; issue 13 establishes Tool
  fields; issue 14 establishes Provider fields; issue 15 establishes Quote
  fields; issue 16 establishes `capabilityCalls`,
  `capabilityCallProjections`, `callRef`/`quoteRef`/`toolRef` and the
  `callLifecycle` helper path. This ticket must not run against a partial
  schema.
- Issue 16 performs its mechanical money/journal caller updates first. This
  ticket then completes the listed financial and durable semantics. Shared
  `convex/schema.ts`, capability schema and queue writers are serialized; no
  independent green halves are promised.
- Issue 22 owns the existing Convex/router/CLI/public generation route and
  must run its approved generation checkpoint after the source/schema rename.
  Do not edit `_generated` here. Issues 19–21 and 23–28 consume the final
  source contracts; issue 17 consumes the qualified/outcome facts without
  changing their durable table role.
- Local clean data, live QA, hosted cutover and Package 6/7 remain held by
  issues 31–36. This ticket performs no data reset, deployment or financial
  operation.

## Verification commands and expected results

Run only after issues 15/16 and the generator checkpoint prerequisites exist,
with Node 22 and npm 11.5.1 through the project runner:

```sh
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm exec vitest run \
  tests/unit/schema/money-schema.test.ts \
  tests/unit/schema/convex-schema.test.ts \
  tests/unit/convex/money-managed-call.test.ts \
  tests/unit/convex/money-x402-payment-attempts.test.ts \
  tests/unit/capability-execution/jit-provider-consequence.test.ts \
  tests/unit/capability-execution/provider-consequence-bridge.test.ts \
  tests/unit/capability-execution/provider-consequence-http.test.ts \
  tests/unit/capability-execution/seller-onboarding-canary.test.ts \
  tests/unit/convex/capability-call-worker-charge.test.ts \
  tests/unit/convex/capability-call-worker-reconcile.test.ts \
  tests/unit/convex/capability-call-work-completion.test.ts \
  tests/unit/convex/capability-call-recovery.test.ts \
  tests/unit/convex/capability-call-projection.test.ts \
  tests/integration/money-formance-boundary.test.ts \
  tests/integration/capability-call-workpool.test.ts \
  --no-file-parallelism
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run typecheck
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run test:types
git diff --check -- \
  src/modules/money/internal/convex-schema.ts \
  src/modules/money/formance-workflows.ts \
  src/modules/money/internal/charge-contract.ts \
  src/modules/money/internal/delivery.ts \
  src/modules/money/public.ts \
  src/modules/money/server.ts \
  convex/moneyManagedCall.ts \
  convex/moneyManagedCallLifecycle.ts \
  convex/moneyProviderObligations.ts \
  convex/moneyX402PaymentAttempts.ts \
  convex/moneyX402PaymentAttemptsShared.ts \
  convex/moneyX402PaymentAuthorization.ts \
  convex/moneyX402PaymentObservation.ts \
  convex/moneyX402PaymentRead.ts \
  convex/qualifiedUse.ts \
  convex/capabilityProviderConsequenceJournal.ts \
  convex/lib/callLifecycle/dispatch.ts \
  convex/marketDispatchWorkpool.ts \
  src/modules/capability-execution/internal/convex-schema.ts \
  src/modules/capability-execution/schema.ts \
  convex/schema.ts
```

Expected results:

- Every listed money/audit/journal field and paired index round-trips through
  the post-15/16 schemas with no stale paid `invocationRef`, `commitmentRef`
  or Tool `operationRef` in the owned surface. Generic execution refs remain
  separate.
- Schema tests report exactly the mapped index names; no unlisted index is
  added. `sellerOnboardingCanaryRearmAudits` and
  `providerConsequenceJournal` retain their table roles and all exact
  non-mapped indexes.
- Formance bookings/reservations preserve amount equations, legal-customer/
  treasury/provider obligation attribution, idempotency and canonical vector
  bytes. Repeated recovery/replay does not duplicate a charge, payout,
  provider effect or queue work item.
- X402 attempts preserve dispatch/attempt/effect identity, payment uncertainty,
  signatures and protocol JSON. Qualified-use receipt identity/digest and
  evidence attribution remain stable. Provider consequence ticket claims,
  authority provenance and secret redaction remain stable.
- Call `deliveryState`, `paymentState`, Provider-obligation state, Charge,
  payout, refund and purchase-resolution presentation remain distinct. No
  terminal failure becomes success and no new purchase object appears.
- Focused tests, typecheck, test-type check and whitespace checks pass. The
  existing baseline (`test:ts-standards` 26 findings; unit/integration/type
  checks recorded by issue 08) remains separate evidence. Code generation is
  handed to issue 22 and is not performed while preparing this ticket.

No commands are run during ticket preparation; this ticket records source
evidence and future proof requirements only.

## Acceptance

- [ ] The listed money, qualified-use, audit, journal and queue sources,
      schemas, indexes, codecs, callers and tests are updated as one coherent
      post-15/16 patch, with no deferred broken paid Call callers.
- [ ] Paid Call/Quote/Tool links use `callRef`/`quoteRef`/`toolRef` only at
      the stated AE-owned boundaries; generic IAM, Action execution,
      portfolio Service and protected operation keys remain distinct.
- [ ] All exact mapped indexes round-trip and all unmapped indexes/table names
      remain unchanged, including both `sellerOnboardingCanaryRearmAudits`
      and `providerConsequenceJournal` index sets.
- [ ] Financial amounts, roles, charge/obligation/payout/payment/delivery
      states, idempotency, effect identity, uncertainty and replay/recovery
      behavior are unchanged; no duplicate external financial effect occurs.
- [ ] Qualified-use, Formance and provider-consequence protected canonical
      vectors are byte-stable through the existing narrow encoder boundaries;
      opaque protocol/provider inputs are preserved verbatim.
- [ ] Focused tests, typecheck, test-type check and whitespace checks pass;
      generated output, local/hosted data, deployment and Package 6/7 status
      are handed off without mutation.

## Closure evidence

Attach the reviewable changed-path list and old→new field/index/table-role
classification, schema/index receipt, money round-trip and amount-boundary
receipt, queue/audit/journal replay proof, qualified-use/Provider-consequence
redaction proof, and literal before/after protected-vector output from the
existing tests. Name the issue 16 Call-schema handoff and issue 22 generation
checkpoint separately. Record the current known baseline inconsistency in
`convex/moneyProviderObligations.ts` (an old projection/table reference next
to a `by_callRef` read) as a post-16 reconciliation item, not as a preparation
fix. If `dispatchRef` or a protected encoder cannot be classified from source,
stop with that exact bounded decision for coordinator review; do not invent a
new field, mapper or compatibility API. Do not claim data reset, deployment,
live acceptance or Package 6/7 completion from this ticket.
