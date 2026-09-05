# Rationalise customer and agent terminology at role boundaries

Type: task
Label: wayfinder:task
Mode: AFK
Status: open
Assignee: unassigned (coordinator dispatches a Luna Max worker)
Assigned role: Luna Max / customer-agent terminology owner, max reasoning
Parent: ../map.md
Blocked by: 08, 09, 29, 30

## Outcome

Rename only AE-owned role concepts and their source-contract consumers to
Customer and Agent. A Customer is the purchasing person or organisation. An
Agent is the authorised software actor. Preserve generic IAM identities and
the existing Account, membership, credential and legal-customer bindings. A
credential or an IAM access binding is not renamed to Agent merely because its
payload is used by an Agent.

The worker owns the complete known propagation in the allowlist, including
validators, source mutations, action inputs/results, server adapters, UI copy,
fixtures and tests. There is no definition-only half for another worker to
discover. Supplier/Provider changes remain issue 14, paid purchase changes
remain issues 15–18, and current discovery/plugin copy remains issue 21.

## Exact mappings

Apply these mappings only when the occurrence denotes the canonical AE role:

- `Business Principal` / `BusinessPrincipal` / `businessPrincipal` ->
  `Customer` / `Customer` / `customer`.
- `Agent Principal` / `AgentPrincipal` / `agentPrincipal` -> `Agent` / `Agent`
  / `agent` for a canonical Agent role, action subject, role label or
  customer-facing contract field.
- `agentPrincipalRef` -> `agentRef` only in these identified canonical-Agent
  boundaries: the external `AgentAuditInput` in
  `src/modules/agent-access/agent-audit.ts`, the audit-call object fields in
  `convex/authorityBoundary.ts` and `convex/agentAccessPrincipals.ts`, and the
  local canonical-Agent variable/parameter in `lifecycleMembership` and its
  `convex/securityAccountHistory.test.ts` fixture. The existing audit digest
  material remains the protected exception below.
- `canonicalAgentPrincipal` remains the qualified IAM authority-resolver name
  in `convex/lib/operationInvocations/authorityHandlers.ts`; it is not a
  canonical-Agent aggregate resolver. Do not rename it. Access-binding
  functions listed in the protected section retain their qualified names.
- Customer-facing labels, summaries, empty states, errors and accessibility
  text use `Customer` and `Agent`; do not replace `User`, `Account`, `Business`
  or `Credential` labels where those IAM concepts are intended.

The baseline source scan found no `BusinessPrincipal`, `businessPrincipal` or
`Business Principal` symbol in `convex`, `src`, `tests` or `tools`; do not
invent a source rename for generic `Business` rows. The source and test
callers that contain Agent-role wording are listed below and must be reviewed
field-by-field rather than changed by a global token replacement.

## Finite editable file allowlist

These are the literal files in which the worker may change canonical Agent
role names, role-boundary fields, or their owned tests. A shared file is
serialized with its named downstream owner; the worker changes only the Agent
slice identified in the outcome.

### Agent access and audit contracts

- `src/modules/agent-access/agent-audit.ts`
- `tests/unit/agent-access/agent-audit.test.ts` (new focused test file at this
  exact path, using the existing Vitest setup; no new test infrastructure)
- `src/modules/agent-access/agent-access.ts`
- `src/modules/agent-access/agent-access.functions.ts`
- `src/modules/agent-access/account.actions.ts`
- `src/lib/server/agent-access-auth.ts`
- `src/lib/server/funding-handoff-api.ts`
- `src/modules/money/funding-handoff.actions.ts`

`agent-access.ts` and `agent-access.functions.ts` contain both canonical Agent
lifecycle records and qualified access-binding records. Only canonical role
names and boundary fields may change; the protected access-binding names and
fields below remain exact.

### Convex role consumers

