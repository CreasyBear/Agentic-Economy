# Propagate names through money and durable records

## Storage SOURCE ACCEPTED — 2026-09-07, eight of ten groups

Independent oversight confirmed closure of the sole recorded storage return dependency. Prior indexed-link/predicate review,22/22schema/import checks, scoped checks and native dry-run/generation plus4/4type tests were already satisfied. Accepted Tool/Quote/Call/Money producers and exact five-suite29/29PASS (`/tmp/ae-money-storage-return-20260907.log`) resolve the seven remaining Workpool/managed-booking failures. No earlier storage review item remains. Formal source acceptance8/10; Group9 Public implementation and Group10 current docs/integrated acceptance remain. This is bounded storage source acceptance, not data rebuild, runtime cutover or release permission. No repeat accepted checks required.

## Money SOURCE ACCEPTED — 2026-09-07

Independent oversight accepted the corrected immutable Money candidate after reviewing the complete42path boundary and exact2file readBooking correction. Current accepted baseline `/tmp/ae-money-review-corrected-candidate-20260907/manifest.json`. No remaining Money finding; protected v1 digest/claims and historical receipt mapping accepted. Seven of ten source groups formally accepted. Mandatory storage return29/29PASS is retained; Group9 shared discovery/callhelper defects remain separately owned. Public implementation now advances from completed inventory. No global/compiler or225/29 repeats required solely for the two-field correction. Integrated checks, artifacts/docs, localcommits and parked runtime work remain open.

## P1 readBooking correction — ready for material review

Independent review found reservation/release/settlement reference mapping regression. Same Money owner corrected exactly two files; immutable corrected snapshot `/tmp/ae-money-review-corrected-candidate-20260907/manifest.json`,1789files zero changedDuringCapture, exactdelta `/tmp/ae-money-review-correction-paths-20260907.txt`. Whole42path review otherwise returned no blocking findings. Money remains unaccepted pending material review.

Material correction complete.

- Fixed `readBooking` mappings with optional-field semantics preserved:
  - `reservationRefs` → `formanceReservationRefs`
  - `releaseRefs` → `formanceReleaseRefs`
  - `settlementRefs` → `formanceSettlementRefs`
- Extended lifecycle tests with direct readback and unrelated-field absence assertions.

Changed paths:

- [convex/moneyManagedCall.ts:153](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/convex/moneyManagedCall.ts:153>)
- [tests/unit/convex/money-managed-call.test.ts:138](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/tests/unit/convex/money-managed-call.test.ts:138>)

Evidence:

- Managed-call suite: 5/5 passed.
- Scoped Oxlint: passed.
- Exact `git diff --check`: passed.
- No global compiler, 225/29 suites, hosted smoke, generation, or deployment rerun.

Historical encoder keys/bytes and protected receipt output remain unchanged. Group9 discovery/call-helper gaps remain separate and untouched.

## Stable whole-Money review candidate — 2026-09-07

Money source is paused. Root corrected compiler:134diagnostics/41files, ZERO in42Money changed paths; full log `/tmp/ae-money-corrected-coherent-checkpoint-20260907.log`. Before Money:230/57. Storage return5suites29/29PASS is retained; source acceptance remains6/10 pending independent oversight.

Immutable candidate `/tmp/ae-money-review-candidate-20260907/manifest.json`:1789files,zero changed during capture. Compare accepted Call baseline `/tmp/ae-call-review-corrected-candidate-20260906/manifest.json` across exact42paths `/tmp/ae-money-module-owned-paths-20260907.txt`. Money03 affected8suites225PASS and documents1PASS, Money04 final86PASS2FAIL (2 shared discovery tests), earlier127PASS4SKIP and storage29 all overlap; never sum them. Final scoped Oxlint/diffcheck and source-only Call-to-receipt assertionPASS.

Root qualifies shared follow-up as Group9 public/release consumers, not a new root implementation assignment: tool-gateway-production-smoke-discovery.ts and tool-gateway-production-smoke-call.ts retain current-contract mismatches. They remain with the already-complete Group9 inventory and will be fixed/tested under that owner once Money passes review. Root22 still owns generated/index/package artifacts. No hosted execution, backend/data/deployment or source commit occurred.

WHOLE-MONEY readiness receipt: assigned fixes complete; prior 225/29 PASS evidence preserved.

Changed:

- `moneyBillingAuthorization.ts:243` now uses `spendingPolicyDigest`.
- Money smoke consumer maps current `CallResult`/`callUsageSchema` to protected receipt fields: `callRef → invocationRef`, `toolRef → operationRef`.
- Smoke descriptors now use `.toolRef`; historical receipt keys remain unchanged.
- Harness uses a type-only `GatewaySmokeConfig` import and current `toolRef`/`market_tools:call` fixtures.
- Removed one trailing-whitespace defect.

Verification:

- Node v22.22.0 / npm 11.5.1; Convex 1.45.0.
- Focused tests: 86 passed, 2 failed. Money, config, and receipt tests passed; two discovery failures remain in the unassigned shared discovery helper.
- Source-only Call/Tool receipt mapping passed.
- Scoped Oxlint: PASS.
- Cumulative-path diff check: PASS.
- No global compiler, generation, hosted smoke, backend, or deployment run.

Root/shared follow-up: `tool-gateway-production-smoke-discovery.ts` and `tool-gateway-production-smoke-call.ts` still consume retired descriptor/result names; status/discovery failures are attributed there and were not changed under this ownership boundary.

## Money coherent checkpoint and storage return — 2026-09-07

Root ran the existing five-suite storage return in the original checkout on Node22/npm11.5.1: all5files29testsPASS (7.95s), including full installed CLI/Workpool, schema and managed-booking checks. Log `/tmp/ae-money-storage-return-20260907.log`. This resolves the recorded seven-test storage-return failure; formal source acceptance still awaits the complete Money review.

The global compiler exits2 with160diagnostics/46files;20 are in the cumulative42Money changed paths. Full log `/tmp/ae-money-coherent-checkpoint-20260907.log`; owned headers `/tmp/ae-money-owned-compiler-20260907.log`; exact delta `/tmp/ae-money-current-delta-paths-20260907.txt`. The same Money owner is correcting current authority/release consumer contracts, then scoped checks and full handoff. Prior225 affected tests and documents1PASS are retained; counts overlap earlier batches. No Money candidate or integrated acceptance yet.

Money03 execution stalled after recorded shell/sandbox errors. Its edits and command evidence are preserved; same-session recovery did not progress. Continuation04 resumes the same complete Money ownership with a precise remaining-work handoff and explicit working shell settings, without reinventory. Hosted/data/deployment work remains parked.

## Money continuation02 receipt — 2026-09-07, implementation remains open

