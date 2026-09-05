# Rename standing policies and request authorizations separately

Type: task
Label: wayfinder:task
Mode: AFK
Status: open
Assignee: unassigned (coordinator dispatches a Luna Max worker)
Assigned role: Luna Max / spending-policy and request-authorization owner, max reasoning
Parent: ../map.md
Blocked by: 08, 09, 10, 11, 29, 30

## Outcome

Rename the reusable standing-mandate family to Spending policy and the
request-specific mandate family to Request authorization, using Approval for a
person's recorded authorization. Keep the families separate in source types,
validators, persisted authority discriminators, action metadata, access
contracts, route material, fixtures and tests.

A Spending policy is reusable permission with limits and expiry. A Request
authorization is bound to one specific customer request/action; it does not
grant standing permission for unrelated requests, while existing retry,
expiry and recovery conditions for that request remain unchanged. An Approval
is the recorded human authorization for that request. A Call may use either
supported authorization path; this ticket must not make a standing policy a
universal Call prerequisite.

The worker owns all known propagation in the literal allowlist. It must retain
limits, expiry, revocation, generation, approval requirements, production
refusal of unrestricted test access and policy/authority ordering. It must not
rename generic `policy` concepts merely because they contain the word policy,
or rename paid invocation/Quote/Call vocabulary owned by later issues.

## Exact mappings

### Spending policy family

After issue 11 has moved the generic module to `src/modules/action-execution`,
apply these exact symbol/value mappings:

- `StandingMandate` -> `SpendingPolicy`.
- `StandingMandateScope` -> `SpendingPolicyScope`.
- `StandingMandateSnapshot` -> `SpendingPolicySnapshot`.
- `StandingMandateStore` -> `SpendingPolicyStore`.
- `StandingMandateGrantVerifier` -> `SpendingPolicyGrantVerifier`.
- `VerifiedStandingMandateGrant` -> `VerifiedSpendingPolicyGrant`.
- `StandingMandatePolicyProposal` -> `SpendingPolicyProposal`.
- `StandingMandatePolicyDecision` -> `SpendingPolicyDecision`.
- `StandingMandateAuthorityBasis` -> `SpendingPolicyAuthorityBasis`.
- `issueStandingMandate` -> `issueSpendingPolicy`.
- `restoreStandingMandateStore` -> `restoreSpendingPolicyStore`.
- `createDevelopmentStandingMandateGrantVerifier` ->
  `createDevelopmentSpendingPolicyGrantVerifier`.
- `verifiedGrantMatchesMandate` -> `verifiedGrantMatchesSpendingPolicy`.
- `evaluateStandingMandatePolicy` -> `evaluateSpendingPolicy`.
- `parseStandingMandateInput` -> `parseSpendingPolicyInput`.
- `standingMandateMaterialValid` -> `spendingPolicyMaterialValid`.
- `parseStandingMandateSnapshot` -> `parseSpendingPolicySnapshot`.
- `mandateIntegrityValid` -> `spendingPolicyIntegrityValid`.
- `MandateRefusalCode` -> `SpendingPolicyRefusalCode` and each standing-policy
  `mandate_*` refusal/error value -> the corresponding `spending_policy_*`
  value.
- In this family, `standingMandate`, `mandateRef`, `mandateVersion`,
  `mandateGeneration`, `admittedMandateDigest`, `inspectMandate` and
  `requireMandate` -> `spendingPolicy`, `spendingPolicyRef`,
  `spendingPolicyVersion`, `spendingPolicyGeneration`,
  `admittedSpendingPolicyDigest`, `inspectSpendingPolicy` and
  `requireSpendingPolicy` respectively.
- `standing_mandate_use` -> `spending_policy_use`, including the matching
  `authorizeStandingMandateUse` -> `authorizeSpendingPolicyUse` method and
  `standingPolicyRef`/`standingPolicyDigest` ->
  `spendingPolicyRef`/`spendingPolicyDigest` fields where the values identify
  the reusable policy.
- `mandate_or_explicit` -> `spending_policy_or_explicit` for the AE-owned
  capability effect/authority classification. The `explicit` branch remains a
  request authorization/Approval path and is not converted into a policy.

The policy source filenames have these exact targets:

- `src/modules/action-execution/standing-mandate-grant.ts` ->
  `src/modules/action-execution/spending-policy-grant.ts`
- `src/modules/action-execution/standing-mandate-policy.ts` ->
  `src/modules/action-execution/spending-policy-evaluation.ts`
- `src/modules/action-execution/standing-mandate-validation.ts` ->
  `src/modules/action-execution/spending-policy-validation.ts`
- `src/modules/action-execution/standing-mandate.ts` ->
  `src/modules/action-execution/spending-policy.ts`

The policy-specific development names are also exact: `bounded-mandate` in
AE-owned evidence/test names becomes `spending-policy`; `full-yolo` becomes
`unrestricted-test-only` where it names the authority mode. Do not rename an
upstream protocol, provider/seller, credential or financial namespace.

### Request authorization and Approval family

- `CustomerRequestMandateAuthorityBasis` ->
  `CustomerRequestAuthorizationAuthorityBasis`.