- `convex/authorityBoundary.ts`
- `convex/agentAccessPrincipals.ts`
- `convex/capabilityProviderConnectionAttempts.ts`
- `convex/capabilityProviderOffboarding.ts`
- `convex/capabilitySupplierOperations.ts`
- `convex/capabilitySupplyIntegrationDrafts.ts`
- `convex/capabilitySupplyOwnerFunnelAgentRead.ts`
- `convex/capabilitySupplyOwnerFunnelCommands.ts`
- `convex/capabilitySupplyProbes.ts`
- `convex/capabilitySupplyPublish.ts`
- `convex/chatTools.ts`
- `convex/lib/agentMoneyReads.ts`
- `convex/lib/operationInvocations/authorityHandlers.ts`
- `convex/lib/providerConnections/agent.ts`
- `convex/marketDemandSignals.ts`
- `convex/moneyAccountFunding.ts`
- `convex/moneyBillingAuthorization.ts`
- `convex/moneyLedger.ts`

The exact `agentPrincipalRef` role-field changes in
`convex/authorityBoundary.ts`, `convex/agentAccessPrincipals.ts` and the
`convex/securityAccountHistory.test.ts` fixture are limited to the audit-call
object/local canonical-Agent occurrences identified above. Generic
`principalRef`, `memberPrincipalRef`, `actorPrincipalRef` and IAM access
binding payloads in those same files remain unchanged.

The Provider-named files are shared with issue 14 and the paid invocation
authority file is shared with issues 16 and 18. Issue 10 runs first in the
source-writer sequence; later owners must preserve its Agent mapping and may
not reintroduce `Agent Principal` while changing Provider, Call or money
fields.

### Role and lifecycle tests

- `convex/agentAccessPrincipals.test.ts`
- `convex/securityAccountHistory.test.ts`
- `tests/e2e/authenticated/multi-agent-lifecycle.spec.ts`
- `tests/integration/capability-operation-workpool.test.ts`
- `tests/integration/capability-provider-offboarding.test.ts`
- `tests/integration/capability-supply-integration-draft.test.ts`
- `tests/integration/capability-supply-owner-funnel-harness.ts`
- `tests/integration/capability-supply-owner-funnel-reserve.test.ts`
- `tests/integration/capability-supply-owner-funnel-withdraw-republish.test.ts`
- `tests/integration/provider-connection-attempts.test.ts`
- `tests/unit/agent-access-functions.test.ts`
- `tests/unit/agent-access/account-actions.test.ts`
- `tests/unit/agent-access/service-auth-envelope.test.ts`
- `tests/unit/capability-supply/supply-actions.test.ts`
- `tests/unit/convex/capability-operation-authority-boundary.test.ts`
- `tests/unit/convex/capability-operation-worker-harness.ts`
- `tests/unit/convex/market-demand-signals.test.ts`
- `tests/unit/convex/money-account-funding.test.ts`
- `tests/unit/convex/provider-connection-agent-lifecycle.test.ts`
- `tests/unit/discovery/page-markdown.test.ts`
- `tests/unit/ui/agent-door-page.test.tsx`

## Explicit exclusions

The protected occurrences below are explicit exclusions from the rename unless
the sentence identifies one of the narrowly owned Agent-role fields.

The following are IAM access-binding or identity material, not the canonical
Agent role. They are read-only classification evidence for this issue and may
not be renamed, split, or replaced with an `AgentAccessAgents` table:

- `src/modules/agent-access/internal/principal-convex-schema.ts` — retain the
  `agentAccessPrincipals` table, its `principalId`, `ownerId`, `credentialId`,
  `scopes`, `authorityMode`, grant-generation, policy-digest, lifecycle fields
  and all existing indexes.
- `src/modules/agent-access/internal/convex-schema.ts` — retain generic
  `principalId`, `ownerId`, `credentialId`, grant and policy storage fields.
- `src/modules/agent-access/internal/oauth-convex-schema.ts` — retain OAuth
  access-binding payload names and standard OAuth meanings.