Root received this bounded handoff before the second actual compaction. Whole Money is not accepted; 127 passing tests overlap the broader 265 passing tests and must not be summed. Five broader suites still fail. The same Money owner continues the remaining attribution/fixture/release work. Public implementation remains held; source acceptance stays six of ten.

Money continuation02 handoff — not accepted.

Changed paths:

- `src/modules/money/internal/convex-schema.ts`
- `convex/capabilityProviderConsequenceJournal.ts`
- `src/modules/money/public.ts` — retained `StrictLivePayoutReceiptSchema.supplierBusinessId`
- `tools/release/tool-gateway-production-smoke.ts`
- `tools/release/tool-gateway-production-smoke-money.ts`
- `tools/release/tool-gateway-production-smoke-hosted-money.ts`
- `tools/release/tool-gateway-production-smoke-receipt.ts`
- `tests/unit/convex/money-managed-call.test.ts`
- `tests/unit/convex/money-x402-payment-attempts.test.ts`
- `tests/unit/money/formance.test.ts`
- `tests/integration/money-formance-boundary.test.ts`
- `tests/unit/money/qualified-use-delivery.test.ts`
- `tests/unit/money/pricing-config.test.ts`

Verified unchanged: `tests/unit/release/payout-provider-replay.test.ts`, direct UI/server consumers including `AeOwnerCredit.tsx`, `AeSupplyEarningsCard.tsx`, `AeProviderWorkspace.tsx`, `money-query.ts`.

Focused verification:

```sh
npx vitest run \
  tests/unit/convex/money-managed-call.test.ts \
  tests/unit/convex/money-x402-payment-attempts.test.ts \
  tests/unit/money/formance.test.ts \
  tests/unit/money/qualified-use-delivery.test.ts \
  tests/unit/money/pricing-config.test.ts \
  tests/integration/money-formance-boundary.test.ts \
  tests/unit/release/payout-provider-replay.test.ts \
  --no-file-parallelism
```

Result: 6 files passed, 1 skipped; 127 passed, 4 skipped.

A broader Money/schema/provider-consequence run produced: 23 files passed, 1 skipped; 265 passed, 4 skipped; 5 files failed, 19 tests failed.

Known failures:

- Provider-consequence route/bridge fixtures still fail because the current digest boundary expects `callRef`/`toolRef` while fixtures and canonical ticket material still use `invocationRef`/`operationRef`.
- `provider-consequence-bridge.test.ts`: one started/completed case returns `provider_consequence_authority_invalid` instead of the expected unknown result.
- `provider-consequence-http.test.ts`: canonicalization emits `dispatchRef: undefined` and retains attacker `operationRef`.
- `money-account-funding.test.ts`: current validator rejects the fixture’s `inspect_only` authority mode.

Protected receipt decision:

- Historical canonical preimage keys remain unchanged: `money.operationCharge`, `usage.supplier`, `controlInvocationRef`, `supplierBusinessId`, `supplierGrossAccrual`, and `StrictLivePayoutReceiptSchema.supplierBusinessId`.
- Boundary mappings are:
  - `activity.callRef -> controlInvocationRef`
  - `activity.businessId -> supplierBusinessId`
  - calculated current gross -> `supplierGrossAccrual`
  - internal Money snapshot `.provider -> receipt.usage.supplier`
  - current `buildCallCharge()` output -> serialized `money.operationCharge`
- `money-documents.functions.ts` retains protected `invocationRef: data.callRef` in the command digest.
- Formance `commitment_digest`/`operation_digest`, `invocationDigest`, account namespaces, financial identities, and opaque values were preserved. No vectors, versions, aliases, or migrations were added.
- Commercial policy `operations` and `commitmentTtlMs` remain unchanged because they are part of canonical policy material.

Remaining work:

- Reconcile the Provider-consequence canonical ticket/digest boundary without changing protected hash material; then rerun route, bridge, HTTP, and journal tests.
- Resolve the Money account-funding fixture against the actual current authority-mode contract.
- Review the remaining ordinary `operation_ref` diagnostic in `convex/moneyX402PaymentObservation.ts`.
- Run source-only release validation, scoped lint, and diffcheck. Hosted/live smoke remains unauthorized.
- Root still owns module-boundary trackers, Convex generation decision, generated outputs, global compiler, and release Group9 scripts/index/artifacts.


## Money continuation01 receipt — implementation incomplete

Initial owner paused before second compaction.20 source paths changed against accepted Call baseline; exact list /tmp/ae-money-current-delta-paths-20260906.txt. No post-change verification yet. Baseline12files123PASS22FAIL4SKIP. Same whole owner continues validators/fixtures/release/UI and behavior checks. Root qualifications: Money itself is NOT accepted; references to existing accepted Money work mean existing source preserved, not module acceptance. Exact canonical hash/financial evidence remains protected. Do not introduce a compatibility layer or blindly rename an entire hashed release receipt; inspect its existing material encoder and preserve exact historical keys at that boundary while current DTOs follow the approved mapping. Source-only, no hosted/live smoke.

<details><summary>Continuation01 receipt, qualified above</summary>

Continuation receipt — Money/durable attribution owner

Status: not complete; implementation paused before post-change verification.

Runtime verified: Node `v22.22.0`, npm `11.5.1`.

Implemented in this continuation:

- Updated Money document DTOs in [src/lib/server/money-documents.functions.ts](/Users/joelchan/Documents/Coding/App-Dev/live/01.%20Pre-Implementation/Agentic-Economy/src/lib/server/money-documents.functions.ts):
  - `invocationRef` → `callRef`
  - `operationRef` → `toolRef`
  - reconciliation scope `operation` → `tool`
  - preserved historical reversal command digest key `invocationRef`, projecting from `data.callRef`.
- Updated reconciliation scope validator in [convex/moneyReconciliationCases.ts](/Users/joelchan/Documents/Coding/App-Dev/live/01.%20Pre-Implementation/Agentic-Economy/convex/moneyReconciliationCases.ts).
- Renamed managed booking locals and fields across:
  - [convex/moneyManagedCall.ts](/Users/joelchan/Documents/Coding/App-Dev/live/01.%20Pre-Implementation/Agentic-Economy/convex/moneyManagedCall.ts)
  - [convex/moneyManagedCallLifecycle.ts](/Users/joelchan/Documents/Coding/App-Dev/live/01.%20Pre-Implementation/Agentic-Economy/convex/moneyManagedCallLifecycle.ts)
  - [convex/moneyFormance.ts](/Users/joelchan/Documents/Coding/App-Dev/live/01.%20Pre-Implementation/Agentic-Economy/convex/moneyFormance.ts)
  - [src/modules/money/formance-workflows.ts](/Users/joelchan/Documents/Coding/App-Dev/live/01.%20Pre-Implementation/Agentic-Economy/src/modules/money/formance-workflows.ts)
  - `commitmentDigest` → `quoteDigest`; Formance output key `commitment_digest` remains unchanged.