- `customer_request_mandate_use` -> `customer_request_authorization_use`.
- `mandateRef`/`mandateDigest` in that request-specific basis ->
  `requestAuthorizationRef`/`requestAuthorizationDigest`.
- `standing_low_risk` in the nested authorization discriminator ->
  `spending_policy_low_risk`; its `standingPolicyRef`/`standingPolicyDigest`
  fields become `spendingPolicyRef`/`spendingPolicyDigest`.
- Any `requestMandate`, `request_mandate`, `requestMandateRef` or
  `requestMandateDigest` occurrence -> `requestAuthorization`,
  `request_authorization`, `requestAuthorizationRef` or
  `requestAuthorizationDigest`. The baseline scan found no exact
  `requestMandate` identifier; this explicit mapping prevents a concurrent
  untracked caller from choosing a different term.
- Request-specific `mandate_*` refusal/error values ->
  `request_authorization_*`; do not apply the standing-policy error mapping to
  a one-request authorization.
- `approve_each` -> `approval_required` in AE-owned authority modes and
  persisted authority discriminators; the recorded Approval remains one
  person's authorization and is not a Spending policy.

### Authority modes and AE-owned scopes

Apply these values and their constant/type lookup tables exactly throughout the
allowlist:

- `inspect_only` -> `read_only`.
- `approve_each` -> `approval_required`.
- `bounded_mandate` -> `spending_policy`.
- `full_yolo` -> `unrestricted_test_only`.
- `mandate_eligible` -> `policy_eligible`.
- `market_operations:invoke` -> `market_tools:call`.
- `customer_requests:inspect_only` -> `customer_requests:read_only`.
- `customer_requests:approve_each` -> `customer_requests:approval_required`.
- `customer_requests:bounded_mandate` -> `customer_requests:spending_policy`.
- `customer_requests:full_yolo` -> `customer_requests:unrestricted_test_only`.

Keep `market_supply:manage`, `customer_requests:create` and
`customer_requests:standing_authority` unchanged. Keep standard OAuth grant,
PKCE, token, `profile: 'supplier'`, `operationId`, MCP and x402 semantics
unchanged; issue 14 owns AE Provider wording and issue 19 owns public action
IDs/routes. Production must continue to refuse the unrestricted test mode,
not merely relabel it.

### Canonical-material ownership and handoff

Issue 12 owns the policy/authorization mode and discriminator slice. Issue 13
owns the Tool-selection field crossing in `src/modules/agent-access/policy.ts`
(`operationAccess` -> `toolAccess`, `operationRefs` -> `toolRefs`, and
`selected_operations` -> `selected_tools`) and its existing policy-digest
adapter. Do not duplicate that adapter or introduce a second digest helper in
this issue. The issue 13 worker must consume this issue's mode mapping and
preserve the vectors below.

For the policy/authorization fields that this issue does rename, the existing
protected material is the canonical input. The source-facing target field or
value is projected to the old key/value only at the existing encoder or
normalizer that already owns that material:

| Target source field/value | Protected canonical key/value | Boundary and rule |
| --- | --- | --- |
| `spendingPolicy` (current `policy`) | `policy` | AE-owned grant input/readback naming only; v1/v2 nested policy shape and digest input remain exact. |
| `spendingPolicyDigest` (current `policyDigest`) | `policyDigest` | Rename the source field only; never recompute or reinterpret an existing digest. |
| `approval_required` (current `approve_each`) | `approve_each` | Existing protected authority material and legacy records; fresh target rows may use the new discriminator through the existing codec. |
| `spending_policy` (current `bounded_mandate`) | `bounded_mandate` | Existing standing-policy material and digest; preserve the production/sandbox decision and ordering. |
| `unrestricted_test_only` (current `full_yolo`) | `full_yolo` | Existing protected material; production refusal remains enforced. |
| `read_only` (current `inspect_only`) | `inspect_only` | Existing protected authority material; the target is not a permission broadening. |
| `policy_eligible` (current `mandate_eligible`) | `mandate_eligible` | Existing protected eligibility material; preserve the same comparison result. |
| `spending_policy_use` (current `standing_mandate_use`) | `standing_mandate_use` | Existing durable authority/canonical-claim material; new persisted discriminators require the existing decode/encode boundary and fresh-row proof. |
| `customer_request_authorization_use` (current `customer_request_mandate_use`) | `customer_request_mandate_use` | Same boundary; this remains request-specific and cannot become reusable policy. |
| `spending_policy_low_risk` (current `standing_low_risk`) | `standing_low_risk` | Nested request authorization material only; `explicit` remains the Approval path. |
| `requestAuthorizationRef`/`requestAuthorizationDigest` (current `mandateRef`/`mandateDigest`) | `mandateRef`/`mandateDigest` | Request-specific authority material only; digest bytes and retry/expiry inputs remain unchanged. |
| `spendingPolicyRef`/`spendingPolicyDigest` (current `standingPolicyRef`/`standingPolicyDigest`) | `standingPolicyRef`/`standingPolicyDigest` | Reusable-policy reference material only; retain the old evidence and exact digest. |

