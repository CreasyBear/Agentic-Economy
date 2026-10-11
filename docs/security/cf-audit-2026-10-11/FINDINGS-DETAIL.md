# Findings detail (confirmed medium and above)

Source-only white-box trace; no runtime reproduction was performed and no exploit payloads are included.

## [medium] cli-release runs dependency lifecycle scripts in the job that holds id-token: write and signs the release

Fingerprint: `ci-cli-release-install-scripts-with-id-token`

**Trace**
  1. `.github/workflows/cli-release.yml:45` (sink) cli-release runs dependency lifecycle scripts in the job that holds id-token: write and signs the release

**Evidence**
  - `.github/workflows/cli-release.yml:45` The publish job grants id-token: write at job level, runs plain npm ci (lifecycle scripts enabled, 7 lockfile packages have install scripts), then npm pack (prepack builds dist/ae.js) and keyless cosign sign-blob in the 

**Root cause:** Install-time code from lockfile dependencies executes in a job that also holds OIDC signing authority and builds the signed artifact; kernel-release-gate.yml uses npm ci --ignore-scripts for the same reason.

**Intended behavior:** Release identity should only sign artifacts built from reviewed inputs, with no dependency install code running while OIDC token request variables are present.

**Principal and resource:** A compromised upstream release of a lockfile package with an install script (esbuild, @sentry/cli, core-js) runs during npm ci in the publish job.

**Verification performed:** Read the cited source locations on origin/main. Follow the trace from the entrypoint to the sink; no live request was sent.

**Invariant at risk / observed:** Source trace confirms the described behaviour; no runtime execution was performed under the white-box rules.

**Conditions and containment:** Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.

**Remediation:** Use npm ci --ignore-scripts in cli-release.yml, build in a job without id-token, and sign in a separate minimal job that consumes the uploaded tarball artifact.

**Regression case:** add a source-level test that exercises the cited path with a non-privileged dummy principal and asserts the intended behavior above.

## [medium] Owner-chat approval gate is satisfied by any mention of the Tool ref in user text

Fingerprint: `convex-chat-call-approval-substring-gate`

**Trace**
  1. `convex/chatCall.ts:199` (sink) Owner-chat approval gate is satisfied by any mention of the Tool ref in user text

**Evidence**
  - `convex/chatCall.ts:199` requireApproval is cleared when the latest user message merely contains the toolRef. Owner-chat authority is spending_policy, so a model steered by provider text can quote and call or run a plan after a non-purchase ques

**Root cause:** A substring match on the user message is treated as purchase intent and plan.run has no user-text check.

**Intended behavior:** Calls without explicit owner purchase intent should require owner approval.

**Principal and resource:** Owner asks a read-only question containing operation:v1:<hex>; injected listing text steers the model to tool.quote then tool.call.

**Verification performed:** Read the cited source locations on origin/main. Follow the trace from the entrypoint to the sink; no live request was sent.

**Invariant at risk / observed:** Source trace confirms the described behaviour; no runtime execution was performed under the white-box rules.

**Conditions and containment:** Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.

**Remediation:** Require an explicit purchase action (UI approval or structured intent) rather than substring inclusion, and enforce the read-only intent in code for plan run.

**Regression case:** add a source-level test that exercises the cited path with a non-privileged dummy principal and asserts the intended behavior above.

## [medium] Published tools of a closed or retired owner stay listed, quotable and routeable

Fingerprint: `convex-closed-owner-tools-stay-routeable`

**Trace**
  1. `convex/lib/capabilitySupply/currentTool/reads.ts:126` (sink) Published tools of a closed or retired owner stay listed, quotable and routeable

**Evidence**
  - `convex/lib/capabilitySupply/currentTool/reads.ts:126` Close and retire never touch businesses, publications or provider connections, and readCurrentPublishedTool, qualification and quote paths check publicStatus and freeze only, never account lifecycle. The UI copy says Too

**Root cause:** No account lifecycle predicate on the publication read path and no offboarding on close.

**Intended behavior:** Closed workspaces' Tools stop.

**Principal and resource:** Public catalog read and Quote after workspace close.

**Verification performed:** Read the cited source locations on origin/main. Follow the trace from the entrypoint to the sink; no live request was sent.