- Renamed Money billing-authority helpers and locals to Call terminology in [convex/moneyBillingAuthorization.ts](/Users/joelchan/Documents/Coding/App-Dev/live/01.%20Pre-Implementation/Agentic-Economy/convex/moneyBillingAuthorization.ts), with the x402 caller updated in [convex/moneyX402PaymentAttempts.ts](/Users/joelchan/Documents/Coding/App-Dev/live/01.%20Pre-Implementation/Agentic-Economy/convex/moneyX402PaymentAttempts.ts).
- Renamed qualified-use authority seams and owner-self parameter in:
  - [convex/qualifiedUse.ts](/Users/joelchan/Documents/Coding/App-Dev/live/01.%20Pre-Implementation/Agentic-Economy/convex/qualifiedUse.ts)
  - [convex/lib/qualifiedUsePayout/authority.ts](/Users/joelchan/Documents/Coding/App-Dev/live/01.%20Pre-Implementation/Agentic-Economy/convex/lib/qualifiedUsePayout/authority.ts)
  - [convex/lib/qualifiedUsePayout/index.ts](/Users/joelchan/Documents/Coding/App-Dev/live/01.%20Pre-Implementation/Agentic-Economy/convex/lib/qualifiedUsePayout/index.ts)
  - [src/modules/money/internal/delivery.ts](/Users/joelchan/Documents/Coding/App-Dev/live/01.%20Pre-Implementation/Agentic-Economy/src/modules/money/internal/delivery.ts)
- Renamed direct Money pricing/type seams:
  - `resolveInvocationPrice` → `resolveCallPrice`
  - `MoneyAcceptedInvocationCharge` → `MoneyAcceptedCallCharge`
  - `budget_invocation_limit_exceeded` → `budget_call_limit_exceeded`
  - callers updated in [src/modules/capability-supply/internal/supply-funnel/pricing-port.ts](/Users/joelchan/Documents/Coding/App-Dev/live/01.%20Pre-Implementation/Agentic-Economy/src/modules/capability-supply/internal/supply-funnel/pricing-port.ts), [src/modules/capability-execution/call-material.ts](/Users/joelchan/Documents/Coding/App-Dev/live/01.%20Pre-Implementation/Agentic-Economy/src/modules/capability-execution/call-material.ts), and [convex/capabilityCallProjection.ts](/Users/joelchan/Documents/Coding/App-Dev/live/01.%20Pre-Implementation/Agentic-Economy/convex/capabilityCallProjection.ts).
- Changed the current Money payout receipt DTO to `providerBusinessId` in [src/modules/money/public.ts](/Users/joelchan/Documents/Coding/App-Dev/live/01.%20Pre-Implementation/Agentic-Economy/src/modules/money/public.ts).
- Began the corresponding release Money cutover in:
  - [tools/release/tool-gateway-production-smoke-receipt.ts](/Users/joelchan/Documents/Coding/App-Dev/live/01.%20Pre-Implementation/Agentic-Economy/tools/release/tool-gateway-production-smoke-receipt.ts)
  - [tools/release/tool-gateway-production-smoke-money.ts](/Users/joelchan/Documents/Coding/App-Dev/live/01.%20Pre-Implementation/Agentic-Economy/tools/release/tool-gateway-production-smoke-money.ts)
  - [tools/release/tool-gateway-production-smoke-hosted-money.ts](/Users/joelchan/Documents/Coding/App-Dev/live/01.%20Pre-Implementation/Agentic-Economy/tools/release/tool-gateway-production-smoke-hosted-money.ts)

Existing accepted Money work preserved includes the managed x402 booking/settlement/recovery chain, `callRef`/`quoteRef`/`toolRef` storage links, Provider-obligation payout ineligibility, qualified-use attribution, billing authorization, credit/earnings/payout paths, and prior UI changes in:

`convex/capabilityProviderConsequenceJournal.ts`, `convex/capabilityProviderOffboarding.ts`, `convex/capabilitySupplyOwnerFunnelProjection.ts`, `convex/lib/workloadCron/context.ts`, `convex/moneyLedgerValues.ts`, `convex/moneyOwnerSpend.ts`, `convex/moneyProviderObligations.ts`, `convex/moneyX402PaymentAuthorization.ts`, `convex/moneyX402PaymentObservation.ts`, `convex/moneyX402PaymentRead.ts`, `convex/providerConsequenceHttp.ts`, `convex/workloadCron.ts`, `src/components/ae/console/AeOwnerCredit.tsx`, `src/components/ae/supply/AeSupplyEarningsCard.tsx`, `src/lib/server/funding-handoff-api.ts`, `src/modules/money/funding-handoff.actions.ts`, `src/modules/money/internal/charge-contract.ts`, `tests/unit/convex/money-managed-call.test.ts`, `tests/unit/convex/money-x402-payment-attempts.test.ts`, `tests/unit/schema/money-schema.test.ts`, and `tools/release/package5-provider-operations.ts`.

Verification before these continuation edits:

The focused command covering Money schema, managed calls, x402, documents, qualified use, pricing, Formance, funding, payout, policy, and the Formance integration boundary produced:

- 4 failed files
- 7 passed files
- 1 skipped file
- 22 failed tests, 123 passed, 4 skipped, 149 total

Failures were baseline fixture mismatches against already-cut-over source:

- `money-managed-call.test.ts`: 5 failures from `invocationRef` arguments where `callRef` is now required.
- `formance.test.ts`: 4 failures from old managed-booking fields, causing `undefined.trim`.
- `qualified-use-delivery.test.ts`: 7 failures from old `invocationRef`/`operationRef` fixtures and invalid resulting digest material.
- `money-x402-payment-attempts.test.ts`: 6 failures from old authority/payment fields, including expiry fixtures expecting the current Call-shaped arguments.

No tests were run after the continuation edits. No global compiler, Convex deployment, hosted smoke, live backend operation, external payment movement, generation, or commit was performed.

Concrete remaining work:

1. Update [src/modules/money/internal/convex-schema.ts](/Users/joelchan/Documents/Coding/App-Dev/live/01.%20Pre-Implementation/Agentic-Economy/src/modules/money/internal/convex-schema.ts) reconciliation scope validator from `operation` to `tool`; current `moneyManagedCall` and DTO code already emit/query `tool`.
2. Update Money-owned fixtures/tests:
   - `tests/unit/convex/money-managed-call.test.ts`
   - `tests/unit/convex/money-x402-payment-attempts.test.ts`
   - `tests/unit/money/formance.test.ts`
   - `tests/unit/money/qualified-use-delivery.test.ts`
   - `tests/unit/money/pricing-config.test.ts`
   - `tests/integration/money-formance-boundary.test.ts`
   - `tests/unit/release/payout-provider-replay.test.ts`