The single agent-access policy digest owner remains the existing
`agentAccessPolicyDigest` function in `src/modules/agent-access/policy.ts`.
Its input is the protected canonical policy object after the issue 13 Tool
selection projection; it must not hash a newly named outer object directly.
`normalizeStoredAgentAccessGrant` at the current v2 and legacy validation
branches (lines 321 and 334 in the baseline) must use that same owner or its
existing v1/v2 branch, never a competing direct digest definition. The worker
must retain the v1 omission of `operationRefs` and the v2 sorted-selection
normalization. This is the only small AE-owned encoder adjustment permitted
for this issue; root has approved its necessity in principle, but dispatch
still requires the literal vectors and before/after map below. If preserving
bytes would require changing a protected format, return a blocker and do not
add a compatibility wrapper.

## Finite editable file allowlist

The following are literal paths. Paths under `src/modules/action-execution`
are the post-issue-11 targets; issue 11 owns their preceding directory move.
Each shared path is serialized in the order stated under Dependencies.

### Policy and agent-access contracts

- `src/modules/action-execution/contracts.ts`
- `src/modules/action-execution/canonical-claim.ts`
- `src/modules/action-execution/durable.ts`
- `src/modules/action-execution/in-memory.ts`
- `src/modules/action-execution/internal/convex-schema.ts`
- `src/modules/action-execution/internal/durable-contracts.ts`
- `src/modules/action-execution/execution-public.ts`
- `src/modules/action-execution/runtime.ts`
- `src/modules/action-execution/index.ts`
- `src/modules/action-execution/spending-policy-grant.ts`
- `src/modules/action-execution/spending-policy-evaluation.ts`
- `src/modules/action-execution/spending-policy-validation.ts`
- `src/modules/action-execution/spending-policy.ts`
- `src/modules/agent-access/contract.ts`
- `src/modules/agent-access/policy.ts`
- `src/modules/agent-access/policy.functions.ts`
- `src/modules/agent-access/agent-access.ts`
- `src/modules/agent-access/agent-access.functions.ts`
- `src/modules/agent-access/oauth-state.ts`
- `src/modules/agent-access/production-policy.ts`
- `src/modules/agent-access/sandbox-policy.ts`
- `src/modules/agent-access/internal/convex-schema.ts`
- `src/modules/agent-access/internal/oauth-convex-schema.ts`
- `src/modules/agent-access/internal/principal-convex-schema.ts`
- `src/components/ae/agent-access/AeAgentAccessAuthorizeForm.tsx`
- `src/components/ae/console/AeAgentOperatorConsole.tsx`

The qualified `AgentAccessPrincipal`/`agentAccessPrincipals` binding and its
generic principal/credential fields remain protected as issue 10 specified.
Issue 12 may update the authority-mode literals in these exact validators and
contracts, but may not rename the binding family or create another table.

### Convex policy and authority consumers

- `convex/agentAccessOAuth.ts`
- `convex/agentAccessPolicy.ts`
- `convex/agentAccessPrincipals.ts`
- `convex/agentDirectory.ts`
- `convex/authorityBoundary.ts`
- `convex/capabilityOperationInvocationIdentity.ts`
- `convex/capabilitySupplyCanaryFunding.ts`
- `convex/capabilitySupplyGraph.ts`
- `convex/capabilitySupplyOperationQueries.ts`
- `convex/capabilitySupplyOwnerCanary.ts`
- `convex/catalogOfferingMutations.ts`
- `convex/chatTools.ts`
- `convex/devSeed.ts`
- `convex/lib/operationInvocations/admission.ts`
- `convex/lib/operationInvocations/contracts.ts`
- `convex/lib/operationInvocations/invokeActions.ts`
- `convex/lib/providerConnections/agent.ts`
- `convex/moneyLedgerValues.ts`
- `convex/securityAccountHistory.test.ts`
- `convex/serviceAssertion.ts`

These files may update only the policy/authority fields, error values and
scope/mode values identified above. Paid operation/invocation/Quote/Call table
names and external operation references remain with later owners.

### Capability, transport and action metadata consumers

