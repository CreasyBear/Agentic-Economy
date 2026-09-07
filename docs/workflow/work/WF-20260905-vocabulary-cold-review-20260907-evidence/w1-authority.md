# Wave 1 authority review

Scope: spending-policy/request authorization; Account/Principal binding; credentials and consent; renamed scopes/enums; generic Action execution distinction. This is a cold, read-only review of the current checkout at HEAD `a51e17b221c6b73851c5873502d8150120ef3aad` and the earlier cutover commits, with particular attention to the source refactor `3770b43bac9bf3ea11478664ee8249ec4ddf505e`.

## Inspected boundaries

- Product and terminology: `PRODUCT.md`, `CONTEXT.md`, repository `AGENTS.md`, and the supplied review brief.
- Agent authority: `src/modules/agent-access/{agent-access,contract,policy,oauth-state,consent-read-model,account.actions}.ts`, `src/lib/server/agent-access-auth.ts`, `convex/{authorityBoundary,interactiveAuthority,agentAccessPrincipals,agentAccessPolicy,sourceWriteAdmission}.ts`.
- Action execution and routing: `src/modules/common/action.ts`, `src/modules/action-execution/{contracts,in-memory}.ts`, `src/modules/actions/{index,tool-contract}.ts`, account/funding HTTP adapters, `src/lib/server/mcp-api.ts`, `tools/ae/commands/{account,manifest}.ts`, and current Call actions/routes.
- Relevant tests and fixtures: `tests/unit/convex/authority-boundary.test.ts`, `tests/unit/agent-access/account-actions.test.ts`, `tests/unit/actions/registry.test.ts`, `tests/unit/server/agent-account-api.test.ts`, and account route method tests.

No source or test files were changed. Per the brief, no broad test suite, compiler, deployment, or external-effect check was run.

## Confirmed findings

### F1 — P1 — expired `agentAccessGrants` row can still authenticate a bearer key

Confidence: 9/10. Provenance: pre-existing/remaining authority-boundary defect; the relevant resolver predates `3770b43bac` and the refactor added normalization/matching without adding this expiry check.

- Location: `convex/authorityBoundary.ts:163-214`, especially:
  - `withIndex('by_credentialId_and_environment_and_lifecycle', ... .eq('lifecycle', 'active'))` loads the access grant by lifecycle only (`:163-175`).
  - The post-load expiry guard is only `credential.expiresAt <= consequenceNow || admission.expiresAt ...` (`:205-209`).
  - The delegation candidate, separately, is checked with `grant.expiresAt > consequenceNow` (`:211-214`).
- Trigger: retain a matching active access-grant row whose `expiresAt <= Date.now()` while the credential, `agentAccessPrincipals` admission, and matching `authorityDelegationGrants` row remain active and unexpired. The persisted schemas permit these timestamps to differ. The resolver then admits the delegation snapshot and returns a canonical authenticated binding at `:264-293`.
- Caller path: external HTTP and MCP authentication calls `resolveAgentAccessPrincipal` (`src/lib/server/agent-access-auth.ts:58-110`), which invokes the public `authorityBoundary:resolveAgentBinding` mutation. The resulting principal is then passed to account, Tool, and Call actions (`src/lib/server/agent-account-api.ts:108-169`; `src/lib/server/mcp-api.ts:452-504`). An expired access policy can therefore continue to authorize these surfaces.
- Evidence/reproduction: the authority fixture seeds independent expiry fields (`tests/unit/convex/authority-boundary.test.ts:544-557`, `:623-657`). Its “expired grant” case at `:328-331` overrides `grant`, which is the delegation row; it does not override `accessGrant`. In the resolver source, there is no comparison of `accessGrant.expiresAt` or `normalizedAccessGrant.expiresAt` against `consequenceNow` before `admitConsequence`.
- Minimal correction direction: require the normalized access grant to be current at the same consequence-time check used for credential/admission and delegation evidence; add a fixture where only `accessGrant.expiresAt` is at or before `now` and assert the resolver refuses without creating a successful authentication result.
- Counterevidence considered: `evaluateAgentAccessTool` checks `grant.expiresAt` (`src/modules/agent-access/policy.ts:672-675`), and the internal `verifyAgentPrincipalForScope` path checks normalized access-grant expiry (`convex/agentAccessPrincipals.ts:1697-1719`). Those checks do not protect the external bearer path, which resolves through `authorityBoundary` instead. Normalization validates the stored shape and policy digest (`src/modules/agent-access/policy.ts:380-432`, `:520-530`) but does not make an expired row current.