3. Finish durable-attribution local terminology in `convex/capabilityProviderConsequenceJournal.ts`; preserve its protected `invocationDigest` field.
4. Complete release consumer propagation. The following still reference the pre-cutover Money shape:
   - `tools/release/tool-gateway-production-smoke.ts`
   - remaining validation paths in `tools/release/tool-gateway-production-smoke-receipt.ts`
   - the `readSnapshot` return object in `tools/release/tool-gateway-production-smoke-hosted-money.ts`
   - current `supplier`/`operationCharge`/`controlInvocationRef` usages.
5. Verify direct UI/server consumers, especially `src/components/ae/offerings/AeProviderWorkspace.tsx`, `src/lib/server/money-query.ts`, and the existing owner credit/provider earnings routes.
6. Re-run the focused Money and release unit suites, then scoped lint and `git diff --check`. Do not run hosted/live smoke.

Unresolved contract decisions:

- `moneyCommercialPolicies.family: 'operations'`, `CommercialPolicyControls.operations`, and `commitmentTtlMs` remain unchanged. The inventory did not classify this policy-family identifier as the purchased Call/Quote link; changing it would alter policy material and policy digests. Recommended continuation: leave it unless the target contract explicitly requires `tools`/`quoteTtlMs`.
- The release receipt’s `money.operationCharge` and `usage.supplier` fields have begun changing to `money.callCharge` and `usage.provider`. Complete that as current Money DTO vocabulary unless Group9 confirms those v1 receipt keys are immutable historical evidence; if protected, use a narrow compatibility projection without changing digest formats or version tags.
- Existing persisted reconciliation rows with `scopeType: 'operation'` have not been migrated. No migration or data operation is authorized.

Protected and untouched:

- Formance formats, version tags, `commitment_digest`, `operation_digest`, account namespaces, transaction/idempotency material, and canonical hash bytes.
- Qualified-use formats/material, `qualified-use:v1`, ADR-034 exclusion value `owner_self_invocation`, and digest ordering.
- Provider-consequence `invocationDigest`, ticket claims, signatures, leases, secret pointers, and operation-key evidence.
- x402 `dispatchRef`, seller/payee/payTo vocabulary, payment identities, nonce/network/asset fields.
- Financial amounts, currencies, exponents, Stripe/Formance identifiers, immutable financial identities, and conservation behavior.
- Call-owned lifecycle/producers and accepted replay/terminal-result behavior, except the necessary direct Money type imports noted above.
- No new tables, Purchase/Outcome model, accounting topology, or new index.

Root-owned follow-up:

- No new index is indicated. Existing bounded indexes cover `by_callRef`, `by_toolRef`, and reconciliation scope lookup.
- Root must decide whether `readQualifiedUseByCall` or other Convex export renames require native generated API refresh based on actual imports.
- Root owns generated files, shared `module-boundaries.ts`, trackers, global compiler, final serialized commits, and any generation step.
</details>


## Money implementation RELEASED after Call source acceptance

SameMoneyowner freshcontextcontinuescompletedinventory. AcceptedCallbaseline /tmp/ae-call-review-corrected-candidate-20260906/manifest.json. Whole18/26boundary,sourceonly; no live/backend/data/financialaction.6/10accepted; Moneyactive. Rootownsindex/generation/compiler/trackers/commits. Prompt /tmp/ae-money-implementation-prompt-20260906.txt.


## Current Money inventory — COMPLETE; implementation HELD

Read-only Luna Max inventory completed2026-09-06,1actualcompaction,no source changes/tests. Same owner will implement after Call acceptance. Authoritative receipt copied below; source producer seams remain held.

Coordinator qualifications override overbroad receipt phrasing: NO hosted/live release smoke is authorized; only source/unit validation of release scripts. Existing public Provider-obligation DTO fields are issue18/26 direct consumers once Call accepted, not indefinitely held to public owner. Preserve historical receipt/hash/protocol keys, but current ordinary AE-owned fields/locals must follow approved mappings. Do not grandfather supplierBusinessId or ordinary locals merely as compatibility. api/dataModel derive source imports; root decides generation from actual module/file/schema/route changes, never assumes RPC export changes alone require it.

# Read-only inventory receipt

Prepared for group 8 Money and durable attribution. No implementation is released: Call remains the sole producer owner, and Luna Max remains Money owner after Call acceptance.

Runtime and checkout verified first:

- Node `v22.22.0`
- npm `11.5.1`
- Branch `codex/vocabulary-rationalisation`
- Existing dirty worktree preserved unchanged

Read: [PRODUCT.md](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/PRODUCT.md>), [AGENTS.md](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/AGENTS.md>), [CONTEXT.md](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/CONTEXT.md>), [module map](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/.scratch/vocabulary-rationalisation/map.md>), issues 18/26, issue32 checkpoint, [Call inventory](</tmp/ae-call-inventory-return-before-second-result-20260906.txt>), and the corrected [Quote manifest](</tmp/ae-quote-review-corrected-candidate-20260906/manifest.json>).

## Ownership and held boundaries

| Boundary | Owner/status | Inventory result |
|---|---|---|
| Tool, policy, connection, catalogue, Provider, Quote | Accepted upstream | Their current `toolRef`/`quoteRef` contracts are inputs to Money. |
| Call row, admission, authority, lifecycle, worker, dispatch, recovery, projection | Call owner; ACTIVE/NOTACCEPTED | All producer seams remain held. |
| Managed booking and settlement | Luna Max / issue18 | `convex/moneyManagedCall.ts`, `moneyManagedCallLifecycle.ts`, Formance workflows. |
| Billing authorization | Luna Max / issue18 | `convex/moneyBillingAuthorization.ts`; verifies current Call, account, principal, grant, credential and policy facts. |
| x402 durable payment attribution | Luna Max / issue18 | `moneyX402Payment*` files; `dispatchRef` remains dispatch identity. |
| Qualified-use delivery evidence | Luna Max / issue18 | `convex/qualifiedUse.ts`, `src/modules/money/internal/delivery.ts`. |
| Provider-consequence journal/audit | Money/audit boundary; Call producer held | Journal validators and durable attribution inventoried; Call dispatch/worker emission remains held. |
| Account credit, Provider earnings, payout and business-record presentation | Luna Max / issue26 | UI, server adapters, routes and release consumers only; no new accounting topology. |
| Generated artifacts, assembled schema, indexes, tracker | Root owner | No generation, tracker or index changes in preparation. |

Required mappings:

- purchased `invocationRef` → `callRef`
- paid `commitmentRef` → `quoteRef`
- admitted AE Tool `operationRef` → `toolRef`
- `maximumSpendPerInvocation` → `maximumSpendPerCall`
- `maximumConcurrentInvocations` → `maximumConcurrentCalls`

Generic Actions, IAM principals, `serviceRef`, `operationKey`, Suggested next actions, Provider/Seller/payment recipient, Charge/Provider obligation/Payout, and delivery/payment/Purchase states remain distinct.