- `src/modules/capability-execution/internal/convex-schema.ts`
- `src/modules/capability-execution/invocation-material.ts`
- `src/modules/capability-execution/invocation-worker/jitProviderConsequence.ts`
- `src/modules/capability-execution/invocation-worker/runPreparation.ts`
- `src/modules/capability-execution/invocation-worker/runRelease.ts`
- `src/modules/capability-execution/invocation-worker/x402Route.ts`
- `src/modules/capability-execution/operation-invoke-admit.ts`
- `src/modules/capability-execution/operation-invoke-contracts.ts`
- `src/modules/capability-execution/operation-invoke.actions.ts`
- `src/modules/capability-execution/operation-invoke.ts`
- `src/modules/capability-execution/operation-recovery.actions.ts`
- `src/modules/capability-supply/internal/route-transport-http-json.ts`
- `src/modules/capability-supply/internal/route-transport-invoke.ts`
- `src/modules/capability-supply/internal/operation-detail-compare.ts`
- `src/modules/capability-supply/internal/operation-project.ts`
- `src/modules/capability-supply/internal/operation-projection-types.ts`
- `src/modules/capability-supply/internal/operation-projection-wire-serialize.ts`
- `src/modules/capability-supply/internal/operation-search.ts`
- `src/modules/capability-supply/operation-schemas.ts`
- `src/modules/capability-supply/public.ts`
- `src/modules/capability-supply/supplied-quote.actions.ts`
- `src/modules/capability-supply/supply-actions.ts`
- `src/modules/capability-supply/supply-publication-v2.ts`
- `src/modules/capability-contract/internal/define-contract.ts`
- `src/modules/common/action.ts`
- `src/modules/market/suggested-continuation.ts`
- `src/lib/http/oauth-challenge.ts`
- `src/lib/server/agent-access-oauth-api.ts`
- `src/lib/server/agent-access-oauth-store.ts`
- `src/lib/server/agent-access-oauth/protocol.ts`
- `src/lib/server/mcp-api.ts`
- `src/modules/registry/operation-choice-contracts.ts`

`AE-Mandate-Digest` becomes `AE-Spending-Policy-Digest` only at the AE-owned
route-transport header boundary in the two named transport files. Preserve any
upstream header/value required by the Provider protocol. `mandateDigest` and
`grantDigest` fields are mapped only when they are AE-owned policy references;
their digest bytes are protected below.

### Policy fixtures and tests

- `tests/unit/action-execution/bounded-mandate-packet.test.ts` ->
  `tests/unit/action-execution/spending-policy-packet.test.ts`
- `tests/unit/action-execution/full-yolo.test.ts` ->
  `tests/unit/action-execution/unrestricted-test-only.test.ts`
- `tests/unit/action-execution/standing-mandate.test.ts` ->
  `tests/unit/action-execution/spending-policy.test.ts`
- `tests/unit/action-execution/neutral-contract-boundary.test.ts`
- `tests/unit/agent-access-policy.test.ts`
- `tests/unit/agent-access-production-policy.test.ts`
- `tests/unit/agent-access-sandbox-policy.test.ts`
- `tests/unit/agent-access.test.ts`
- `tests/unit/agent-access-functions.test.ts`
- `tests/unit/agent-access-oauth-state.test.ts`
- `tests/unit/agent-access/account-actions.test.ts`
- `convex/agentAccessOAuth.test.ts`
- `convex/agentAccessPolicy.test.ts`
- `convex/agentAccessPrincipals.test.ts`
- `tests/unit/convex/authority-boundary.test.ts`
- `tests/unit/convex/capability-operation-approval.test.ts`
- `tests/unit/convex/capability-operation-authority-boundary.test.ts`
- `tests/unit/capability-execution/operation-invoke-admit.test.ts`
- `tests/unit/capability-execution/operation-invoke-harness.ts`
- `tests/unit/capability-execution/operation-invoke-authority.test.ts`
- `tests/unit/capability-execution/operation-invoke-dispatch.test.ts`
- `tests/unit/capability-execution/operation-recovery-actions.test.ts`
- `tests/unit/capability-supply/provider-approval.test.ts`
- `tests/unit/capability-supply/supply-actions.test.ts`
- `tests/unit/capability-supply/supplied-candidate-quote-authority.test.ts`
- `tests/unit/capability-supply/supplied-candidate-quote-harness.ts`
- `tests/unit/convex/capability-operation-recovery.test.ts`
- `tests/unit/convex/capability-operation-reservation.test.ts`
- `tests/unit/convex/capability-operation-worker-harness.ts`
- `tests/unit/convex/capability-supply-readiness-authority.test.ts`
- `tests/unit/convex/market-demand-signals.test.ts`
- `tests/unit/convex/money-account-funding.test.ts`
- `tests/unit/convex/seller-onboarding-canary-funding-readiness.test.ts`
- `tests/unit/convex/provider-connection-agent-lifecycle.test.ts`
- `tests/unit/capability-execution/operation-history-actions.test.ts`
- `tests/unit/actions/registry.test.ts`
- `tests/unit/chat/chat-system.test.ts`
- `tests/unit/market-demand/market-demand-actions.test.ts`
- `tests/unit/discovery/cli-distribution.test.ts`
- `tests/unit/market-terminal/account.test.ts`
- `tests/unit/market-terminal/cold-loop.test.ts`
- `tests/unit/market-terminal/doctor.test.ts`
- `tests/unit/market-terminal/manifest-oauth.test.ts`
- `tests/unit/market-terminal/supply.test.ts`
- `tests/unit/market-terminal/suggested-continuation-adapter.test.ts`
- `tests/unit/market/suggested-continuation.test.ts`
- `tests/unit/routes/agent-access-authorize.test.tsx`
- `tests/unit/routes/agent-access-caller-continuation.test.tsx`
- `tests/unit/routes/agent-access-console.test.ts`
- `tests/unit/routes/oauth-metadata.test.ts`
- `tests/unit/server/agent-access-auth.test.ts`
- `tests/unit/server/agent-access-oauth-api.test.ts`
- `tests/unit/server/agent-access-oauth-store.test.ts`
- `tests/unit/server/agent-account-api.test.ts`
- `tests/unit/server/mcp-api-protocol.test.ts`
- `tests/unit/server/mcp-api-tools-list.test.ts`
- `tests/unit/server/operation-invoke-api.test.ts`
- `tests/unit/server/operation-history-api.test.ts`
- `tests/unit/server/operation-recovery-api.test.ts`
- `tests/unit/server/supply-action-api.test.ts`
- `tests/unit/money/account-funding-http.test.ts`
- `tests/fixtures/capability-contract-v2.ts`
- `tests/unit/capability-contract/capability-contract.test.ts`
- `tests/unit/capability-contract/decision-model.test.ts`
- `tests/unit/capability-contract/preparation-projection.test.ts`
- `tests/helpers/durable-write-fixture-action.ts`
- `tests/unit/ui/agent-access-owner-console.test.tsx`
- `tests/unit/ui/demand-console.test.tsx`
- `tests/integration/capability-operation-workpool.test.ts`
- `tests/integration/capability-publication-probe.test.ts`
- `tests/integration/capability-supply-owner-funnel-harness.ts`
- `tests/e2e/authenticated/multi-agent-lifecycle.spec.ts`
- `tests/imports/operation-surface-conformance.test.ts`
- `tests/unit/schema/convex-schema.test.ts`