### F2 — P2 — Account activity publishes retired `operation` terms and a nonexistent continuation

Confidence: 10/10. Provenance: pre-existing/remaining action contract; `agentAccountActivityAction` and its lines below predate `3770b43bac`, which changed the scope and `operationRef` field but left these strings in place.

- Location: `src/modules/agent-access/account.actions.ts:343-346` says: `Returns charge evidence and invocation references without operation inputs, outputs, bearer secrets, or payment-provider data.` The current activity result is explicitly Call-shaped (`:106-118`, including `callRef` and `toolRef`), and current Call recovery exposes `call.status` (`src/modules/capability-execution/call-recovery.actions.ts:218-246`).
- Location: `src/modules/agent-access/account.actions.ts:362-366` declares `safeContinuations: ['operation.status']`; the registered current action is `call.status` (`src/modules/actions/index.ts:91-96`), with no `operation.status` action (`tests/unit/actions/registry.test.ts:13-30` checks retired operation action IDs are absent).
- Trigger/caller path: an agent asks for the account activity action through MCP or the CLI manifest. MCP builds the tool description directly from `action.boundaries` (`src/lib/server/mcp-api.ts:299-305`, `:570-573`); the CLI manifest includes the full `action.invocationContract` (`tools/ae/commands/manifest.ts:285-293`) and includes the account action/money routes (`:449-455`). The agent receives an obsolete noun in its boundary and, through the manifest contract, an action ID it cannot call.
- Observable impact: an agent may look for old Operation inputs/outputs or follow `operation.status` after a read that returns `callRef`/`toolRef`; recovery guidance stops at an unregistered action and the public Tool → Quote → Call vocabulary is contradicted.
- Minimal correction direction: describe the omitted data as Call inputs/results or Call data according to the intended privacy contract, and point the continuation at the existing `call.status` action. Add a contract/manifest assertion that account activity contains no retired `operation.*` action IDs.
- Counterevidence considered: `describeActionForAgent` omits `invocationContract` (`src/modules/common/action.ts:305-351`), so the stale continuation is not present in the generic MCP `tools/list` descriptor. It is still present in the action object used by the CLI manifest and in the boundary text used by MCP `tools/call` registration. The result schema itself already uses Call references, so this is an active metadata mismatch rather than a protected hash/evidence string.

## Uncertain leads and verification gaps

- `src/modules/money/funding-handoff.actions.ts:195-199` retains `safeContinuations: ['operation.invoke']`. This is clearly retired AE-owned vocabulary and should likely point at the current Tool/Call flow, but the standard MCP descriptor does not serialize `invocationContract`, and the account section of the CLI manifest does not currently include this funding action. I did not count it as a second confirmed user-facing defect without tracing a concrete emitted contract path.
- Existing authority tests cover expired credential, expired delegation grant, and expired admission scenarios, but do not cover an independently expired `agentAccessGrant`; this is the material regression-coverage gap behind F1.
- Existing action registry tests assert current/retired action IDs and output shapes, but do not inspect `safeContinuations` or account activity boundary text; this is the material contract-coverage gap behind F2.
- Issuance paths appear to derive related credential/admission/grant expiries together. That coupling reduces the frequency of F1, but it does not enforce the access-grant expiry invariant when rows are independently changed, migrated, or partially updated.

Conclusion: 2 confirmed findings (1 P1, 1 P2); 1 additional uncertain lead. 