## Durable attribution chain

The intended durable chain is:

`Call → Quote → Tool → attempt/effect → usage and payment evidence → qualified-use/provider consequence → Charge and Provider obligation → Formance settlement/recovery → documents, earnings and payout views`.

Current ownership is split at `sharedCallMoney`:

- Call supplies the authoritative Call/Quote/Tool/attempt identity and lifecycle state.
- Money consumes those identities to create managed reservations, buyer Charges, Provider obligations, usage records, qualified-use evidence, settlement and recovery records.
- `moneyProviderObligations` remains one attributable upstream obligation per managed x402 Call, with buyer AUD and Provider USDC amounts.
- Managed x402 obligations remain `payoutEligibility: ineligible_x402`; this must not be converted into a second Provider payout.
- Qualified-use is delivery evidence, not Purchase resolution or an Outcome table.
- `capabilityCallProjections` keeps `deliveryState`, `paymentState` and `providerObligationState` separate.

The charge contract in `src/modules/money/internal/charge-contract.ts` enforces one buyer charge, one Provider accrual, one rake leg, and optionally one Provider recovery leg. It preserves exact amounts, evidence, Call/attempt identity and the conservation equation:

`Provider amount + rake = buyer Charge amount`.

## Money source inventory

Public and shared boundaries:

- `src/modules/money/public.ts`
- `src/modules/money/server.ts`
- `src/modules/money/schema.ts`
- `src/modules/money/money.functions.ts`
- `src/modules/money/formance.ts`
- `src/modules/money/formance-workflows.ts`
- `src/modules/money/funding-handoff.actions.ts`

Core definitions, validators and codecs:

- `internal/exact-amount.ts`
- `internal/aud-funding.ts`
- `internal/commercial-policy.ts`
- `internal/pricing-contract.ts`
- `internal/pricing-config.ts`
- `internal/executable-rate.ts`
- `internal/funding-quote.ts`
- `internal/charge-contract.ts`
- `internal/delivery.ts`
- `internal/account-ref.ts`
- `internal/payment-binding.ts`
- `internal/convex-schema.ts`

Funding, Stripe and payout adapters:

- `internal/account-funding-http.ts`
- `internal/ports.ts`
- `internal/stripe-webhook.ts`
- `internal/payout-connect-http.ts`
- `internal/payout-http-runtime.ts`
- `internal/payout-transfer-command.ts`
- `internal/payout-transfer-http.ts`
- `internal/payout-policy.ts`
- `internal/payout-policy/{contracts,account-transition,payout-transition,review-window}.ts`

Important public serializers include `CreditAccountView`, `CreditActivityView`, `KeyUsageView`, `ProviderEarningsView`, `PayoutStatusView`, `MoneyRefusal`, strict digest/ref schemas, and the protected `StrictLivePayoutReceiptSchema`.

## Convex source and storage inventory

Money-owned Convex files:

- `moneyAccountFunding.ts`
- `moneyAccountFundingFormance.ts`
- `moneyBillingAuthorization.ts`
- `moneyCommercialPolicy.ts`
- `moneyConnect.ts`
- `moneyDocumentRender.ts`
- `moneyDocuments.ts`
- `moneyFormance.ts`
- `moneyLedger.ts`
- `moneyLedgerValues.ts`
- `moneyManagedCall.ts`
- `moneyManagedCallLifecycle.ts`
- `moneyOwnerSpend.ts`
- `moneyProviderObligations.ts`
- `moneyReconciliationCases.ts`
- `moneyStripeEvents.ts`
- `moneyStripeWebhookInbox.ts`
- `moneyStripeWebhookValues.ts`
- `moneyStripeWebhookWorker.ts`
- `moneyTreasury.ts`
- `moneyX402PaymentAttempts.ts`
- `moneyX402PaymentAttemptsShared.ts`
- `moneyX402PaymentAuthorization.ts`
- `moneyX402PaymentObservation.ts`
- `moneyX402PaymentRead.ts`
- `qualifiedUse.ts`

Adjacent durable attribution sources:

- `capabilityProviderConsequenceJournal.ts`
- `lib/qualifiedUsePayout/{authority,contracts,identity,index}.ts`
- `lib/moneyLegalCustomer.ts`
- `lib/callLifecycle/dispatch.ts`
- `capabilityProviderOffboarding.ts`
- `capabilityProviderTools.ts`
- `capabilitySupplyOwnerFunnelProjection.ts`
- `workloadCron.ts`
- `lib/workloadCron/context.ts`
- `providerConsequenceHttp.ts`

### Physical tables and indexes

The authoritative Money schema is `src/modules/money/internal/convex-schema.ts`, re-exported through `src/modules/money/schema.ts` and assembled by `convex/schema.ts`.

Key attribution tables:

- `moneyProviderObligations`: `obligationRef`, `callRef`, `toolRef`, `providerRef`, buyer account, AUD/USDC amounts, state, payout eligibility, settlement/reversal evidence. Indexes: `by_obligationRef`, `by_callRef`, buyer/time, Provider/time, Provider/state.
- `moneyUsageEvents`: principal, account, credential, Service, Offering, business, `callRef`, attempt, protected `operationKey`, price digest, amount, Charge state and transaction. Indexes: principal/credential/currency/time, business/time, `by_callRef`, `by_usageRef`.
- `moneyX402PaymentAttempts`: `dispatchRef`, attempt/effect, optional `toolRef`, input digest, payment identity, x402 challenge/requirement/payment fields, custody, authorization/signature material, observation and reconciliation state. Indexes: attempt/effect, custody, authorization digest, payment identifier, state/expiry.
- `qualifiedUseReceipts`: Call/attempt/effect, business, pinned authority, Tool/publication/contract/binding, request/response/evidence digests and optional usage/transaction refs. Indexes: qualified-use ref, business/time, `by_callRef`, Tool/time.
- `providerConsequenceJournal`: ticket/effect/command/state, Call/Tool/attempt, lease/connection/authority/provider pointers, secret references, payment references, claims and observation digests. Indexes: ticket, effect, command, claim and state/expiry.
- `sellerOnboardingCanaryRearmAudits`: append-only Call-linked canary proof with refusal provenance and envelope/authority digests.

Funding and durable business records:

- `moneyFundingCommands`: AUD principal, fee, tax, total, legal customer, policy digests, idempotency, Stripe evidence, provider/reversal states. Indexed by command, idempotency, external ref, payment, account/time, account/state and legal-customer/state.
- `moneyLegalCustomerBindings`: account/legal-customer ownership and revisions; account and legal-customer/state indexes.
- `moneyStripeWebhookInbox` and `moneyStripeEvents`: bounded verified Stripe evidence, destination, replay/conflict/application state and payload digests.
- `moneyTreasuryObservations`: corporate USDC custody, generation, totals, evidence and observation indexes.
- `moneyReconciliationCases`: account, legal-customer, treasury, operation, Provider-obligation or document scope; open/resolved state and evidence.
- `moneyDocuments`: funding receipts, service-fee documents, statements, daily closes, adjustments and tax invoices; source transaction refs, policy/snapshot/render digests, state, storage files and signature evidence.
- `moneyDocumentSnapshotPages`: paginated Formance transaction refs and exact page totals.