### Development evidence and seed fixtures

- `tools/dev/bounded-mandate-evidence-packet.ts` ->
  `tools/dev/spending-policy-evidence-packet.ts`
- `tools/dev/full-yolo-evidence-packet.ts` ->
  `tools/dev/unrestricted-test-only-evidence-packet.ts`
- `tools/dev/full-yolo-process-worker.ts` ->
  `tools/dev/unrestricted-test-only-process-worker.ts`
- `tools/dev/fixtures/provider-operation/development-provider-operation-evidence.ts`
- `tools/dev/fixtures/provider-operation/development-provider-operation-mandate.ts` ->
  `tools/dev/fixtures/provider-operation/development-provider-operation-spending-policy.ts`
- `tools/dev/fixtures/provider-operation/development-provider-operation-objective.ts`
- `tools/dev/fixtures/provider-operation/development-provider-operation-recovery.ts`
- `tools/dev/fixtures/provider-operation/development-provider-operation-runner.ts`
- `tools/dev/fixtures/provider-operation/development-provider-operation.actions.ts`
- `tools/dev/fixtures/capability-supply/development-evidence-fixture.ts`
- `tools/dev/fixtures/capability-supply/development-published-operation-evidence.ts`
- `tools/dev/fixtures/capability-supply/development-alternate-published-operation-evidence.ts`
- `tools/dev/x402-local-canary.ts`
- `package.json` (only the existing policy/evidence script names and paths;
  shared with issue 11 and serialized after it)

## Protected digest, format and identity material

The following is a hard dispatch/closure gate, not a suggestion:

- `src/modules/agent-access/policy.ts:213-214` is the single
  `agentAccessPolicyDigest` owner. It currently hashes the canonical policy
  object. Lines 321 and 334 reject a stored grant if the normalized v2 or
  legacy policy digest differs. The worker must retain this one owner and make
  both validation branches use its existing v1/v2 path; do not leave a second
  direct `canonicalDigest` definition in the normalizer.
- The issue 13 Tool-selection adapter in `policy.ts` projects target
  `toolAccess`/`toolRefs`/`selected_tools` back to the protected
  `operationAccess`/`operationRefs`/`selected_operations` input before this
  owner hashes it. Issue 12 must not duplicate or redesign that adapter. The
  mode/authorization projection table above is this issue's slice and applies
  at the existing action-execution canonical-claim/policy codec boundaries.
- `normalizeStoredAgentAccessPolicy` and
  `normalizeStoredAgentAccessGrant` are the only existing normalization/codec
  boundaries available for a target outer field shape. If a target
  `spendingPolicy`/`requestAuthorization` field needs translation, perform it
  there only when the normalized protected material and digest remain exactly
  equal. Root has approved this small AE-owned encoder adjustment in principle
  because it is necessary to preserve protected bytes; dispatch still requires
  the literal vectors and before/after map below. If it cannot preserve bytes,
  return a concrete blocker; do not add a new codec, compatibility framework
  or alias.
- Keep `ae.agent-access-policy:v1`, `ae.agent-access-policy:v2`,
  `ae.agent-access-grant:v1`, `ae.agent-access-grant:v2`, their canonical
  field ordering, `operationAccess`/`operationRefs` keys and values, and all
  digest/hash keys stable inside protected material. The later Tool adapter
  may rename source fields but may not silently change these bytes.
- `src/modules/action-execution/spending-policy.ts` (renamed from
  `standing-mandate.ts`) computes policy, authority-use and policy-decision
  digests over whole material. Preserve its format literals, canonical key
  order, opaque refs and digest bytes through an existing codec boundary. Add
  normalized-equivalence vectors to the renamed standing-policy test; do not
  regenerate historical evidence with new bytes.