**Invariant at risk / observed:** Source trace confirms the described behaviour; no runtime execution was performed under the white-box rules.

**Conditions and containment:** Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.

**Remediation:** Start offboarding or unpublish on close and add an account-active check to readCurrentPublishedTool.

**Regression case:** add a source-level test that exercises the cited path with a non-privileged dummy principal and asserts the intended behavior above.

## [medium] Owner approval for managed x402 Tools can never succeed

Fingerprint: `convex-managed-x402-approval-unreachable`

**Trace**
  1. `convex/lib/capabilityExecution/callLifecycle/admissionApprovals.ts:361` (sink) Owner approval for managed x402 Tools can never succeed

**Evidence**
  - `convex/lib/capabilityExecution/callLifecycle/admissionApprovals.ts:361` pricingConfigDecisionAmount is undefined for managed_x402, so the authority request lacks maximumSpend and approvalRequestMatches returns false; approval is refused with invocation_invalid after the owner sees a quote pr

**Root cause:** Quote-time authority request and approval match disagree on maximumSpend for managed pricing.

**Intended behavior:** An owner-approved managed x402 call should dispatch.

**Principal and resource:** Approval-required agent calls a managed_x402 Tool, then the owner approves.

**Verification performed:** Read the cited source locations on origin/main. Follow the trace from the entrypoint to the sink; no live request was sent.

**Invariant at risk / observed:** Source trace confirms the described behaviour; no runtime execution was performed under the white-box rules.

**Conditions and containment:** Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.

**Remediation:** Carry quote.decisionAudUnits into maximumSpend for managed_x402 requests.

**Regression case:** add a source-level test that exercises the cited path with a non-privileged dummy principal and asserts the intended behavior above.

## [medium] Personal retire does not close the account, so a retired owner blocks all members

Fingerprint: `convex-retire-does-not-close-owned-account`

**Trace**
  1. `convex/lib/principalAccount/personalAccount/retire.ts:135` (sink) Personal retire does not close the account, so a retired owner blocks all members

**Evidence**
  - `convex/lib/principalAccount/personalAccount/retire.ts:135` Retire marks the principal retired but leaves the account and ownership active, so requireCurrentOwnerActive denies every member. The deletion eligibility rule is dead code with no caller. Fail-closed availability and li

**Root cause:** No last-owner check or ownership transfer or close in retire.

**Intended behavior:** Workspace members keep access or the account closes cleanly.

**Principal and resource:** Clerk user.deleted for the current owner of a populated workspace.

**Verification performed:** Read the cited source locations on origin/main. Follow the trace from the entrypoint to the sink; no live request was sent.

**Invariant at risk / observed:** Source trace confirms the described behaviour; no runtime execution was performed under the white-box rules.

**Conditions and containment:** Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.

**Remediation:** Enforce eligibility server-side and transfer or close the account before retiring an owner.

**Regression case:** add a source-level test that exercises the cited path with a non-privileged dummy principal and asserts the intended behavior above.

## [medium] Retire revokes machine agents with a silent 64 cap and skips agents lacking ownerTokenIdentifier

Fingerprint: `convex-retire-machine-agent-cap-and-owner-match`

**Trace**
  1. `convex/lib/principalAccount/personalAccount/retireDependents.ts:30` (sink) Retire revokes machine agents with a silent 64 cap and skips agents lacking ownerTokenIdentifier

**Evidence**
  - `convex/lib/principalAccount/personalAccount/retireDependents.ts:30` Cascade breaks at 64 agents silently and skips agents whose ownerTokenIdentifier differs or is undefined, so survivors keep grants, credentials and refresh families, which can still rotate credentials. Call admission sti

**Root cause:** Bounded cascade without continuation or fallback to membership creator.

**Intended behavior:** All dependent credentials revoked on retire.

**Principal and resource:** Retire an owner with over 64 agents or agents without ownerTokenIdentifier.

**Verification performed:** Read the cited source locations on origin/main. Follow the trace from the entrypoint to the sink; no live request was sent.

**Invariant at risk / observed:** Source trace confirms the described behaviour; no runtime execution was performed under the white-box rules.

**Conditions and containment:** Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.