Payout custody and presentation:

- `moneyPayoutAccounts`: Stripe Connect account state, capability status, provider object/version and event digests.
- `moneyConnectAccountCommands`: Connect command identity, recovery lease, provider outcome and idempotency.
- `moneyPayouts`: Provider gross/rake/net, minimum, authority snapshot, payout state, Stripe transfer identity and recovery evidence.
- `moneyPayoutAllocations`: qualified-use, usage, transaction, business, authority, gross/rake/net and source/material digests.

No new Purchase, Outcome, general-ledger, or accounting-classification table is warranted.

## Managed booking, authorization and qualified-use consumers

Managed Call booking:

- `src/modules/money/formance-workflows.ts`
- `convex/moneyFormance.ts`
- `convex/moneyManagedCall.ts`
- `convex/moneyManagedCallLifecycle.ts`

The booking validates the Call and Quote rows, parses the admitted Tool, checks managed x402/rate/treasury/legal-customer facts, and emits existing Formance movements for:

- buyer AUD reservation
- agent budget reservation
- legal-customer exposure reservation
- corporate USDC treasury commitment
- Provider obligation accrual

Release requires `submissionProvenAbsent`; settlement and Provider reversal require exact transaction/readback evidence.

Authorization and durable attribution:

- `convex/moneyBillingAuthorization.ts`
- `convex/moneyX402PaymentAuthorization.ts`
- `convex/moneyX402PaymentObservation.ts`
- `convex/moneyX402PaymentRead.ts`
- `convex/moneyX402PaymentAttemptsShared.ts`
- `convex/capabilityProviderConsequenceJournal.ts`

These preserve grant generation, account, principal, credential, Call, Tool, input, attempt/effect, custody, x402 requirement/payment identity, signature and reconciliation evidence.

Delivery and Provider consequence:

- `convex/qualifiedUse.ts`
- `src/modules/money/internal/delivery.ts`
- `convex/lib/qualifiedUsePayout/*`
- `convex/capabilityProviderConsequenceJournal.ts`
- Call worker/provider-consequence bridge sources

Qualified-use is insert-once and exact-replay only. It refuses non-production, non-delivery, uncertain, refunded and owner-self cases.

## Funding, credit, earnings, payout and document consumers

Server adapters and DTOs:

- `src/lib/server/money-query.ts`
- `src/lib/server/money-documents.functions.ts`
- `src/lib/server/funding-handoff-api.ts`
- `src/modules/money/internal/account-funding-http.ts`
- `src/modules/money/internal/payout-connect-http.ts`
- `src/modules/money/internal/payout-transfer-http.ts`
- `src/modules/money/internal/payout-http-runtime.ts`
- Stripe evidence/provider files under `src/lib/server/`

Current compatibility facts:

- `moneyLedger` remains an exposed compatibility boundary for Connect custody and legacy reads.
- Credit/activity/key-usage reads are currently retired/unsupported in that legacy boundary; Formance is the current economic read/write authority.
- Provider payout transfer is intentionally unavailable until an eligible Provider obligation is bound to a Formance transaction.
- `src/lib/server/money-documents.functions.ts` still exposes `invocationRef`/`operationRef` on Provider-obligation DTOs and reversal inputs. This is a held public consumer seam, not a final Money contract decision.

UI and routes:

- `src/components/ae/console/AeCreditTopUpPanel.tsx`
- `src/components/ae/console/AeOwnerCredit.tsx`
- `src/components/ae/supply/AeSupplyEarningsCard.tsx`
- `src/components/ae/offerings/AeProviderWorkspace.tsx`
- `src/components/ae/services/money.ts`
- `src/routes/_operator/owner.credit.tsx`
- `src/routes/_operator/owner.settings.payouts.tsx`
- `src/routes/fund.$fundingSessionId.tsx`
- `src/routes/fund.cancelled.tsx`
- `src/routes/api.v1.funding.*`
- `src/routes/api.v1.account.funding-sessions.*`
- `src/routes/api.v1.supply.earnings.ts`
- `src/routes/api.internal.provider-consequence.ts`

Observed UI contracts:

- browser returns never grant credit without canonical server readback
- pending, failed and outcome-unknown funding states remain explicit
- owner Credit shows Charges, reconciliation cases, Provider obligations, documents and Call receipt links separately
- Provider workspace shows earnings/payout readiness and offboarding blockers
- Provider obligations show buyer AUD separately from Provider USDC and remain payout-ineligible
- documents retain source transactions, policy version, rendering and signature state

CLI and release consumers:

- `tools/ae/commands/fund.ts` only opens the authenticated owner continuation; it never funds an account.
- Money-relevant release files:
  - `tool-gateway-production-smoke.ts`
  - `tool-gateway-production-smoke-call.ts`
  - `tool-gateway-production-smoke-discovery.ts`
  - `tool-gateway-production-smoke-hosted-money.ts`
  - `tool-gateway-production-smoke-hosted-owner.ts`
  - `tool-gateway-production-smoke-hosted-runtime.ts`
  - `tool-gateway-production-smoke-money.ts`
  - `tool-gateway-production-smoke-receipt.ts`
  - `validate-tool-gateway-production-smoke-receipt.ts`
  - `package5-provider-operations.ts`

These scripts validate exact Call/Tool/Quote identity, hosted funding readback, Charge/provider split, payout transfer identity, conservation, replay with zero additional movement, and bounded external movement. Existing `supplier` labels and `operationRef` receipt fields are protected compatibility evidence until the upstream Call/public cutovers are accepted.

## Tests and fixtures

Issue18 core suites:

- `tests/unit/schema/money-schema.test.ts`
- `tests/unit/schema/convex-schema.test.ts`
- `tests/integration/money-formance-boundary.test.ts`
- `tests/unit/convex/money-managed-call.test.ts`
- `tests/unit/convex/money-x402-payment-attempts.test.ts`
- `tests/unit/capability-execution/jit-provider-consequence.test.ts`
- `tests/unit/capability-execution/provider-consequence-bridge.test.ts`
- `tests/unit/capability-execution/provider-consequence-http.test.ts`
- `tests/unit/capability-execution/seller-onboarding-canary.test.ts`

Issue26 consumer suites:

- `tests/unit/ui/supply-funnel-earnings.test.tsx`
- `tests/unit/routes/funding-contract.test.ts`
- `tests/unit/money/public-format.test.ts`
- `tests/unit/money/account-funding-http.test.ts`
- `tests/unit/money/owner-payout-transfer-http.test.ts`
- `tests/unit/money/payout-policy.test.ts`
- `tests/unit/convex/money-account-funding.test.ts`
- `tests/unit/convex/money-documents.test.ts`
- `tests/unit/convex/money-managed-call.test.ts`
- `tests/unit/schema/money-schema.test.ts`
- `tests/unit/ui/demand-console.test.tsx`
- `tests/unit/ui/provider-workspace.test.tsx`

Additional direct coverage includes:

- `tests/unit/money/{exact-amount,executable-rate,formance,funding-quote,pricing-config,qualified-use-delivery,stripe-money-provider,stripe-webhook}.test.ts`
- `tests/unit/convex/{money-commercial-policy,money-stripe-webhook-inbox,money-treasury}.test.ts`
- Call projection, recovery, worker charge/reconcile/work-completion, lease and workpool suites
- funding-handoff, Call-recovery and MCP server adapter suites
- provider-consequence route/coverage suites
- payout replay and hosted earnings release suites
- commercial-policy and Convex fixture helpers
- Call worker and owner-payout harnesses

## Protected exceptions

Do not mechanically rename:

- Formance formats and metadata: `ae.formance-managed-call:v1`, reservation material, `commitment_digest`, `invocation_digest`, `operation_digest`, `call_digest`, account namespaces, transaction identities and idempotency.
- Qualified-use identifiers/material: `qualified-use:v1`, `ae.money.qualified-use-material:v1`, ADR034 evidence and digest ordering.
- Provider consequence: `provider-consequence:v1`, ticket claims, `invocationDigest`, operation-key/authority/attempt/effect digests, signatures, lease and secret pointers.
- x402: `dispatchRef`, challenge/requirement/payment fields, `payTo`, network, asset, nonce, valid-before, payment/signature identities and protocol namespaces.
- Financial amounts, currency/exponents, Formance account namespaces, external Stripe/Formance/payment IDs, hashes, signatures and opaque identifier prefixes.
- `serviceRef` and `operationKey`; these are not Tool identity.
- upstream protocol vocabulary `seller` and `payee`.
- Secret-lifecycle `operationRef` in the explicit allowlist: `src/modules/secrets/production-lifecycle.ts`, `src/modules/secrets/internal/convex-schema.ts`, `convex/lib/secretLifecyclePersistence.ts`, and `convex/secretLifecycleHttp.ts:129`.
- Existing evidence keys and compatibility DTO fields such as `supplierBusinessId` until the owning upstream contract is accepted.

## Current held mismatches and return point

The storage-return checkpoint still has seven known failures across five suites:

- `tests/integration/capability-call-workpool.test.ts`: old publication/Tool fixture is undefined; Call-owned workpool fixture depends on accepted Tool/Quote inputs.
- `tests/unit/convex/money-managed-call.test.ts`: old Quote/Call fixture shapes and RPC arguments; the boundary is partly Call producer and partly Money consumer.

These are not being declared final defects while Call is active. The same return point applies after Quote/Call producer contracts and Money propagation are both complete. No microfixture project is authorized.

Known held source seams:

- `convex/lib/callLifecycle/dispatch.ts` still contains producer-side legacy query/projection references around payment, usage, qualified-use, Provider journal and canary audit checks.
- `convex/marketDispatchWorkpool.ts` and Call cron/work-completion payloads remain Call-owned.
- `convex/chatTools.ts`, Call APIs, worker sources and Call recovery sources remain producer/public seams.
- `src/lib/server/money-documents.functions.ts` remains a public legacy DTO seam.
- Money source locals such as `invocation`/`commitment`, reconciliation `scopeType: 'operation'`, and protected evidence labels are not independently renamed.

Generated seams:

- `convex/schema.ts` assembled schema
- `convex/_generated/api.*`
- `convex/_generated/dataModel.d.ts`
- `src/routeTree.gen.ts`
- module-boundary/index artifacts

Native `makeFunctionReference` and source-import usage mean a renamed local RPC wrapper alone does not justify regeneration. Generation is actually required when Convex exports/function paths used through generated `internal`/`api` change, when schema tables/indexes change, or when framework routes change. Root owns that step and it remains parked.

## Required post-acceptance verification

After Call acceptance, re-read the Call receipt and corrected Quote snapshot, then run the existing focused checks:

- Money schema/index and module-boundary assertions
- Formance install/read/write/replay and managed booking tests
- managed reservation/release/settlement/reversal tests
- x402 identity, expiry, signing, observation, quarantine and reconciliation tests
- qualified-use exact replay and exclusion tests
- Provider-consequence lease, redaction, replay and unknown-outcome tests
- Charge conservation and usage attribution tests
- funding cancellation, webhook replay, refund, recovery and balance-readback tests
- payout threshold, custody, transfer identity, unknown and reversal tests
- business-document snapshot/render/signature/reconciliation tests
- UI and route failure-state tests
- hosted release smoke and zero-additional-movement replay checks
- only then the approved type/test/codegen checks

No tests, compiler, codegen, installation, deployment, backend, data, tracker, commit, source edit, subagent or AgentMux action was performed. Targeted inventory reads are complete; only acceptance-time re-reads of the held Call/public/generated seams remain.

## Prior issue record


Type: task
Label: wayfinder:task
Mode: AFK
Status: resolved
Assignee:
Assigned role: Luna Max / money, audit, queue and durable-record implementation owner
Parent: ../map.md
Blocked by: 08, 10, 11, 12, 13, 14, 15, 16, 29, 30

## Outcome

### Active storage group — administrative secret identity, 2026-09-06

The parent map's storage group is the only active implementation group.
Earlier worker claims in this issue are historical, not concurrent assignments.

Coordinator decision: the secret-lifecycle `operationRef` identifies a provision
or rotation operation, not an admitted Tool. Bulk replacement with `toolRef`
crossed the approved concept boundary. Restore `operationRef` and
`by_operationRef` throughout this existing boundary; do not invent a new name
or rename the lifecycle `operation` discriminator. The existing route and tests
already expect the administrative name. This is a protected semantic exception,
not a legacy Tool API alias.

Atomic source allowlist (all three definition/persistence consumers together):

- `src/modules/secrets/production-lifecycle.ts`
- `src/modules/secrets/internal/convex-schema.ts`
- `convex/lib/secretLifecyclePersistence.ts`

The first five-suite run passed 105/108 tests and found the remaining direct
validator mismatch in `convex/secretLifecycleHttp.ts:129`: its allowed field
list is `operationRef` but `requireString` still reads `value.toolRef`.
The coordinator extends this **same atomic boundary** to that one expression,
`requireString(value.operationRef)`. No request fields or route contract change.
Rerun all five suites and narrow checks before accepting the slice. This is an
identified missing direct caller, not a switch to another repair group.