- `src/modules/principal-account/account/convex-schema.ts`
- `src/modules/principal-account/account/public.ts`
- `src/modules/principal-account/account/registry.ts`
- `src/modules/principal-account/account/registry/contracts.ts`
- `src/modules/principal-account/account/registry/validation.ts`
- `src/modules/principal-account/external-identity/convex-schema.ts`
- `src/modules/principal-account/external-identity/public.ts`
- `src/modules/principal-account/external-identity/registry.ts`
- `src/modules/principal-account/principal/convex-schema.ts`
- `src/modules/principal-account/principal/public.ts`
- `src/modules/principal-account/principal/registry.ts`
- `src/modules/principal-account/public.ts`
- `src/modules/principal-account/workload-context/public.ts`
- `src/modules/principal-account/workload-context/workload-context.ts`
- `src/modules/agent-access/issued-agent-binding.ts`

In the qualified access-binding family, retain `AgentAccessPrincipal`,
`agentAccessPrincipals`, `AgentAccessPrincipalRegistration`,
`registerAgentPrincipal`, `recordAgentPrincipal`, `getAgentPrincipal`,
`verifyAgentPrincipalForScope`, `verifySupplyAgentPrincipal`,
`verifyMarketAgentPrincipal`, and the `agentPrincipal` access-binding payload
shape when they operate on `{ principalId, ownerId, credentialId,
applicationRef, environment, scopes, authorityMode }`. These names describe
an IAM binding and its access check, not a new canonical Agent aggregate.

`src/modules/agent-access/agent-audit.ts` has a narrow existing codec boundary:
an external `AgentAuditInput` may use the target `agentRef`, but the normalized
hash object keys `actorPrincipalRef`, `activeAccountRef` and
`agentPrincipalRef`, the `ae.agent-audit:v1` / `ae.agent-credential-observation:v1`
formats, event IDs and canonical digest bytes remain unchanged. Add an exact
before/after vector test at that boundary; do not rename the hash key or add a
compatibility framework. The `issued-agent-principal:v2` material and every
opaque `prn_`, `crd_`, `eib_`, `mem_` and `grt_` value in
`src/modules/agent-access/issued-agent-binding.ts` remain byte-stable.

Preserve generic `Principal`, `Account`, `Business`, `User`, `Credential`,
`DelegationGrant`, `principalId`, `principalRef`, `actorPrincipalRef`,
`ownerPrincipalRef`, `memberPrincipalRef`, `ownerId`, `credentialId`, legal
customer bindings and external identity fields. Do not rename upstream
protocol `seller`, OAuth fields, x402 fields, operation IDs, protected hashes,
signatures, financial namespaces, provider/seller/payment-recipient roles or
the paid `operationRef`/`invocationRef` fields owned by later issues.

Do not edit generated `convex/_generated` output; issue 22 owns regeneration.
Do not edit current discovery/plugin instructions outside this allowlist;
issue 21 owns them. Do not add aliases, a parallel API, a migration engine,
new dependency or a new IAM abstraction.

## Dependencies and sequencing

- Dispatch is blocked by baseline 08, canonical authorities 09 and both
  independent reviews 29 and 30. Their open review findings are not silently
  resolved here.
- Issue 10 is the first shared source writer. Issue 11 depends on its role
  fields and must update only the generic Action execution side. Issue 12
  follows issue 11 for policy/authorization names. Issues 14, 16 and 18
  consume the Agent boundary in serialized shared files.
- Issue 22 owns generated outputs. If source import types require a checkpoint,
  the coordinator dispatches issue 22's existing generator after this issue's
  source patch; issue 10 does not edit generated files.

## Verification commands and expected results

Run only after dispatch, from Node 22/npm 11.5.1 using the repository runner:

1. `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npx vitest run convex/agentAccessPrincipals.test.ts convex/securityAccountHistory.test.ts tests/unit/agent-access/agent-audit.test.ts tests/unit/agent-access-functions.test.ts tests/unit/agent-access/account-actions.test.ts tests/unit/agent-access/service-auth-envelope.test.ts tests/unit/capability-supply/supply-actions.test.ts tests/unit/convex/capability-operation-authority-boundary.test.ts tests/unit/convex/market-demand-signals.test.ts tests/unit/convex/money-account-funding.test.ts tests/unit/convex/provider-connection-agent-lifecycle.test.ts tests/unit/discovery/page-markdown.test.ts tests/unit/ui/agent-door-page.test.tsx --no-file-parallelism` — role, membership, account selection, credential and affected consumer tests pass, including exact audit digest vectors and stable credential-event IDs.
2. `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npx playwright test tests/e2e/authenticated/multi-agent-lifecycle.spec.ts` — authenticated lifecycle journey passes when the configured test environment is available; otherwise record the environment limitation in the issue and leave live acceptance to issue 34.
3. `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run typecheck` — pass with no Agent-boundary type errors.
4. `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run test:types` — pass; this is the existing type-test command, not a new checker.
5. After issue 22's generation checkpoint: `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run test:imports` — pass without module-boundary or built-CLI drift.
6. Scoped old-name review with `rg` over exactly the allowlist — every remaining `Agent Principal`, `AgentPrincipal` or `agentPrincipal` is either a protected access-binding occurrence, the explicit audit codec key, or a later owner’s protected paid/protocol occurrence. No `BusinessPrincipal` source symbol is introduced.

The coordinator baseline is evidence only: typecheck passed; unit passed 459
files/4,041 tests; integration passed 112 files/1,083 tests with one skipped
file and four skipped tests; `test:types` passed one file/four tests; and
`test:ts-standards` failed 26 pre-refactor findings. Issue 10 does not waive or
reclassify those findings, and no broad suite is required during preparation.

## Acceptance

- [ ] Canonical role-bearing source fields, functions, labels and tests use
      Customer/Agent with no blanket Business/User/Account/IAM replacement.
- [ ] Sign-in, account selection, membership, credential replacement/revocation
      and Agent lifecycle consumers retain their existing authorization and
      ownership behavior.
- [ ] The qualified `AgentAccessPrincipal` / `agentAccessPrincipals` IAM family,
      generic principal/account tables and their fields remain intact; no
      `AgentAccessAgents` table or credential-to-Agent collapse is introduced.
- [ ] `AgentAuditInput` has an explicit external target-field boundary while
      the `agentPrincipalRef` hash key, audit formats, IDs and digest vectors
      remain byte-stable; `issued-agent-principal:v2` vectors are unchanged.
- [ ] Shared Provider/paid/money consumers are updated in their owned slices or
      carry an explicit serialized handoff; no old role term is reintroduced.
- [ ] Focused role tests, type tests and the generation/import checkpoint pass;
      authenticated live proof is attached or remains open under issue 34.
- [ ] No generated output, database, deployment, financial record, public
      protocol, dependency, alias or unrelated documentation change is included.

## Closure evidence

Attach the patch and semantic diff, the literal changed-path list, the
field-by-field canonical-vs-protected classification, focused test/type/import
outputs, old-name exception scan, audit before/after digest vectors and the
authenticated journey result or its environment limitation. Include a
per-file comparison against the Phase 0 source archive proving no unrelated
dirty or untracked work was overwritten. Do not resolve this issue until every
acceptance item is evidenced; a definition rename without its listed callers
does not close it.

## Comments

- 2026-09-05 — Prepared from the dirty-tree source inventory and engineering
  finding F4. The coordinator decision retains qualified
  `AgentAccessPrincipal`/`agentAccessPrincipals` access bindings and generic
  principal IDs/refs; it does not authorize an `AgentAccessAgents` table.
- 2026-09-05 — `agentPrincipalRef` in the AE audit input may be exposed as the
  target `agentRef` only at the existing input boundary. The hash JSON key and
  `issued-agent-principal:v2` are protected bytes. This issue is blocked by
  review/dispatch gates and has not changed application source.