- `src/modules/capability-execution/operation-invoke.ts:345-398` has the
  protected `operation-invoke-authority:v1` material and decision digest. Its
  `acceptedBasis` may be renamed at the outer type boundary only if the
  serialized material and digest vectors remain byte-identical.
- `src/lib/server/operation-invoke-api.ts` is not an issue 12 boundary: its
  inspection `input` is the declared opaque Provider/Tool argument object.
  Preserve that object verbatim, including any user-supplied keys that happen
  to contain `requestMandate` or `operationRef`; do not invent a nested
  request-authorization schema or remapping there. Public contract and
  top-level reference hash crossings belong to issues 13, 15, 16 and 19.
- Keep `issued-agent-principal:v2`, `agentPrincipalRef` in the agent-audit
  hash object, generic IAM principal/account/credential fields, opaque IDs,
  signatures, OAuth standard values, x402 fields and external financial
  namespaces unchanged. Issue 10 owns the audit field boundary; issue 12 only
  changes policy/mode values where its own codec permits.

### Required baseline digest vectors

These are literal Node 22 outputs from the existing policy fixtures, using
`stableStringify` as the canonical JSON representation. The worker must put
the same strings and digests in the renamed test (and add the grant wrapper
assertions); these values are dispatch evidence, not a license to rewrite
historical rows:

- v2 all-admitted sandbox policy (`defaultSandboxAgentAccessPolicy({ currency:
  'USD', exponent: 2 })`):
  `{"budget":{"budgetPolicyRef":"budget:sandbox:USD:2","currency":"USD","exponent":2,"generation":1,"maximumConcurrentInvocations":1,"maximumDailySpend":{"currency":"USD","exponent":2,"units":"500"},"maximumMonthlySpend":{"currency":"USD","exponent":2,"units":"2000"},"maximumSpendPerInvocation":{"currency":"USD","exponent":2,"units":"100"}},"environment":"sandbox","format":"ae.agent-access-policy:v2","operationAccess":"all_admitted","operationRefs":[],"rate":{"generation":1,"maximumCallsPerHour":300,"maximumCallsPerMinute":30,"ratePolicyRef":"rate:sandbox:operations-invoke"}}` ->
  `sha256:0428ecf16ad51cbb94667b7dbe04061f52c54c0010c5ea5c0d76f07726bf034b`.
- v2 selected policy with sorted refs
  `operation:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`
  and
  `operation:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`:
  `{"budget":{"budgetPolicyRef":"budget:sandbox:USD:2","currency":"USD","exponent":2,"generation":1,"maximumConcurrentInvocations":1,"maximumDailySpend":{"currency":"USD","exponent":2,"units":"500"},"maximumMonthlySpend":{"currency":"USD","exponent":2,"units":"2000"},"maximumSpendPerInvocation":{"currency":"USD","exponent":2,"units":"100"}},"environment":"sandbox","format":"ae.agent-access-policy:v2","operationAccess":"selected_operations","operationRefs":["operation:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","operation:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],"rate":{"generation":1,"maximumCallsPerHour":300,"maximumCallsPerMinute":30,"ratePolicyRef":"rate:sandbox:operations-invoke"}}` ->
  `sha256:d8ff1d4528347f881fab31c2236434a5e6982e96be90873166f505ba3648b1ea`.
  Reversing the input refs must produce this same digest.
- legacy v1 policy: the v2 all-admitted string with `format` changed to
  `ae.agent-access-policy:v1` and the `operationRefs` key omitted ->
  `sha256:b1b2858d7900f8d798f1fd8bac36c55fe037774a0a5c0da71dce4ddb567dc263`.
  Legacy normalization must retain the v1 format, omitted key and digest.
- With the existing `grant-1` fixture (principal `principal-1`, owner
  `owner-1`, application `app-1`, credential `credential-1`, sandbox,
  `authorityMode:"approve_each"`, generation 1, timestamps 1/1/10000), the
  v2 grant's nested `policyDigest` is the first digest above and the stable
  whole-grant diagnostic digest is
  `sha256:feddb9427d766daece86a04c08465aa3205c671961163b0e0b8cc5588b548803`.
  The v1 grant retains no top-level `operationRefs`, has
  `format:"ae.agent-access-grant:v1"`, nested v1 policy, and
  `policyDigest:"sha256:b1b2858d7900f8d798f1fd8bac36c55fe037774a0a5c0da71dce4ddb567dc263"`;
  its stable whole-grant diagnostic digest is
  `sha256:f4615e86325f6e4c6ecb42b17155add7f4b8498f4840c5e2935e80e78d47779b`.
  The whole-grant digests are comparison evidence only; `policyDigest` remains
  the persisted policy field and the policy owner above remains authoritative.

The renamed test must also exercise the exact target mode values and assert
that the protected canonical projection produces these unchanged policy
digests. A target source field may differ, but the canonical strings above,
v1 omission rules, sorted selection and digest bytes may not.

Persisted target discriminators (`spending_policy_use`,
`customer_request_authorization_use`, `approval_required`) may change only in
fresh current rows or through an existing decode/encode boundary that retains
old evidence and proves the exact protected vectors. Do not edit backup
archives to simulate table/field renames and do not claim historical rows have
been migrated in this issue.