Matching tests may be edited only for a demonstrated regression in this same
identity boundary; preserve their existing assertions and operation identities:

- `tests/unit/convex/secret-lifecycle-persistence-driver.test.ts`
- `tests/unit/convex/secret-lifecycle-operations.test.ts`
- `tests/unit/convex/secret-lifecycle-http.test.ts`
- `tests/unit/routes/secret-lifecycle.test.ts`
- `tests/integration/secret-lifecycle-convex-production.test.ts`

Read-only direct caller: `src/routes/api.internal.secret-lifecycle.ts`.
No route/HTTP contract change is expected or authorized. Exclude Call/Tool
schemas, Provider consequence, money, policy and generated outputs; those have
separate exact slices inside their respective repair groups.

Verification, all under Node 22/npm 11.5.1:

`npm exec --offline -- vitest run tests/unit/convex/secret-lifecycle-persistence-driver.test.ts tests/unit/convex/secret-lifecycle-operations.test.ts tests/unit/convex/secret-lifecycle-http.test.ts tests/unit/routes/secret-lifecycle.test.ts tests/integration/secret-lifecycle-convex-production.test.ts --no-file-parallelism`

Run narrow Oxlint and whitespace checks on the three source files and any
actually changed tests. Expected: all selected tests pass, existing duplicate
identity and replay/conflict behavior remains unchanged, schema/reader/route
use the same administrative `operationRef`, no Tool reference leaks into this
record. Report any external-module blocker; do not repair it without an explicit
dependency decision. No generation, backend startup, data, deployment or Git
writes. Root will collect the integrated count after the complete storage group.
This slice alone cannot close the broader durable-record issue.

**Verified boundary receipt — 2026-09-06:** all five suites passed, 108/108
tests. Four-source-file Oxlint and whitespace checks passed. The four restored
source files match `fe09a6463` exactly; no test edits were needed. Root confirmed
no remaining diff in those files. Secret identity slice accepted, ownership
released, cumulative worker compactions 0. The storage group still waits for
indexed-link acceptance/native generation; this issue remains open for its
separate money, qualified-use and durable-attribution criteria. No hosted
verification is claimed.

### Admission identity correction — coordinator decision, 2026-09-06

Source inspection found two more direct-hash inputs in `call-admit.ts`:
`canonicalCallRef` hashes a runtime `toolRef` key, and `admitCall` hashes
`{ toolRef, input }`; both original formats used `operationRef`. The protected
opaque Call prefix remains correct but does not preserve identity by itself.
Restore the original key at these two existing digest boundaries only, retaining
runtime Tool names and opaque nested inputs. This minimal local projection is
necessary and approved; no new serializer, framework, compatibility API or
format is authorised. The finite test owner may update the existing
`tests/unit/convex/capability-call-identity.test.ts` to target renamed exports
and runtime fields while retaining original expected material keys and adding
the admission identity vectors. Source ownership must wait for the seven-file
snapshot-caller batch to return; it has now returned with 31 tests passing.

### Lease command identity correction — coordinator decision, 2026-09-06

The existing `leaseCommandDigest` hashes command object keys directly. The
runtime issue command now contains `callRef`/`toolRef`, whereas the original
canonical command contained `invocationRef`/`operationRef`. Renaming only the
type therefore changes an existing command identity. A minimal projection of
those two top-level keys at this existing digest boundary is necessary and
approved; reuse `canonicalDigest` and retain all other command keys, kind values,
optional-field handling and nested approval material. No serializer module,
recursive renaming or compatibility framework is authorised.

The bounded implementation allowlist is
`src/modules/capability-supply/internal/provider-connection/lease.ts` and
`tests/unit/capability-supply/provider-connection.test.ts`. Update the latter's
two stale input fields and verify existing behavior plus original command
identity and replay/conflict behavior. Source and test ownership returns after
the focused suite, narrow lint and whitespace checks. This does not rename
other lease reason values or close durable-record acceptance.

### Single-file source claim — 2026-09-06

`vocab_identity_runtime_02` owns only `convex/capabilityCallIdentity.ts`:
Spending policy basis accesses become `spendingPolicyRef`,
`spendingPolicyVersion`, `spendingPolicyGeneration`; attempt hash material
retains original canonical keys from
`fe09a6463:convex/capabilityOperationInvocationIdentity.ts` while input fields
retain the new names. Static material comparison, narrow lint and whitespace
are assigned. Authority runtime golden proof remains pending; no hash format,
validation condition, prefix, new helper or other file may change.

### Bounded correction queue — 2026-09-05

Request-identity correction returned: `vocab_request_identity_01` edited only
`src/lib/server/call-api.ts` and its existing recovery API test. All six existing
request-key cases retain original canonical shapes while outgoing commands use
target names. Seven focused tests passed, including six literal-vector assertions
through the captured existing source transport; narrow lint/whitespace passed.
Zero compactions. This is local identity proof, not deployed acceptance.

`vocab_authority_identity_01` now claims exactly the three authority boundaries
listed below. Static original-material comparison and narrow lint are assigned;
the existing runtime authority golden test remains required at module integration.

Pending separate source correction: the bulk pass changed the explicitly
protected `operation-invoke-authority:v1` into
`call-authority-authority:v1` in `src/modules/capability-execution/call-authority.ts`,
`src/modules/capability-execution/internal/convex-schema.ts` and
`convex/capabilityCallIdentity.ts`. The decision-digest material also needs its
original `invocationRef`/`operationRef` keys, while runtime fields remain
`callRef`/`toolRef`. This is the existing issue 16/18 hash obligation, not a new
format decision or a structural cleanup. Preserve issue 38's shared basis
serializer and correct the existing three boundaries only.

`vocab_evidence_boundary_01` returned its ten-file source correction:
original reconciliation material keys and validators restored, exact field
lists compared with `fe09a6463`; root additionally confirmed both core evidence
definitions have zero diff against that commit. One compaction; worker retired.
A focused test attempt could not load the stale recovery action contract; zero
tests ran. That attempt was outside the requested static-only batch check and
does not establish runtime proof. Issue 19 now owns the blocking declaration
propagation; discovery's example producer remains with issue 21.

Root found that `src/lib/server/call-api.ts` retains the protected
`operation.invoke` hash namespace but passes renamed Quote/Tool/Call command
keys into `operationKeyFor`. The corresponding original body in
`fe09a6463:src/lib/server/operation-invoke-api.ts` used `commitmentRef`,
`operationRef` and `invocationRef`. This is a refactor regression requiring
an explicit existing-boundary correction and stable-vector verification;
keeping the namespace alone is insufficient. Queue after
`vocab_quote_callers_02` releases this file. Preserve opaque nested tool input;
no recursive rename, compatibility framework or new identity format is allowed.

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