**Remediation:** Page through all agents, reuse the machineCascade fallback, and fail loudly when work remains.

**Regression case:** add a source-level test that exercises the cited path with a non-privileged dummy principal and asserts the intended behavior above.

## [medium] x402 prepare_authorization accepts payee, amount and endpoint not bound to the issued ticket

Fingerprint: `convex-x402-prepare-authorization-unbound`

**Trace**
  1. `convex/lib/capabilityExecution/providerConsequence/httpX402.ts:79` (sink) x402 prepare_authorization accepts payee, amount and endpoint not bound to the issued ticket

**Evidence**
  - `convex/lib/capabilityExecution/providerConsequence/httpX402.ts:79` The prepare branch overwrites only identity fields; payTo, amountUnits, providerEndpoint and challenge fields are caller supplied and matchingOptionalIdentity does not cover them. The ticket claims carry no payee or amou

**Root cause:** Server never compares payment fields to the quoted requirement or ticket claims.

**Intended behavior:** Payment authorization should match the quoted requirement.

**Principal and resource:** prepare_authorization RPC with a valid journal token and a different payTo.

**Verification performed:** Read the cited source locations on origin/main. Follow the trace from the entrypoint to the sink; no live request was sent.

**Invariant at risk / observed:** Source trace confirms the described behaviour; no runtime execution was performed under the white-box rules.

**Conditions and containment:** Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.

**Remediation:** Verify payTo, amount, endpoint and challenge digest against the quoted requirement inside the prepare step.

**Regression case:** add a source-level test that exercises the cited path with a non-privileged dummy principal and asserts the intended behavior above.

## [medium] Retryable quote refusal permanently terminalises the procurement idempotency key

Fingerprint: `src-procure-quote-refusal-terminalises-key`

**Trace**
  1. `src/modules/capability-execution/procure-engine.ts:313` (sink) Retryable quote refusal permanently terminalises the procurement idempotency key

**Evidence**
  - `src/modules/capability-execution/procure-engine.ts:313` A quote refusal with retryable true completes the operation key as failed_terminal; same-key retries replay the stored refusal forever. The call-refusal branch deliberately does not terminalise. No money moves.

**Root cause:** Quote refusal path uses finish() without a retryable exception.

**Intended behavior:** Retryable refusals can be retried with the same key.

**Principal and resource:** procure with a quote that returns inspection_unavailable, then retry.

**Verification performed:** Read the cited source locations on origin/main. Follow the trace from the entrypoint to the sink; no live request was sent.

**Invariant at risk / observed:** Source trace confirms the described behaviour; no runtime execution was performed under the white-box rules.

**Conditions and containment:** Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.

**Remediation:** Do not terminalise the key when retryable, matching the call refusal branch.

**Regression case:** add a source-level test that exercises the cited path with a non-privileged dummy principal and asserts the intended behavior above.

## [medium] Proven-unused x402 authorization can never complete recovery

Fingerprint: `src-x402-recovery-unused-forces-outcome-unknown`

**Trace**
  1. `src/modules/capability-execution/call-worker/recovery/x402.ts:404` (sink) Proven-unused x402 authorization can never complete recovery

**Evidence**
  - `src/modules/capability-execution/call-worker/recovery/x402.ts:404` After reconcileX402PaymentAttempt commits the spend as unused, persistX402Money still sees settlementStatus not settled, marks the managed call outcome_unknown and returns false, so recovery returns reconciliation_requir

**Root cause:** Branch at line 404 is reached for the unused path and contradicts the intended release.

**Intended behavior:** Proven unused authorizations should release spend and complete recovery.

**Principal and resource:** Recovery of an authorization proven expired or cancelled.

**Verification performed:** Read the cited source locations on origin/main. Follow the trace from the entrypoint to the sink; no live request was sent.

**Invariant at risk / observed:** Source trace confirms the described behaviour; no runtime execution was performed under the white-box rules.

**Conditions and containment:** Bounded impact as described; no cross-tenant read or unbounded spend demonstrated.

**Remediation:** Handle expired_unused and authorization_cancelled by releasing the managed reservation and reconciling as released.

**Regression case:** add a source-level test that exercises the cited path with a non-privileged dummy principal and asserts the intended behavior above.