## Explicit exclusions

- Do not rename `AgentAccessPrincipal`, `agentAccessPrincipals`, generic
  `Principal`, `Account`, `Business`, `User`, `Credential`, `DelegationGrant`,
  `principalId`, `principalRef`, `operationKeys` or generic IAM tables.
- Do not rename paid `capabilityOperationInvocations`,
  `capabilityOperationCommitments`, `capabilityOperationCalls`, their physical
  tables, paid `operationRef`/`invocationRef` identities, Quote/Call fields or
  their external routes; issues 15–19 own them.
- Do not rename upstream OpenAPI `operationId`, MCP methods, OAuth standard
  fields, x402 payment fields, Provider/Seller/payment-recipient values,
  financial namespaces or opaque hash/signature formats.
- Do not make a reusable Spending policy mandatory for every Call, merge
  Approval with a policy, invent a `requestMandate` compatibility alias, add a
  migration engine, add a dependency, change production authorization order,
  or weaken refusal/expiry/revocation assertions.
- Do not edit generated `convex/_generated` output; issue 22 owns generation.
  Do not reset a database, deploy, modify external evidence, stage/commit or
  overwrite unrelated dirty/untracked files.

## Dependencies and sequencing

- Dispatch is blocked by baseline 08, canonical authorities 09, the exact
  Customer/Agent boundary in issue 10, generic module/table move 11 and
  independent reviews 29 and 30.
- Shared source writers are serialized `10 -> 11 -> 12`. Issue 12 starts only
  after issue 11's target paths and generic `executionRef` boundary are stable;
  issues 13–18 consume the new policy names in their own Tool/Provider/Quote/
  Call slices.
- The HTTP inspection input remains an opaque Provider/Tool argument object;
  issue 12 does not reinterpret or rename keys inside it. Issue 13 separately
  owns the Tool-selection adapter in `src/modules/agent-access/policy.ts`;
  neither later owner may replace that canonical-material boundary without
  rerunning the literal vectors.
- Issue 22 owns generated Convex/router/CLI/public output. The coordinator may
  run its existing generator after issue 11 and again after issue 12; issue 12
  does not edit generated files. `test:imports` is an integration checkpoint,
  not a preparation command.
- The digest-vector/codec review is a dispatch prerequisite within this issue.
  Any unavoidable encoder adjustment is recorded for root before source work;
  unresolved byte-preservation is a blocker, not a reason to invent a wrapper.

## Verification commands and expected results

Run after dispatch with Node 22/npm 11.5.1 through the repository runner:

1. `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npx vitest run tests/unit/action-execution/spending-policy-packet.test.ts tests/unit/action-execution/unrestricted-test-only.test.ts tests/unit/action-execution/spending-policy.test.ts tests/unit/action-execution/neutral-contract-boundary.test.ts tests/unit/agent-access-policy.test.ts tests/unit/agent-access-production-policy.test.ts tests/unit/agent-access-sandbox-policy.test.ts tests/unit/agent-access.test.ts tests/unit/agent-access-functions.test.ts tests/unit/agent-access-oauth-state.test.ts tests/unit/convex/authority-boundary.test.ts tests/unit/convex/capability-operation-approval.test.ts tests/unit/convex/capability-operation-authority-boundary.test.ts tests/unit/capability-execution/operation-invoke-admit.test.ts tests/unit/capability-execution/operation-invoke-authority.test.ts tests/unit/capability-execution/operation-invoke-dispatch.test.ts tests/unit/capability-execution/operation-recovery-actions.test.ts tests/unit/capability-supply/provider-approval.test.ts tests/unit/capability-supply/supply-actions.test.ts tests/unit/capability-supply/supplied-candidate-quote-authority.test.ts tests/unit/convex/capability-operation-recovery.test.ts tests/unit/convex/capability-operation-reservation.test.ts tests/unit/convex/capability-supply-readiness-authority.test.ts tests/unit/discovery/cli-distribution.test.ts tests/unit/market-terminal/cold-loop.test.ts tests/unit/market-terminal/manifest-oauth.test.ts tests/unit/routes/agent-access-authorize.test.tsx tests/unit/routes/oauth-metadata.test.ts tests/unit/server/agent-access-auth.test.ts tests/unit/server/agent-access-oauth-api.test.ts tests/unit/server/agent-access-oauth-store.test.ts tests/unit/server/mcp-api-protocol.test.ts tests/unit/server/mcp-api-tools-list.test.ts tests/unit/server/operation-invoke-api.test.ts tests/unit/schema/convex-schema.test.ts --no-file-parallelism` — policy/authorization, production refusal, request Approval, scope and affected-admission tests pass.
2. `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npx vitest run convex/agentAccessOAuth.test.ts convex/agentAccessPolicy.test.ts convex/agentAccessPrincipals.test.ts tests/unit/agent-access/account-actions.test.ts tests/unit/actions/registry.test.ts tests/unit/capability-contract/capability-contract.test.ts tests/unit/capability-contract/decision-model.test.ts tests/unit/capability-contract/preparation-projection.test.ts tests/unit/capability-execution/operation-history-actions.test.ts tests/unit/chat/chat-system.test.ts tests/unit/convex/money-account-funding.test.ts tests/unit/convex/seller-onboarding-canary-funding-readiness.test.ts tests/unit/market-demand/market-demand-actions.test.ts tests/unit/market-terminal/suggested-continuation-adapter.test.ts tests/unit/money/account-funding-http.test.ts tests/unit/routes/agent-access-caller-continuation.test.tsx tests/unit/routes/agent-access-console.test.ts tests/unit/server/operation-history-api.test.ts tests/unit/server/operation-recovery-api.test.ts tests/unit/server/supply-action-api.test.ts --no-file-parallelism` — every direct mode/scope and capability-authority caller in the added allowlist passes; the opaque inspection-input behavior remains unchanged in the existing operation-invoke API tests. Run after issue 12 implementation, not during ticket preparation.
3. `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run typecheck` — pass with no stale policy/mode/authority types.
4. `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run test:types` — pass; generated type coupling is included after issue 22's checkpoint.
5. `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run check:convex-codegen` — pass after issue 22 regenerates the exact target schema.
6. `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run test:conformance` — pass for authority, cancellation/recovery and paid admission invariants at the integration checkpoint.
7. After issue 22's generator/build checkpoint: `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run test:imports` — pass; no new checker is introduced.
8. The existing tests record exact pre-refactor normalized policy JSON/digest, standing-policy whole-material digests, operation-authority decision digests and audit/credential-event vectors. Post-refactor target shapes normalize to the same protected bytes; malformed, stale, expired, revoked, over-limit, production-unrestricted and wrong-principal cases still refuse.
9. Scoped `rg` over exactly the allowlist — no unprotected standing-mandate/request-mandate/mode/scope occurrence remains; remaining old values are explicitly protected format/hash/protocol/history occurrences or later paid/Provider owners. No `requestMandate` alias is added.

The coordinator baseline is separate evidence: typecheck passed; unit passed
459 files/4,041 tests; integration passed 112 files/1,083 tests with one
skipped file and four skipped tests; `test:types` passed one file/four tests;
and `test:ts-standards` failed 26 pre-refactor findings. Do not waive or
reclassify these findings in this issue, and do not run a broad suite during
preparation.

## Acceptance

- [ ] Standing policy source/contracts/validators use Spending policy names;
      request-specific authority uses Request authorization/Approval names;
      the two families cannot be confused by a generic mandate field.
- [ ] Exact authority mode and scope mappings are applied, with
      `market_supply:manage`, `customer_requests:create` and
      `customer_requests:standing_authority` preserved and production still
      refusing unrestricted test access.
- [ ] Limits, expiry, generation, revocation, approval requirements, policy
      ordering and one-request retry/recovery behavior remain unchanged; a
      standing policy is not made a universal Call prerequisite.
- [ ] Agent-access, action-execution, capability, transport, UI, seed and
      development fixtures in the allowlist agree on the target vocabulary;
      generated output is current through issue 22 and no paid Call family is
      renamed here.
- [ ] Protected policy/grant formats, canonical field ordering, hash keys,
      digest bytes, opaque IDs, signatures, audit vectors and external protocol
      values remain stable. Any necessary existing codec adjustment has a
      documented necessity and root review; no compatibility framework exists.
- [ ] Focused authority/policy tests, type/codegen/conformance/import checks
      pass, with any baseline standard failure recorded separately.
- [ ] No schema reset, deployment, backup rewrite, dependency, alias,
      generated-file edit, commit or unrelated change is included.

## Closure evidence

Attach the literal before/after symbol, field, discriminator, mode, scope,
filename and caller map; the policy and grant normalized-JSON/digest vectors;
standing-policy and operation-authority whole-material vectors; audit/credential
stable-ID evidence; focused test/type/codegen/conformance/import output; the
protected old-name exception scan; and per-file comparison with the Phase 0
source archive. Record the existing codec boundary used and its documented
necessity. Do not resolve this issue while a worker has changed a protected
hash byte, made Approval reusable, left a listed consumer on old terms or
silently added a compatibility alias.

## Comments

- 2026-09-05 — Prepared from the current policy/mode/scope inventory and the
  accepted plan. Shared writers are serialized after issues 10 and 11 and
  before Tool/Provider/Quote/Call consumers.
- 2026-09-05 — Engineering review F2 and coordinator direction require exact
  normalized-equivalent vectors around `src/modules/agent-access/policy.ts`
  lines 213–214, 321 and 334. The existing normalizers are the only permitted
  codec boundary; any encoder change needs root review before dispatch.
- 2026-09-05 — Coordinator confirmed issue 13 owns the Tool-selection fields
  and the existing `agentAccessPolicyDigest` adapter; issue 12 owns only the
  authorization modes/discriminators and their protected canonical projection.
  The HTTP inspection `input` is opaque Provider/Tool data and is explicitly
  preserved verbatim rather than given a fictional request-authorization
  remapping.
